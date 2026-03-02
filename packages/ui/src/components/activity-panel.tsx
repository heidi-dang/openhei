import { createSignal, Show, For, createMemo, createEffect, onCleanup } from "solid-js"
import { useI18n } from "../context/i18n"
import { Icon } from "./icon"
import "./activity-panel.css"

export interface TerminalLine {
  kind: "cmd" | "out" | "err" | "meta"
  text: string
  ts: number
}

export interface ActivityPanelProps {
  phaseTitle: string
  terminalLines: TerminalLine[]
  status: "running" | "error" | "done"
  disconnected: boolean
  idle: boolean
  errorDetails?: {
    message: string
    code?: string
    lastLogs?: string[]
  }
  defaultExpanded?: boolean
  maxHeight?: string
  onCopyTranscript?: (transcript: string) => void
  speed?: number // dynamic speed from 0 to 1 for glow duration
  stuck?: boolean
}

export function ActivityPanel(props: ActivityPanelProps) {
  const i18n = useI18n()
  const [expanded, setExpanded] = createSignal(props.defaultExpanded ?? true)
  const [autoScroll, setAutoScroll] = createSignal(true)

  let terminalEl: HTMLDivElement | null = null

  // Auto-scroll to bottom when new lines are added
  createEffect(() => {
    // depend on terminalLines to trigger effect
    const _ = props.terminalLines
    if (autoScroll() && terminalEl && expanded()) {
      // use setTimeout to ensure DOM is updated before scrolling
      setTimeout(() => {
        if (!terminalEl) return
        terminalEl.scrollTop = terminalEl.scrollHeight
      }, 0)
    }
  })

  const handleCopyTranscript = () => {
    const transcript = props.terminalLines
      .map((line) => {
        const prefix = line.kind === "cmd" ? "$ " : line.kind === "err" ? "! " : "> "
        return `${prefix}${line.text}`
      })
      .join("\n")

    navigator.clipboard.writeText(transcript).then(() => {
      props.onCopyTranscript?.(transcript)
    })
  }

  const formatLine = (line: TerminalLine) => {
    const time = new Date(line.ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })

    let prefix = ""
    let textClass = ""

    switch (line.kind) {
      case "cmd":
        prefix = "$"
        textClass = "text-green-400"
        break
      case "err":
        prefix = "!"
        textClass = "text-red-400"
        break
      case "meta":
        prefix = ">"
        textClass = "text-blue-300"
        break
      default:
        prefix = ">"
        textClass = "text-gray-200"
    }

    // specific syntax highlighting based on text content (diffs etc)
    if (line.text.startsWith("+ ")) textClass = "text-green-400"
    if (line.text.startsWith("- ")) textClass = "text-red-400"
    if (line.text.startsWith("@@")) textClass = "text-blue-400"
    if (line.text.includes("Found")) textClass = "text-yellow-300"

    return (
      <div class="activity-terminal-line">
        <span class="activity-terminal-prefix">{prefix}</span>
        <span class="activity-terminal-time">[{time}]</span>
        <span class={`activity-terminal-text ${textClass}`}>{line.text}</span>
      </div>
    )
  }

  const statusColor = createMemo(() => {
    if (props.disconnected) return "bg-yellow-500"
    if (props.status === "error") return "bg-red-500"
    if (props.status === "done") return "bg-green-500"
    return "bg-blue-500"
  })

  const statusText = createMemo(() => {
    if (props.disconnected) return i18n.t("activityPanel.status.disconnected")
    if (props.idle) return i18n.t("activityPanel.status.idle")
    if (props.status === "error") return i18n.t("activityPanel.status.error")
    if (props.status === "done") return i18n.t("activityPanel.status.done")
    return props.phaseTitle || i18n.t("ui.sessionTurn.status.thinking")
  })

  // map speed to glow duration (max 4s for very slow, min 0.5s for very fast)
  const glowDuration = createMemo(() => {
    const s = props.speed ?? 0.5
    // invert so that high speed = low duration
    return 4 - s * 3.5
  })

  return (
    <div
      class="activity-panel-container"
      data-status={props.status}
      style={{
        "--glow-duration": `${glowDuration()}s`,
      }}
    >
      <div class="activity-panel-glow"></div>

      {/* Stuck warning overlay */}
      <Show when={props.stuck && props.status === "running"}>
        <div class="activity-stuck-overlay">
          <div class="activity-stuck-text">WARNING !!!</div>
        </div>
      </Show>

      <div class="activity-panel-content">
        {/* Header */}
        <div
          role="button"
          tabIndex={0}
          class="activity-panel-header"
          onClick={() => setExpanded(!expanded())}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              setExpanded(!expanded())
            }
          }}
          aria-expanded={expanded()}
        >
          <div class="flex items-center gap-2">
            <div class={`w-2 h-2 rounded-full ${statusColor()} ${props.status === 'running' ? 'animate-pulse' : ''}`} />
            <span class="font-medium text-gray-100">{statusText()}</span>
            <Show when={props.disconnected}>
              <span class="text-xs px-2 py-1 bg-yellow-900 text-yellow-200 rounded">
                {i18n.t("activityPanel.disconnected")}
              </span>
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="p-1 hover:bg-gray-700 rounded"
              onClick={(e) => {
                e.stopPropagation()
                handleCopyTranscript()
              }}
              title={i18n.t("activityPanel.copyTranscript")}
            >
              <Icon name="copy" class="w-4 h-4 text-gray-400" />
            </button>
            <Icon name={expanded() ? "chevron-up" : "chevron-down"} class="w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Content */}
        <Show when={expanded()}>
          <div class="activity-panel-body">
            {/* Terminal */}
            <div
              ref={(el: HTMLDivElement | null) => (terminalEl = el)}
              class="activity-terminal"
              style={{
                "max-height": props.maxHeight || "300px",
              }}
              onScroll={(e) => {
                const target = e.currentTarget
                const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 10
                setAutoScroll(atBottom)
              }}
            >
              <div class="p-3 space-y-1">
                <Show
                  when={props.terminalLines.length > 0}
                  fallback={
                    <div class="text-gray-500 italic flex items-center gap-2">
                       <span class="activity-cursor blink"></span>
                      {i18n.t("ui.sessionTurn.status.thinking")}...
                    </div>
                  }
                >
                  <For each={props.terminalLines}>{(line) => formatLine(line)}</For>
                  <Show when={props.status === "running"}>
                    <div class="activity-terminal-line mt-1">
                      <span class="activity-terminal-prefix">{">"}</span>
                      <span class="activity-cursor blink ml-2"></span>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>

            {/* Error details */}
            <Show when={props.status === "error" && props.errorDetails}>
              {(error) => (
                <div class="p-3 bg-red-900/20 border-t border-red-800">
                  <div class="flex items-start gap-2">
                    <Icon name="alert-circle" class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div class="flex-grow">
                      <div class="font-medium text-red-300">{error().message}</div>
                      <Show when={error().code}>
                        <div class="text-sm text-red-400 mt-1">Code: {error().code}</div>
                      </Show>
                      <Show when={error().lastLogs && error().lastLogs!.length > 0}>
                        <div class="mt-2">
                          <div class="text-sm font-medium text-red-400 mb-1">
                            {i18n.t("activityPanel.lastLogs")}:
                          </div>
                          <div class="bg-red-900/30 p-2 rounded text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {error().lastLogs!.join("\n")}
                          </div>
                        </div>
                      </Show>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
