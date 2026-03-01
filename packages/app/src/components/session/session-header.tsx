import { createEffect, createMemo, For, onCleanup, Show, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Portal } from "solid-js/web"
import { useParams, useNavigate } from "@solidjs/router"
import { useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { getFilename } from "@openhei-ai/util/path"
import { decode64 } from "@/utils/base64"
import { Persist, persisted } from "@/utils/persist"
import { Binary } from "@openhei-ai/util/binary"
import type { Session } from "@openhei-ai/sdk/v2/client"

import { Icon } from "@openhei-ai/ui/icon"
import { IconButton } from "@openhei-ai/ui/icon-button"
import { Button } from "@openhei-ai/ui/button"
import { AppIcon } from "@openhei-ai/ui/app-icon"
import { DropdownMenu } from "@openhei-ai/ui/dropdown-menu"
import { Tooltip, TooltipKeybind } from "@openhei-ai/ui/tooltip"
import { Popover } from "@openhei-ai/ui/popover"
import { TextField } from "@openhei-ai/ui/text-field"
import { Keybind } from "@openhei-ai/ui/keybind"
import { showToast } from "@openhei-ai/ui/toast"
import { StatusPopover } from "../status-popover"

const OPEN_APPS = [
  "vscode",
  "cursor",
  "zed",
  "textmate",
  "antigravity",
  "finder",
  "terminal",
  "iterm2",
  "ghostty",
  "xcode",
  "android-studio",
  "powershell",
  "sublime-text",
] as const

type OpenApp = (typeof OPEN_APPS)[number]
type OS = "macos" | "windows" | "linux" | "unknown"

const MAC_APPS = [
  { id: "vscode", label: "VS Code", icon: "vscode", openWith: "Visual Studio Code" },
  { id: "cursor", label: "Cursor", icon: "cursor", openWith: "Cursor" },
  { id: "zed", label: "Zed", icon: "zed", openWith: "Zed" },
  { id: "textmate", label: "TextMate", icon: "textmate", openWith: "TextMate" },
  { id: "antigravity", label: "Antigravity", icon: "antigravity", openWith: "Antigravity" },
  { id: "terminal", label: "Terminal", icon: "terminal", openWith: "Terminal" },
  { id: "iterm2", label: "iTerm2", icon: "iterm2", openWith: "iTerm" },
  { id: "ghostty", label: "Ghostty", icon: "ghostty", openWith: "Ghostty" },
  { id: "xcode", label: "Xcode", icon: "xcode", openWith: "Xcode" },
  { id: "android-studio", label: "Android Studio", icon: "android-studio", openWith: "Android Studio" },
  { id: "sublime-text", label: "Sublime Text", icon: "sublime-text", openWith: "Sublime Text" },
] as const

const WINDOWS_APPS = [
  { id: "vscode", label: "VS Code", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "Cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "Zed", icon: "zed", openWith: "zed" },
  { id: "powershell", label: "PowerShell", icon: "powershell", openWith: "powershell" },
  { id: "sublime-text", label: "Sublime Text", icon: "sublime-text", openWith: "Sublime Text" },
] as const

const LINUX_APPS = [
  { id: "vscode", label: "VS Code", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "Cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "Zed", icon: "zed", openWith: "zed" },
  { id: "sublime-text", label: "Sublime Text", icon: "sublime-text", openWith: "Sublime Text" },
] as const

type OpenOption = (typeof MAC_APPS)[number] | (typeof WINDOWS_APPS)[number] | (typeof LINUX_APPS)[number]
type OpenIcon = OpenApp | "file-explorer"
const OPEN_ICON_BASE = new Set<OpenIcon>(["finder", "vscode", "cursor", "zed"])

const openIconSize = (id: OpenIcon) => (OPEN_ICON_BASE.has(id) ? "size-4" : "size-[19px]")

const detectOS = (platform: ReturnType<typeof usePlatform>): OS => {
  if (platform.platform === "desktop" && platform.os) return platform.os
  if (typeof navigator !== "object") return "unknown"
  const value = navigator.platform || navigator.userAgent
  if (/Mac/i.test(value)) return "macos"
  if (/Win/i.test(value)) return "windows"
  if (/Linux/i.test(value)) return "linux"
  return "unknown"
}

const showRequestError = (language: ReturnType<typeof useLanguage>, err: unknown) => {
  showToast({
    variant: "error",
    title: language.t("common.requestFailed"),
    description: err instanceof Error ? err.message : String(err),
  })
}

function useSessionShare(args: {
  globalSDK: ReturnType<typeof useGlobalSDK>
  currentSession: () =>
    | {
        id: string
        share?: {
          url?: string
        }
      }
    | undefined
  projectDirectory: () => string
  platform: ReturnType<typeof usePlatform>
}) {
  const [state, setState] = createStore({
    share: false,
    unshare: false,
    copied: false,
    timer: undefined as number | undefined,
  })
  const shareUrl = createMemo(() => args.currentSession()?.share?.url)

  createEffect(() => {
    const url = shareUrl()
    if (url) return
    if (state.timer) window.clearTimeout(state.timer)
    setState({ copied: false, timer: undefined })
  })

  onCleanup(() => {
    if (state.timer) window.clearTimeout(state.timer)
  })

  const shareSession = () => {
    const session = args.currentSession()
    if (!session || state.share) return
    setState("share", true)
    args.globalSDK.client.session
      .share({ sessionID: session.id, directory: args.projectDirectory() })
      .catch((error) => {
        console.error("Failed to share session", error)
      })
      .finally(() => {
        setState("share", false)
      })
  }

  const unshareSession = () => {
    const session = args.currentSession()
    if (!session || state.unshare) return
    setState("unshare", true)
    args.globalSDK.client.session
      .unshare({ sessionID: session.id, directory: args.projectDirectory() })
      .catch((error) => {
        console.error("Failed to unshare session", error)
      })
      .finally(() => {
        setState("unshare", false)
      })
  }

  const copyLink = (onError: (error: unknown) => void) => {
    const url = shareUrl()
    if (!url) return
    navigator.clipboard
      .writeText(url)
      .then(() => {
        if (state.timer) window.clearTimeout(state.timer)
        setState("copied", true)
        const timer = window.setTimeout(() => {
          setState("copied", false)
          setState("timer", undefined)
        }, 3000)
        setState("timer", timer)
      })
      .catch(onError)
  }

  const viewShare = () => {
    const url = shareUrl()
    if (!url) return
    args.platform.openLink(url)
  }

  return { state, shareUrl, shareSession, unshareSession, copyLink, viewShare }
}

export function SessionHeader() {
  const globalSDK = useGlobalSDK()
  const layout = useLayout()
  const params = useParams()
  const command = useCommand()
  const server = useServer()
  const sync = useSync()
  const platform = usePlatform()
  const language = useLanguage()
  const settings = useSettings()

  const projectDirectory = createMemo(() => decode64(params.dir) ?? "")
  const project = createMemo(() => {
    const directory = projectDirectory()
    if (!directory) return
    return layout.projects.list().find((p) => p.worktree === directory || p.sandboxes?.includes(directory))
  })
  const name = createMemo(() => {
    const current = project()
    if (current) return current.name || getFilename(current.worktree)
    return getFilename(projectDirectory())
  })
  const hotkey = createMemo(() => command.keybind("file.open"))

  const currentSession = createMemo(() => sync.data.session.find((s) => s.id === params.id))
  const shareEnabled = createMemo(() => sync.data.config.share !== "disabled")
  const showShare = createMemo(() => shareEnabled() && !!currentSession())
  const sessionKey = createMemo(() => `${params.dir}${params.id ? "/" + params.id : ""}`)
  const view = createMemo(() => layout.view(sessionKey))
  const os = createMemo(() => detectOS(platform))

  const [exists, setExists] = createStore<Partial<Record<OpenApp, boolean>>>({ finder: true })

  const apps = createMemo(() => {
    if (os() === "macos") return MAC_APPS
    if (os() === "windows") return WINDOWS_APPS
    return LINUX_APPS
  })

  const fileManager = createMemo(() => {
    if (os() === "macos") return { label: "Finder", icon: "finder" as const }
    if (os() === "windows") return { label: "File Explorer", icon: "file-explorer" as const }
    return { label: "File Manager", icon: "finder" as const }
  })

  createEffect(() => {
    if (platform.platform !== "desktop") return
    if (!platform.checkAppExists) return

    const list = apps()

    setExists(Object.fromEntries(list.map((app) => [app.id, undefined])) as Partial<Record<OpenApp, boolean>>)

    void Promise.all(
      list.map((app) =>
        Promise.resolve(platform.checkAppExists?.(app.openWith))
          .then((value) => Boolean(value))
          .catch(() => false)
          .then((ok) => {
            console.debug(`[session-header] App "${app.label}" (${app.openWith}): ${ok ? "exists" : "does not exist"}`)
            return [app.id, ok] as const
          }),
      ),
    ).then((entries) => {
      setExists(Object.fromEntries(entries) as Partial<Record<OpenApp, boolean>>)
    })
  })

  const options = createMemo(() => {
    return [
      { id: "finder", label: fileManager().label, icon: fileManager().icon },
      ...apps().filter((app) => exists[app.id]),
    ] as const
  })

  const [prefs, setPrefs] = persisted(Persist.global("open.app"), createStore({ app: "finder" as OpenApp }))
  const [menu, setMenu] = createStore({ open: false })

  const canOpen = createMemo(() => platform.platform === "desktop" && !!platform.openPath && server.isLocal())
  const current = createMemo(() => options().find((o) => o.id === prefs.app) ?? options()[0])

  const openDir = (app: OpenApp) => {
    const directory = projectDirectory()
    if (!directory) return
    if (!canOpen()) return

    const item = options().find((o) => o.id === app)
    const openWith = item && "openWith" in item ? item.openWith : undefined
    Promise.resolve(platform.openPath?.(directory, openWith)).catch((err: unknown) => showRequestError(language, err))
  }

  const copyPath = () => {
    const directory = projectDirectory()
    if (!directory) return
    navigator.clipboard
      .writeText(directory)
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.share.copy.copied"),
          description: directory,
        })
      })
      .catch((err: unknown) => showRequestError(language, err))
  }

  const share = useSessionShare({
    globalSDK,
    currentSession,
    projectDirectory,
    platform,
  })

  // Session dropdown state and functions
  const navigate = useNavigate()
  const [sessionMenuOpen, setSessionMenuOpen] = createSignal(false)
  const [confirmDelete, setConfirmDelete] = createSignal<Session | null>(null)
  const [deleting, setDeleting] = createSignal(false)

  // Get sessions from sync context for this directory
  const sessions = createMemo(() => {
    const dir = projectDirectory()
    if (!dir) return []
    return sync.data.session.filter((s) => s.directory === dir && !s.time?.archived)
  })

  // Archive session (soft delete)
  const archiveSession = async (session: Session) => {
    const sessionList = sessions()
    const index = sessionList.findIndex((s) => s.id === session.id)
    const nextSession = sessionList[index + 1] ?? sessionList[index - 1]

    setDeleting(true)
    try {
      await sync.session.archive(session.id)

      showToast({
        variant: "success",
        icon: "circle-check",
        title: "Session archived",
        description: session.title || session.id,
      })

      // Navigate away if we deleted current session
      if (session.id === params.id) {
        if (nextSession) {
          navigate(`/${params.dir}/session/${nextSession.id}`)
        } else {
          navigate(`/${params.dir}/session`)
        }
      }
    } catch (err) {
      showRequestError(language, err)
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  // Format session display name
  const formatSessionName = (session: Session) => {
    if (session.title) return session.title
    const date = new Date(session.time.created)
    return `Session — ${date.toLocaleString()}`
  }

  // Get session status indicator - returns true if session is busy/active
  const isSessionActive = (session: Session) => {
    const status = sync.data.session_status[session.id]
    return status?.type === "busy" || status?.type === "replay"
  }

  const centerMount = createMemo(() => document.getElementById("openhei-titlebar-center"))
  const rightMount = createMemo(() => document.getElementById("openhei-titlebar-right"))

  return (
    <>
      <Show when={centerMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <Button
              type="button"
              variant="ghost"
              size="small"
              class="hidden md:flex w-[240px] max-w-full min-w-0 pl-0.5 pr-2 items-center gap-2 justify-between rounded-md border border-border-weak-base bg-surface-panel shadow-none cursor-default"
              onClick={() => command.trigger("file.open")}
              aria-label={language.t("session.header.searchFiles")}
            >
              <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
                <Icon name="magnifying-glass" size="small" class="icon-base shrink-0 size-4" />
                <span class="flex-1 min-w-0 text-12-regular text-text-weak truncate text-left">
                  {language.t("session.header.search.placeholder", { project: name() })}
                </span>
              </div>

              <Show when={hotkey()}>
                {(keybind) => (
                  <Keybind class="shrink-0 !border-0 !bg-transparent !shadow-none px-0">{keybind()}</Keybind>
                )}
              </Show>
            </Button>
          </Portal>
        )}
      </Show>

      {/* Session Dropdown Selector */}
      <Show when={params.id && sessions().length > 0}>
        <div class="flex items-center gap-2 px-4 py-2 border-b border-border-weak-base bg-surface-base">
          <DropdownMenu gutter={4} placement="bottom-start" open={sessionMenuOpen()} onOpenChange={setSessionMenuOpen}>
            <DropdownMenu.Trigger
              as={Button}
              variant="secondary"
              size="small"
              class="flex items-center gap-2 min-w-0 max-w-[280px] sm:max-w-[320px]"
            >
              <span class="truncate text-14-medium">{formatSessionName(currentSession()!)}</span>
              <Icon name="chevron-down" size="small" class="shrink-0" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="w-[280px] sm:w-[320px] max-h-[60vh] overflow-y-auto">
                <DropdownMenu.Group>
                  <DropdownMenu.GroupLabel>Switch session</DropdownMenu.GroupLabel>
                  <For each={sessions()}>
                    {(session) => {
                      const isActive = () => session.id === params.id
                      const active = () => isSessionActive(session)
                      return (
                        <div class="flex items-center gap-1 group">
                          <DropdownMenu.Item
                            class="flex-1 min-w-0"
                            onSelect={() => {
                              setSessionMenuOpen(false)
                              navigate(`/${params.dir}/session/${session.id}`)
                            }}
                          >
                            <div class="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                class="w-2 h-2 rounded-full shrink-0"
                                classList={{
                                  "bg-text-success": active(),
                                  "bg-text-weak": !active(),
                                }}
                              />
                              <span
                                class="truncate text-14-regular flex-1"
                                classList={{
                                  "text-text-strong": isActive(),
                                  "text-text-base": !isActive(),
                                }}
                              >
                                {formatSessionName(session)}
                              </span>
                              {isActive() && <Icon name="check-small" size="small" class="text-icon-weak shrink-0" />}
                            </div>
                          </DropdownMenu.Item>
                          <IconButton
                            icon="trash"
                            variant="ghost"
                            size="small"
                            class="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 h-8 w-8"
                            aria-label="Archive session"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDelete(session)
                              setSessionMenuOpen(false)
                            }}
                          />
                        </div>
                      )
                    }}
                  </For>
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>

          {/* Delete button for current session (visible on mobile too) */}
          <IconButton
            icon="trash"
            variant="ghost"
            size="small"
            class="shrink-0 h-8 w-8 md:hidden"
            aria-label="Archive session"
            onClick={() => {
              const cs = currentSession()
              if (cs) setConfirmDelete(cs)
            }}
          />
        </div>
      </Show>

      {/* Delete Confirmation Modal */}
      <Show when={confirmDelete()}>
        {(session) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div class="bg-surface-raised-base rounded-lg border border-border-weak-base p-6 max-w-md w-full shadow-lg">
              <h3 class="text-16-medium text-text-strong mb-2">Archive session?</h3>
              <p class="text-14-regular text-text-base mb-4">
                This will archive "{formatSessionName(session())}". You can restore it later from the session list.
              </p>
              <div class="flex flex-col sm:flex-row gap-2 justify-end">
                <Button size="small" variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting()}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="primary"
                  class="bg-text-error hover:bg-text-error/90"
                  onClick={() => void archiveSession(session())}
                  disabled={deleting()}
                >
                  {deleting() ? "Archiving..." : "Archive"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="flex items-center gap-2">
              <Show when={settings.general.chatMode() === "chat_only"}>
                <div class="ml-2 px-2 py-0.5 rounded-full text-12-regular bg-surface-panel border border-border-weak-base text-text-weak">
                  Chat-only (tools disabled)
                </div>
              </Show>
              <StatusPopover />
              <Show when={projectDirectory()}>
                <div class="hidden xl:flex items-center">
                  <Show
                    when={canOpen()}
                    fallback={
                      <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                        <Button
                          variant="ghost"
                          class="rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none"
                          onClick={copyPath}
                          aria-label={language.t("session.header.open.copyPath")}
                        >
                          <Icon name="copy" size="small" class="text-icon-base" />
                          <span class="text-12-regular text-text-strong">
                            {language.t("session.header.open.copyPath")}
                          </span>
                        </Button>
                      </div>
                    }
                  >
                    <div class="flex items-center">
                      <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                        <Button
                          variant="ghost"
                          class="rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none"
                          onClick={() => openDir(current().id)}
                          aria-label={language.t("session.header.open.ariaLabel", { app: current().label })}
                        >
                          <div class="flex size-5 shrink-0 items-center justify-center">
                            <AppIcon id={current().icon} class="size-4" />
                          </div>
                          <span class="text-12-regular text-text-strong">Open</span>
                        </Button>
                        <div class="self-stretch w-px bg-border-weak-base" />
                        <DropdownMenu
                          gutter={4}
                          placement="bottom-end"
                          open={menu.open}
                          onOpenChange={(open) => setMenu("open", open)}
                        >
                          <DropdownMenu.Trigger
                            as={IconButton}
                            icon="chevron-down"
                            variant="ghost"
                            class="rounded-none h-full w-[24px] p-0 border-none shadow-none data-[expanded]:bg-surface-raised-base-hover"
                            aria-label={language.t("session.header.open.menu")}
                          />
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content>
                              <DropdownMenu.Group>
                                <DropdownMenu.GroupLabel>{language.t("session.header.openIn")}</DropdownMenu.GroupLabel>
                                <DropdownMenu.RadioGroup
                                  value={current().id}
                                  onChange={(value) => {
                                    if (!OPEN_APPS.includes(value as OpenApp)) return
                                    setPrefs("app", value as OpenApp)
                                  }}
                                >
                                  <For each={options()}>
                                    {(o) => (
                                      <DropdownMenu.RadioItem
                                        value={o.id}
                                        onSelect={() => {
                                          setMenu("open", false)
                                          openDir(o.id)
                                        }}
                                      >
                                        <div class="flex size-5 shrink-0 items-center justify-center">
                                          <AppIcon id={o.icon} class={openIconSize(o.icon)} />
                                        </div>
                                        <DropdownMenu.ItemLabel>{o.label}</DropdownMenu.ItemLabel>
                                        <DropdownMenu.ItemIndicator>
                                          <Icon name="check-small" size="small" class="text-icon-weak" />
                                        </DropdownMenu.ItemIndicator>
                                      </DropdownMenu.RadioItem>
                                    )}
                                  </For>
                                </DropdownMenu.RadioGroup>
                              </DropdownMenu.Group>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                onSelect={() => {
                                  setMenu("open", false)
                                  copyPath()
                                }}
                              >
                                <div class="flex size-5 shrink-0 items-center justify-center">
                                  <Icon name="copy" size="small" class="text-icon-weak" />
                                </div>
                                <DropdownMenu.ItemLabel>
                                  {language.t("session.header.open.copyPath")}
                                </DropdownMenu.ItemLabel>
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>
              <Show when={showShare()}>
                <div class="flex items-center">
                  <Popover
                    title={language.t("session.share.popover.title")}
                    description={
                      share.shareUrl()
                        ? language.t("session.share.popover.description.shared")
                        : language.t("session.share.popover.description.unshared")
                    }
                    gutter={4}
                    placement="bottom-end"
                    shift={-64}
                    class="rounded-xl [&_[data-slot=popover-close-button]]:hidden"
                    triggerAs={Button}
                    triggerProps={{
                      variant: "ghost",
                      class:
                        "rounded-md h-[24px] px-3 border border-border-weak-base bg-surface-panel shadow-none data-[expanded]:bg-surface-base-active",
                      classList: {
                        "rounded-r-none": share.shareUrl() !== undefined,
                        "border-r-0": share.shareUrl() !== undefined,
                      },
                      style: { scale: 1 },
                    }}
                    trigger={<span class="text-12-regular">{language.t("session.share.action.share")}</span>}
                  >
                    <div class="flex flex-col gap-2">
                      <Show
                        when={share.shareUrl()}
                        fallback={
                          <div class="flex">
                            <Button
                              size="large"
                              variant="primary"
                              class="w-1/2"
                              onClick={share.shareSession}
                              disabled={share.state.share}
                            >
                              {share.state.share
                                ? language.t("session.share.action.publishing")
                                : language.t("session.share.action.publish")}
                            </Button>
                          </div>
                        }
                      >
                        <div class="flex flex-col gap-2">
                          <TextField
                            value={share.shareUrl() ?? ""}
                            readOnly
                            copyable
                            copyKind="link"
                            tabIndex={-1}
                            class="w-full"
                          />
                          <div class="grid grid-cols-2 gap-2">
                            <Button
                              size="large"
                              variant="secondary"
                              class="w-full shadow-none border border-border-weak-base"
                              onClick={share.unshareSession}
                              disabled={share.state.unshare}
                            >
                              {share.state.unshare
                                ? language.t("session.share.action.unpublishing")
                                : language.t("session.share.action.unpublish")}
                            </Button>
                            <Button
                              size="large"
                              variant="primary"
                              class="w-full"
                              onClick={share.viewShare}
                              disabled={share.state.unshare}
                            >
                              {language.t("session.share.action.view")}
                            </Button>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </Popover>
                  <Show when={share.shareUrl()} fallback={<div aria-hidden="true" />}>
                    <Tooltip
                      value={
                        share.state.copied
                          ? language.t("session.share.copy.copied")
                          : language.t("session.share.copy.copyLink")
                      }
                      placement="top"
                      gutter={8}
                    >
                      <IconButton
                        icon={share.state.copied ? "check" : "link"}
                        variant="ghost"
                        class="rounded-l-none h-[24px] border border-border-weak-base bg-surface-panel shadow-none"
                        onClick={() => share.copyLink((error) => showRequestError(language, error))}
                        disabled={share.state.unshare}
                        aria-label={
                          share.state.copied
                            ? language.t("session.share.copy.copied")
                            : language.t("session.share.copy.copyLink")
                        }
                      />
                    </Tooltip>
                  </Show>
                </div>
              </Show>
              <div class="flex items-center gap-1">
                <div class="hidden md:flex items-center gap-1 shrink-0">
                  <TooltipKeybind
                    title={language.t("command.terminal.toggle")}
                    keybind={command.keybind("terminal.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/terminal-toggle titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => view().terminal.toggle()}
                      aria-label={language.t("command.terminal.toggle")}
                      aria-expanded={view().terminal.opened()}
                      aria-controls="terminal-panel"
                    >
                      <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                        <Icon
                          size="small"
                          name={view().terminal.opened() ? "layout-bottom-partial" : "layout-bottom"}
                          class="group-hover/terminal-toggle:hidden"
                        />
                        <Icon
                          size="small"
                          name="layout-bottom-partial"
                          class="hidden group-hover/terminal-toggle:inline-block"
                        />
                        <Icon
                          size="small"
                          name={view().terminal.opened() ? "layout-bottom" : "layout-bottom-partial"}
                          class="hidden group-active/terminal-toggle:inline-block"
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.review.toggle")}
                    keybind={command.keybind("review.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/review-toggle titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => view().reviewPanel.toggle()}
                      aria-label={language.t("command.review.toggle")}
                      aria-expanded={view().reviewPanel.opened()}
                      aria-controls="review-panel"
                    >
                      <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                        <Icon
                          size="small"
                          name={view().reviewPanel.opened() ? "layout-right-partial" : "layout-right"}
                          class="group-hover/review-toggle:hidden"
                        />
                        <Icon
                          size="small"
                          name="layout-right-partial"
                          class="hidden group-hover/review-toggle:inline-block"
                        />
                        <Icon
                          size="small"
                          name={view().reviewPanel.opened() ? "layout-right" : "layout-right-partial"}
                          class="hidden group-active/review-toggle:inline-block"
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.fileTree.toggle")}
                    keybind={command.keybind("fileTree.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => layout.fileTree.toggle()}
                      aria-label={language.t("command.fileTree.toggle")}
                      aria-expanded={layout.fileTree.opened()}
                      aria-controls="file-tree-panel"
                    >
                      <div class="relative flex items-center justify-center size-4">
                        <Icon
                          size="small"
                          name={layout.fileTree.opened() ? "file-tree-active" : "file-tree"}
                          classList={{
                            "text-icon-strong": layout.fileTree.opened(),
                            "text-icon-weak": !layout.fileTree.opened(),
                          }}
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </>
  )
}
