import { createSignal, Show, For, createMemo } from "solid-js"
import { useI18n } from "../context/i18n"
import { Icon } from "./icon"

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
}

export function ActivityPanel(props: ActivityPanelProps) {
  const i18n = useI18n()
  const [expanded, setExpanded] = createSignal(props.defaultExpanded ?? false)
  const [autoScroll, setAutoScroll] = createSignal(true)

  const terminalRef: { current: HTMLDivElement | null } = { current: null }

  // Auto-scroll to bottom when new lines are added
  createMemo(() => {
    if (autoScroll() && terminalRef.current && expanded()) {
      const container = terminalRef.current
      container.scrollTop = container.scrollHeight
    }
  })

  const handleCopyTranscript = () => {
    const transcript = props.terminalLines
      .map((line) => {
        const prefix = line.kind === "cmd" ? "$ " : line.kind === "err" ? "! " : ""
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
        textClass = "text-green-600 dark:text-green-400"
        break
      case "err":
        prefix = "!"
        textClass = "text-red-600 dark:text-red-400"
        break
      case "meta":
        prefix = ">"
        textClass = "text-gray-500 dark:text-gray-400"
        break
      default:
        prefix = " "
        textClass = "text-gray-800 dark:text-gray-200"
    }

    return (
      <div class="flex items-start font-mono text-sm leading-tight whitespace-pre-wrap break-words">
        <span class="flex-shrink-0 w-6 text-right text-gray-500 dark:text-gray-400 mr-2">{time}</span>
        <span class="flex-shrink-0 w-4 text-gray-500 dark:text-gray-400 mr-2">{prefix}</span>
        <span class={`flex-grow ${textClass}`}>{line.text}</span>
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
    return props.phaseTitle || i18n.t("activityPanel.status.running")
  })

  return (
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <button
        class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded())}
        aria-expanded={expanded()}
      >
        <div class="flex items-center gap-2">
          <div class={`w-2 h-2 rounded-full ${statusColor()}`} />
          <span class="font-medium text-gray-900 dark:text-gray-100">{statusText()}</span>
          <Show when={props.disconnected}>
            <span class="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">
              {i18n.t("activityPanel.disconnected")}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={(e) => {
              e.stopPropagation()
              handleCopyTranscript()
            }}
            title={i18n.t("activityPanel.copyTranscript")}
          >
            <Icon name="copy" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
          <Icon name={expanded() ? "chevron-up" : "chevron-down"} class="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </div>
      </button>

      {/* Content */}
      <Show when={expanded()}>
        <div class="border-t border-gray-200 dark:border-gray-700">
          {/* Terminal */}
          <div
            ref={terminalRef}
            class="overflow-y-auto bg-gray-900 text-gray-100 font-mono text-sm"
            style={{
              "max-height": props.maxHeight || "220px",
              "scrollbar-width": "thin",
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
                  <div class="text-gray-500 dark:text-gray-400 italic">{i18n.t("activityPanel.waitingForOutput")}</div>
                }
              >
                <For each={props.terminalLines}>{(line) => formatLine(line)}</For>
              </Show>
            </div>
          </div>

          {/* Error details */}
          <Show when={props.status === "error" && props.errorDetails}>
            {(error) => (
              <div class="p-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
                <div class="flex items-start gap-2">
                  <Icon name="alert-circle" class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div class="flex-grow">
                    <div class="font-medium text-red-800 dark:text-red-300">{error().message}</div>
                    <Show when={error().code}>
                      <div class="text-sm text-red-700 dark:text-red-400 mt-1">Code: {error().code}</div>
                    </Show>
                    <Show when={error().lastLogs && error().lastLogs!.length > 0}>
                      <div class="mt-2">
                        <div class="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                          {i18n.t("activityPanel.lastLogs")}:
                        </div>
                        <div class="bg-red-100 dark:bg-red-900/30 p-2 rounded text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
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
  )
}
