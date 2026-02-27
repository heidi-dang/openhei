import { Component, createSignal } from "solid-js"
import { Show } from "solid-js"
import { useI18n } from "../context/i18n"

interface Props {
  message: any
  id: string
}

// Do not render any chain-of-thought fields. Only read the safe, short `reasoning_summary`.
// Do not attempt to reconstruct reasoning from other fields.
export const ThinkingDrawer: Component<Props> = (props) => {
  const i18n = useI18n()
  const [open, setOpen] = createSignal(false)

  const summary = () => getReasoningSummary(props.message)

  function formatDuration(): string | null {
    return computeReasoningDuration(props.message)
  }

  // keyboard accessibility: toggle on Space/Enter when focused
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setOpen(!open())
    }
  }

  return (
    <div data-component="thinking-drawer" id={props.id}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open()}
        aria-controls={`${props.id}-content`}
        data-slot="thinking-drawer-trigger"
        onClick={() => setOpen(!open())}
        onKeyDown={onKeyDown}
      >
        <span data-slot="thinking-drawer-title">{i18n.t("ui.sessionTurn.status.thinking")}</span>
        <span data-slot="thinking-drawer-duration">{formatDuration() ?? ""}</span>
        <span data-slot="thinking-drawer-chevron">{open() ? "▼" : "►"}</span>
      </div>
      <Show when={open()}>
        <div id={`${props.id}-content`} role="region" aria-labelledby={props.id} data-slot="thinking-drawer-content">
          <div data-slot="thinking-drawer-summary">{summary() ? summary() : i18n.t("ui.thinking.no_summary")}</div>
        </div>
      </Show>
    </div>
  )
}

export default ThinkingDrawer

// Helper: safely extract a short reasoning summary (snake/camel/metadata)
export function getReasoningSummary(message: any): string {
  const msg = message || {}
  const value =
    (msg.reasoning_summary as string) ||
    (msg.reasoningSummary as string) ||
    (msg.metadata?.reasoning_summary as string) ||
    ""
  return (value ?? "").trim()
}

// Helper: compute relative duration string from numeric timestamps
export function computeReasoningDuration(message: any): string | null {
  const msg = message || {}
  const startKeys = ["reasoning_started", "reasoningStart", "thinking_started", "thinkingStart"]
  const endKeys = ["answer_started", "answerStart", "answer_started", "answerStart"]
  let start: number | undefined
  let end: number | undefined
  for (const k of startKeys) {
    if (typeof msg[k] === "number") {
      start = msg[k]
      break
    }
  }
  for (const k of endKeys) {
    if (typeof msg[k] === "number") {
      end = msg[k]
      break
    }
  }
  if (typeof start !== "number" || typeof end !== "number") return null
  const delta = (end - start) / 1000
  if (delta < 0) return null
  if (delta < 10) return `${delta.toFixed(1)}s`
  return `${Math.round(delta)}s`
}
