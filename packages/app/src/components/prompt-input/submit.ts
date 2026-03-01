import type { Message } from "@openhei-ai/sdk/v2/client"
import { showToast } from "@openhei-ai/ui/toast"
import { base64Encode } from "@openhei-ai/util/encode"
import { useNavigate, useParams } from "@solidjs/router"
import type { Accessor } from "solid-js"
import type { FileSelection } from "@/context/file"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useLocal } from "@/context/local"
import { type ImageAttachmentPart, type Prompt, usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { useSync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { buildRequestParts } from "./build-request-parts"
import { setCursorPosition } from "./editor-dom"
import { Persist, removePersisted } from "@/utils/persist"
import { usePlatform } from "@/context/platform"
import { isNotFoundError } from "@/utils/api-error"
import { draftKey, removeDraft } from "./draft-persist"

type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
}

const pending = new Map<string, PendingPrompt>()

const pendingSyncs = new Map<string, ReturnType<typeof setTimeout>>()
const SYNC_DEBOUNCE_MS = 250

const debouncedSync = (sessionID: string, syncFn: () => Promise<void>) => {
  const existing = pendingSyncs.get(sessionID)
  if (existing) clearTimeout(existing)
  pendingSyncs.set(
    sessionID,
    setTimeout(() => {
      pendingSyncs.delete(sessionID)
      syncFn().catch((e) => {
        if (import.meta.env.DEV) {
          console.warn("[sync] failed", e ?? "(null)")
        }
      })
    }, SYNC_DEBOUNCE_MS),
  )
}

type PromptSubmitInput = {
  info: Accessor<{ id: string } | undefined>
  imageAttachments: Accessor<ImageAttachmentPart[]>
  commentCount: Accessor<number>
  mode: Accessor<"normal" | "shell">
  working: Accessor<boolean>
  editor: () => HTMLDivElement | undefined
  queueScroll: () => void
  promptLength: (prompt: Prompt) => number
  addToHistory: (prompt: Prompt, mode: "normal" | "shell") => void
  resetHistoryNavigation: () => void
  setMode: (mode: "normal" | "shell") => void
  setPopover: (popover: "at" | "slash" | null) => void
  newSessionWorktree?: Accessor<string | undefined>
  onNewSessionWorktreeReset?: () => void
  onSubmit?: () => void
  selectedSendOption?: () => string | undefined
}

type CommentItem = {
  path: string
  selection?: FileSelection
  comment?: string
  commentID?: string
  commentOrigin?: "review" | "file"
  preview?: string
}

export function createPromptSubmit(input: PromptSubmitInput) {
  const navigate = useNavigate()
  const sdk = useSDK()
  const settings = useSettings()
  const sync = useSync()
  const globalSync = useGlobalSync()
  const local = useLocal()
  const prompt = usePrompt()
  const layout = useLayout()
  const language = useLanguage()
  const params = useParams()
  const platform = usePlatform()

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const abort = async () => {
    const sessionID = params.id
    if (!sessionID) return Promise.resolve()

    globalSync.todo.set(sessionID, [])
    const [, setStore] = globalSync.child(sdk.directory)
    setStore("todo", sessionID, [])

    const queued = pending.get(sessionID)
    if (queued) {
      queued.abort.abort()
      queued.cleanup()
      pending.delete(sessionID)
      return Promise.resolve()
    }
    return sdk.client.session
      .abort({
        sessionID,
      })
      .catch(() => {})
  }

  const restoreCommentItems = (items: CommentItem[]) => {
    for (const item of items) {
      prompt.context.add({
        type: "file",
        path: item.path,
        selection: item.selection,
        comment: item.comment,
        commentID: item.commentID,
        commentOrigin: item.commentOrigin,
        preview: item.preview,
      })
    }
  }

  const removeCommentItems = (items: { key: string }[]) => {
    for (const item of items) {
      prompt.context.remove(item.key)
    }
  }

  const handleSubmit = async (event: Event) => {
    event.preventDefault()

    const currentPrompt = prompt.current()
    const text = currentPrompt.map((part) => ("content" in part ? part.content : "")).join("")
    const images = input.imageAttachments().slice()
    const mode = input.mode()

    if (text.trim().length === 0 && images.length === 0 && input.commentCount() === 0) {
      if (input.working()) abort()
      return
    }

    const currentModel = local.model.current()
    const currentAgent = local.agent.current()
    const chatOnly = settings.general.chatMode() === "chat_only"

    // If Chat-only mode is active, disallow agent/tool actions and avoid sending
    // any agent/tools metadata to the server. Require only model for basic chat.
    if (!currentModel || (!chatOnly && !currentAgent)) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      // Ensure we clean up any pending UI state if we abort early
      input.onSubmit?.()
      return
    }

    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    const projectDirectory = sdk.directory
    const isNewSession = !params.id
    const worktreeSelection = input.newSessionWorktree?.() || "main"

    let sessionDirectory = projectDirectory
    let client = sdk.client

    if (isNewSession) {
      if (worktreeSelection === "create") {
        const createdWorktree = await client.worktree
          .create({ directory: projectDirectory })
          .then((x) => x.data)
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.worktreeCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        if (!createdWorktree?.directory) {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return
        }
        WorktreeState.pending(createdWorktree.directory)
        sessionDirectory = createdWorktree.directory
      }

      if (worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      if (sessionDirectory !== projectDirectory) {
        client = sdk.createClient({
          directory: sessionDirectory,
          throwOnError: true,
        })
        globalSync.child(sessionDirectory)
      }

      input.onNewSessionWorktreeReset?.()
    }

    const ensure = async () => {
      const existing = input.info()
      if (existing) return existing

      if (isNewSession) {
        const created = await client.session
          .create()
          .then((x) => x.data ?? undefined)
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.sessionCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        if (created) {
          layout.handoff.setTabs(base64Encode(sessionDirectory), created.id)
          navigate(`/${base64Encode(sessionDirectory)}/session/${created.id}`)
        }
        return created
      }

      const id = params.id
      if (!id) return

      const loaded = await client.session
        .get({ sessionID: id })
        .then((x) => x.data ?? undefined)
        .catch(async (err) => {
          if (!isNotFoundError(err)) throw err

          if (import.meta.env.DEV) {
            console.info("[session] not found; recreating", {
              url: `${sdk.url}/session/${id}`,
              sessionID: id,
            })
          }

          removePersisted(Persist.session(sdk.directory, id, "prompt"), platform)
          removePersisted(Persist.session(sdk.directory, id, "file-view"), platform)

          const created = await client.session.create().then((x) => x.data ?? undefined)
          if (!created?.id) return

          showToast({
            title: language.t("prompt.toast.sessionRecovered.title"),
            description: language.t("prompt.toast.sessionRecovered.description"),
          })

          navigate(`/${base64Encode(sessionDirectory)}/session/${created.id}`, { replace: true })
          return created
        })

      return loaded
    }

    const session = await ensure().catch((err) => {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: errorMessage(err),
      })
      return undefined
    })

    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    input.onSubmit?.()

    const model = {
      modelID: currentModel.id,
      providerID: currentModel.provider.id,
    }
    const agent = chatOnly ? undefined : currentAgent!.name
    const variant = local.model.variant.current()

    const clearInput = () => {
      prompt.reset()
      input.setMode("normal")
      input.setPopover(null)
    }

    const restoreInput = () => {
      prompt.set(currentPrompt, input.promptLength(currentPrompt))
      input.setMode(mode)
      input.setPopover(null)
      requestAnimationFrame(() => {
        const editor = input.editor()
        if (!editor) return
        editor.focus()
        setCursorPosition(editor, input.promptLength(currentPrompt))
        input.queueScroll()
      })
    }

    if (mode === "shell") {
      if (chatOnly) {
        showToast({
          title: language.t("prompt.toast.promptSendFailed.title"),
          description: "Tools are disabled in Chat-only mode. Switch to Agent mode to perform actions.",
        })
        return
      }
      clearInput()
      client.session
        .shell({
          sessionID: session.id,
          agent: agent as string,
          model,
          command: text,
        })
        .then(() => {
          // Ensure messages are synced after shell command
          if (session.id) {
            debouncedSync(session.id, () => (sync.session.sync ? sync.session.sync(session.id) : Promise.resolve()))
          }
        })
        .catch((err) => {
          showToast({
            title: language.t("prompt.toast.shellSendFailed.title"),
            description: errorMessage(err),
          })
          restoreInput()
        })
      return
    }

    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ")
      const commandName = cmdName.slice(1)
      const customCommand = sync.data.command.find((c) => c.name === commandName)
      if (customCommand) {
        if (chatOnly) {
          showToast({
            title: language.t("prompt.toast.commandSendFailed.title"),
            description: "Tools are disabled in Chat-only mode. Switch to Agent mode to perform actions.",
          })
          return
        }
        clearInput()
        client.session
          .command({
            sessionID: session.id,
            command: commandName,
            arguments: args.join(" "),
            agent: agent as string,
            model: `${model.providerID}/${model.modelID}`,
            variant,
            parts: images.map((attachment) => ({
              id: Identifier.ascending("part"),
              type: "file" as const,
              mime: attachment.mime,
              url: attachment.dataUrl,
              filename: attachment.filename,
            })),
          })
          .then(() => {
            // Ensure messages are synced after custom command
            if (session.id) {
              debouncedSync(session.id, () => (sync.session.sync ? sync.session.sync(session.id) : Promise.resolve()))
            }
          })
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: errorMessage(err),
            })
            restoreInput()
          })
        return
      }
    }

    const context = prompt.context.items().slice()
    const commentItems = context.filter((item) => item.type === "file" && !!item.comment?.trim())

    const messageID = Identifier.ascending("message")
    // The selected send option is provided by the PromptInput component when
    // creating the submit handler. If no option is supplied, it will be
    // undefined and omitted from the metadata.
    const selectedSendOption = input.selectedSendOption?.()

    const { requestParts, optimisticParts } = buildRequestParts({
      prompt: currentPrompt,
      context,
      images,
      text,
      sessionID: session.id,
      messageID,
      sessionDirectory,
      sendOption: selectedSendOption,
    })

    // Build optimistic message as `any` to avoid strict typing issues for the
    // transient optimistic object (agent may be omitted in chat-only).
    const optimisticMessage: any = {
      id: messageID,
      sessionID: session.id,
      role: "user",
      time: { created: Date.now() },
      model,
    }
    if (agent) optimisticMessage.agent = agent

    const addOptimisticMessage = () =>
      sync.session.optimistic.add({
        directory: sessionDirectory,
        sessionID: session.id,
        message: optimisticMessage,
        parts: optimisticParts,
      })

    const removeOptimisticMessage = () =>
      sync.session.optimistic.remove({
        directory: sessionDirectory,
        sessionID: session.id,
        messageID,
      })

    removeCommentItems(commentItems)
    clearInput()
    addOptimisticMessage()

    // Attempt to clear persisted draft (best-effort; must not throw)
    try {
      const key = draftKey(sessionDirectory, session.id)
      removeDraft(key)
    } catch (e) {
      // ignore
    }

    const waitForWorktree = async () => {
      const worktree = WorktreeState.get(sessionDirectory)
      if (!worktree || worktree.status !== "pending") return true

      if (sessionDirectory === projectDirectory) {
        sync.set("session_status", session.id, { type: "busy" })
      }

      const controller = new AbortController()
      const cleanup = () => {
        if (sessionDirectory === projectDirectory) {
          sync.set("session_status", session.id, { type: "idle" })
        }
        removeOptimisticMessage()
        restoreCommentItems(commentItems)
        restoreInput()
      }

      pending.set(session.id, { abort: controller, cleanup })

      const abortWait = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        if (controller.signal.aborted) {
          resolve({ status: "failed", message: "aborted" })
          return
        }
        controller.signal.addEventListener(
          "abort",
          () => {
            resolve({ status: "failed", message: "aborted" })
          },
          { once: true },
        )
      })

      const timeoutMs = 5 * 60 * 1000
      const timer = { id: undefined as number | undefined }
      const timeout = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        timer.id = window.setTimeout(() => {
          resolve({
            status: "failed",
            message: language.t("workspace.error.stillPreparing"),
          })
        }, timeoutMs)
      })

      const result = await Promise.race([WorktreeState.wait(sessionDirectory), abortWait, timeout]).finally(() => {
        if (timer.id === undefined) return
        clearTimeout(timer.id)
      })
      pending.delete(session.id)
      if (controller.signal.aborted) return false
      if (result.status === "failed") throw new Error(result.message)
      return true
    }

    const send = async () => {
      const ok = await waitForWorktree()
      if (!ok) return
      try {
        // If chat-only is enabled, write a single diagnostic log entry (no secrets)
        if (chatOnly) {
          // Write a single diagnostic log entry (no secrets)
          void client.app
            .log({
              service: "mode",
              level: "info",
              message: "[mode] chat_only — tools disabled by user",
            })
            .catch(() => {})
        }

        // When chat-only mode is enabled, strip any agent/tool parts from the
        // outgoing parts array so that no tool metadata can be sent to the
        // backend. This is mandatory to ensure the request payload contains
        // zero tool-related fields in parts.
        const filteredParts = chatOnly
          ? requestParts.filter((p) => {
              const t = (p as any).type
              return t !== "agent" && t !== "tool"
            })
          : requestParts

        const body: any = {
          sessionID: session.id,
          model,
          messageID,
          parts: filteredParts,
          variant,
        }
        // Only include top-level agent when not in chat-only mode. Do not set
        // any tool/tool_choice aliases here.
        if (agent) body.agent = agent

        await client.session.promptAsync(body)
        // Ensure messages are synced after sending prompt
        // This provides a fallback in case SSE events are delayed/not received
        if (session.id) {
          debouncedSync(session.id, () => (sync.session.sync ? sync.session.sync(session.id) : Promise.resolve()))
        }
      } catch (e) {
        // Let the existing error handler deal with this
        throw e
      }
    }

    return send().catch((err) => {
      pending.delete(session.id)
      if (sessionDirectory === projectDirectory) {
        sync.set("session_status", session.id, { type: "idle" })
      }
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: errorMessage(err),
      })
      removeOptimisticMessage()
      restoreCommentItems(commentItems)
      restoreInput()
    })
  }

  return {
    abort,
    handleSubmit,
  }
}
