import { onCleanup, Show, Match, Switch, createMemo, createEffect, on, onMount } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { useLocal } from "@/context/local"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { createStore } from "solid-js/store"
import { ResizeHandle } from "@openhei-ai/ui/resize-handle"
import { Select } from "@openhei-ai/ui/select"
import { createAutoScroll } from "@openhei-ai/ui/hooks"
import { Mark } from "@openhei-ai/ui/logo"

import { useSync } from "@/context/sync"
import { useLayout } from "@/context/layout"
import { checksum, base64Encode } from "@openhei-ai/util/encode"
import { useDialog } from "@openhei-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useNavigate, useParams } from "@solidjs/router"
import { UserMessage } from "@openhei-ai/sdk/v2"
import { useSDK } from "@/context/sdk"
import { usePrompt } from "@/context/prompt"
import { useComments } from "@/context/comments"
import { useSettings } from "@/context/settings"
import { 
  SessionHeader, 
  NewSessionView,
  ProviderStatusBanner,
  ProviderErrorCard,
  ProviderStatusIndicator 
} from "@/components/session"
import { StreamingStatus } from "@/components/session/streaming-status"
import { StreamingBanner, type BannerType } from "@/components/session/streaming-banner"
import TimelineNodes from "@/components/session/timeline-nodes/timeline-nodes"
import ErrorCard from "@/components/session/error-card/error-card"
import "@/components/session/timeline-nodes/timeline-nodes.css"
import "@/components/session/error-card/error-card.css"
import { same } from "@/utils/same"
import { createOpenReviewFile } from "@/pages/session/helpers"
import { createScrollSpy } from "@/pages/session/scroll-spy"
import { SessionReviewTab, type DiffStyle, type SessionReviewTabProps } from "@/pages/session/review-tab"
import { TerminalPanel } from "@/pages/session/terminal-panel"
import { MessageTimeline } from "@/pages/session/message-timeline"
import ToolCard from "@/components/session/tool-cards/tool-card"
import "@/components/session/tool-cards/tool-card.css"
import { useSessionCommands } from "@/pages/session/use-session-commands"
import { SessionComposerRegion, createSessionComposerState } from "@/pages/session/composer"
import { SessionMobileTabs } from "@/pages/session/session-mobile-tabs"
import { SessionSidePanel } from "@/pages/session/session-side-panel"
import { useSessionHashScroll } from "@/pages/session/use-session-hash-scroll"
import { showToast } from "@openhei-ai/ui/toast"
import { Persist, removePersisted } from "@/utils/persist"
import { usePlatform } from "@/context/platform"
import { isNotFoundError } from "@/utils/api-error"

export default function Page() {
  const layout = useLayout()
  const local = useLocal()
  const file = useFile()
  const sync = useSync()
  const dialog = useDialog()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const sdk = useSDK()
  const prompt = usePrompt()
  const comments = useComments()
  const platform = usePlatform()
  const settings = useSettings()

  const sessionStatus = createMemo(() => sync.data.session_status[params.id ?? ""] ?? { type: "idle" })
  const streamingStatusEnabled = createMemo(() => settings.current.flags["ui.streaming_status"])
  const streamBannersEnabled = createMemo(() => settings.current.flags["ui.stream_banners"])
  const toolCardsEnabled = createMemo(() => settings.current.flags["ui.tool_cards"])
  const stepTimelineEnabled = createMemo(() => settings.current.flags["ui.step_timeline"])
  const errorCardsEnabled = createMemo(() => settings.current.flags["ui.error_cards"])
  const providerStatusEnabled = createMemo(() => settings.current.flags["ui.provider_status"] ?? true)

  const [ui, setUi] = createStore({
    pendingMessage: undefined as string | undefined,
    scrollGesture: 0,
    scroll: {
      overflow: false,
      bottom: true,
    },
  })

  const composer = createSessionComposerState()

  const sessionKey = createMemo(() => `${params.dir}${params.id ? "/" + params.id : ""}`)
  const workspaceKey = createMemo(() => params.dir ?? "")
  const workspaceTabs = createMemo(() => layout.tabs(workspaceKey))
  const tabs = createMemo(() => layout.tabs(sessionKey))
  const view = createMemo(() => layout.view(sessionKey))

  createEffect(
    on(
      () => params.id,
      (id, prev) => {
        if (!id) return
        if (prev) return

        const pending = layout.handoff.tabs()
        if (!pending) return
        if (Date.now() - pending.at > 60_000) {
          layout.handoff.clearTabs()
          return
        }

        if (pending.id !== id) return
        layout.handoff.clearTabs()
        if (pending.dir !== (params.dir ?? "")) return

        const from = workspaceTabs().tabs()
        if (from.all.length === 0 && !from.active) return

        const current = tabs().tabs()
        if (current.all.length > 0 || current.active) return

        const all = normalizeTabs(from.all)

        layout.setTabs(
          sessionKey(),
          all,
          from.active ?? all[0]?.id,
        )
      },
    ),
  )

  const isMobile = createMediaQuery("(max-width: 768px)")
  const isDesktop = createMediaQuery("(min-width: 769px)")

  const [store, setStore] = createStore({
    sidebar: {
      open: true,
      width: 320,
    },
    changes: {
      open: true,
      width: 320,
    },
    newSessionWorktree: "main" as "main" | "create",
  })

  const session = createMemo(() => {
    const id = params.id
    if (!id) return undefined
    return sync.session.get(id)
  })

  // Get current session's provider ID
  const sessionProviderID = createMemo(() => {
    const s = session()
    return s?.model?.providerID
  })

  // Get messages for the session
  const sessionMessages = createMemo(() => {
    const id = params.id
    if (!id) return []
    return sync.messages.get(id) ?? []
  })

  // Get the last assistant message with an error
  const lastErrorMessage = createMemo(() => {
    const messages = sessionMessages()
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === "assistant" && msg.error) {
        return msg
      }
    }
    return undefined
  })

  // Check if there's a provider error status
  const hasProviderError = createMemo(() => {
    const status = sessionStatus()
    return status.type === "provider_error" || status.type === "provider_warning"
  })

  // Handle retry for provider errors
  const handleProviderRetry = () => {
    const sessionID = params.id
    if (!sessionID) return
    
    // Clear the provider status and retry the last message
    // This will be handled by the session processor
    showToast({
      variant: "info",
      title: language.t("provider.retry.title"),
      description: language.t("provider.retry.description"),
    })
  }

  // Handle dismiss for provider warnings
  const handleProviderDismiss = () => {
    const sessionID = params.id
    if (!sessionID) return
    
    // The status will be cleared when the user sends a new message
    // or we can explicitly clear it here
  }

  createEffect(
    on(
      () => params.dir,
      (dir) => {
        if (!dir) return
        const decoded = (() => {
          try {
            return base64Decode(dir)
          } catch {
            return
          }
        })()
        if (!decoded) return
        if (sync.project?.worktree === decoded) return
        layout.projects.open(decoded)
      },
    ),
  )

  const normalizeTabs = (tabs: { id: string; path: string }[]) => {
    const all = tabs.map((t) => t.id)
    const result: string[] = []
    for (const id of all) {
      if (result.includes(id)) continue
      result.push(id)
    }
    return result.map((id) => ({ id, path: id }))
  }

  const isReviewTab = createMemo(() => {
    const active = tabs().view().active
    return active?.startsWith("review:")
  })

  const reviewTabProps = createMemo((): SessionReviewTabProps | undefined => {
    if (!isReviewTab()) return undefined
    const active = tabs().view().active
    if (!active) return undefined
    const match = active.match(/^review:([^:]+)(?::(.+))?$/)
    if (!match) return undefined
    const [, type, id] = match
    if (type !== "file" && type !== "directory") return undefined
    return {
      type,
      id: id ?? "",
      base: sync.project?.worktree,
    }
  })

  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | undefined>()
  const [contentRef, setContentRef] = createSignal<HTMLDivElement | undefined>()

  const scrollState = createAutoScroll({
    get element() {
      return scrollRef()
    },
    get enabled() {
      return ui.scroll.bottom
    },
  })

  const { anchor, register: registerMessage, unregister: unregisterMessage } = useSessionHashScroll()

  const scrollSpy = createScrollSpy({
    get scrollContainer() {
      return scrollRef()
    },
    get contentContainer() {
      return contentRef()
    },
    get selector() {
      return "[data-message-id]"
    },
    get idFromElement() {
      return (el: Element) => el.getAttribute("data-message-id") ?? ""
    },
    onActiveChange: (id) => {
      if (!id) return
      const url = new URL(window.location.href)
      url.hash = anchor(id)
      window.history.replaceState(null, "", url)
    },
  })

  createEffect(
    on(
      () => params.id,
      () => {
        scrollSpy.reset()
      },
    ),
  )

  const handleScroll = () => {
    const el = scrollRef()
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    setUi("scroll", "bottom", atBottom)
    setUi("scroll", "overflow", scrollHeight > clientHeight)
  }

  const handleAutoScrollInteraction = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const message = target.closest?.("[data-message-id]")
    if (message) {
      const id = message.getAttribute("data-message-id")
      if (id) {
        const url = new URL(window.location.href)
        url.hash = anchor(id)
        window.history.replaceState(null, "", url)
      }
    }
  }

  const handleMarkScrollGesture = (target?: EventTarget | null) => {
    if (!target) {
      setUi("scrollGesture", (v) => v + 1)
      return
    }
    const el = target as HTMLElement
    if (el === scrollRef()) {
      setUi("scrollGesture", (v) => v + 1)
    }
  }

  const handleResumeScroll = () => {
    setUi("scroll", "bottom", true)
    scrollState.scrollToBottom()
  }

  const [turnStart, setTurnStart] = createSignal(0)

  const { renderedUserMessages, historyMore, historyLoading, onLoadEarlier, onRenderEarlier } =
    createMessageHistory({
      get sessionID() {
        return params.id
      },
    })

  const lastUserMessageID = createMemo(() => {
    const messages = renderedUserMessages()
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "user") {
        return messages[i].id
      }
    }
    return undefined
  })

  const { commands, shortcuts } = useSessionCommands({
    get sessionID() {
      return params.id
    },
    get hasScrollGesture() {
      return ui.scrollGesture > 0
    },
    get scrollBottom() {
      return ui.scroll.bottom
    },
    get scrollOverflow() {
      return ui.scroll.overflow
    },
    onScrollUp: () => {
      const el = scrollRef()
      if (!el) return
      el.scrollBy({ top: -300, behavior: "smooth" })
    },
    onScrollDown: () => {
      const el = scrollRef()
      if (!el) return
      el.scrollBy({ top: 300, behavior: "smooth" })
    },
    onScrollToTop: () => {
      const el = scrollRef()
      if (!el) return
      el.scrollTo({ top: 0, behavior: "smooth" })
    },
    onScrollToBottom: () => {
      handleResumeScroll()
    },
  })

  createEffect(
    on(
      () => params.id,
      () => {
        setTurnStart(renderedUserMessages().length)
      },
    ),
  )

  const [bannerType, setBannerType] = createSignal<BannerType>(null)

  createEffect(
    on(
      () => sync.data.session_status[params.id ?? ""]?.type,
      (type) => {
        if (type === "resync_required") {
          setBannerType("resync")
        } else if (type === "retry") {
          setBannerType("retry")
        } else {
          setBannerType(null)
        }
      },
    ),
  )

  const onScheduleScrollState = (el: HTMLDivElement) => {
    handleScroll()
  }

  // ... rest of the component implementation

  return (
    <div class="flex flex-col h-full">
      {/* Header with provider status indicator */}
      <div class="flex items-center justify-between px-4 py-2 border-b border-border-weak-base">
        <div class="flex items-center gap-4">
          <SessionHeader />
          <Show when={providerStatusEnabled() && sessionProviderID()}>
            <div class="border-l border-border-weak-base pl-4">
              <ProviderStatusIndicator 
                status={sessionStatus} 
                providerID={sessionProviderID}
              />
            </div>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={streamingStatusEnabled()}>
            <StreamingStatus status={sessionStatus} sessionID={() => params.id} />
          </Show>
        </div>
      </div>

      {/* Provider Status Banner */}
      <Show when={providerStatusEnabled() && hasProviderError()}>
        <div class="px-4 py-2 border-b border-border-weak-base bg-surface-raised-base">
          <ProviderStatusBanner 
            status={sessionStatus}
            onRetry={handleProviderRetry}
          />
        </div>
      </Show>

      {/* Streaming Banner */}
      <Show when={streamBannersEnabled() && bannerType()}>
        <StreamingBanner 
          type={bannerType()} 
          onDismiss={() => setBannerType(null)}
        />
      </Show>

      {/* Main content area */}
      <div class="flex-1 flex overflow-hidden">
        {/* Message Timeline */}
        <div class="flex-1 flex flex-col min-w-0">
          <MessageTimeline
            mobileChanges={isMobile()}
            mobileFallback={<div>Mobile view</div>}
            scroll={ui.scroll}
            onResumeScroll={handleResumeScroll}
            setScrollRef={setScrollRef}
            onScheduleScrollState={onScheduleScrollState}
            onAutoScrollHandleScroll={handleScroll}
            onMarkScrollGesture={handleMarkScrollGesture}
            hasScrollGesture={() => ui.scrollGesture > 0}
            isDesktop={isDesktop()}
            onScrollSpyScroll={scrollSpy.handleScroll}
            onAutoScrollInteraction={handleAutoScrollInteraction}
            centered={true}
            setContentRef={setContentRef}
            turnStart={turnStart()}
            onRenderEarlier={onRenderEarlier}
            historyMore={historyMore()}
            historyLoading={historyLoading()}
            onLoadEarlier={onLoadEarlier}
            renderedUserMessages={renderedUserMessages()}
            anchor={anchor}
            onRegisterMessage={registerMessage}
            onUnregisterMessage={unregisterMessage}
            lastUserMessageID={lastUserMessageID()}
          />

          {/* Provider Error Card for last message error */}
          <Show when={providerStatusEnabled() && lastErrorMessage()?.error}>
            <div class="px-4 py-3 border-t border-border-weak-base bg-surface-raised-base">
              <ProviderErrorCard
                id={`error-${lastErrorMessage()?.id}`}
                error={lastErrorMessage()?.error!}
                onRetry={handleProviderRetry}
                onDismiss={handleProviderDismiss}
              />
            </div>
          </Show>

          {/* Legacy Error Card (for backwards compatibility) */}
          <Show when={errorCardsEnabled() && !lastErrorMessage()?.error}>
            <div class="px-4 pb-4">
              <ErrorCard
                id="error-1"
                title="Tool execution failed"
                message="Command 'npm run build' exited with code 1"
                details={"npm ERR! missing script: build\nnpm ERR! \nSee 'npm run' for available scripts."}
                onRetry={() => console.log("retry clicked")}
              />
            </div>
          </Show>

          {/* Composer */}
          <SessionComposerRegion
            composer={composer}
            sessionID={params.id}
          />
        </div>

        {/* Side Panel (Desktop only) */}
        <Show when={isDesktop()}>
          <SessionSidePanel
            sessionID={params.id}
            tabs={tabs}
            view={view}
          />
        </Show>
      </div>

      {/* Mobile Tabs */}
      <Show when={isMobile()}>
        <SessionMobileTabs
          sessionID={params.id}
          tabs={tabs}
        />
      </Show>
    </div>
  )
}

// Helper function for base64 decoding
function base64Decode(str: string): string {
  try {
    return atob(str)
  } catch {
    return str
  }
}

// Placeholder for createMessageHistory
function createMessageHistory(opts: { sessionID: string }) {
  return {
    renderedUserMessages: () => [],
    historyMore: () => false,
    historyLoading: () => false,
    onLoadEarlier: () => {},
    onRenderEarlier: () => {},
  }
}
