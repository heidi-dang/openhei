import { For, Show, createSignal } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"

export type Step = {
  id: string
  label: string
  status: "pending" | "running" | "completed" | "error"
  durationMs?: number
  anchorId?: string
}

export default function TimelineNodes(props: { steps: Step[]; onStepClick?: (step: Step) => void }) {
  const [highlighted, setHighlighted] = createSignal<string | null>(null)

  const handleClick = (step: Step) => {
    if (step.anchorId) {
      const el = document.getElementById(step.anchorId)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        setHighlighted(step.id)
        setTimeout(() => setHighlighted(null), 1500)
      }
    }
    props.onStepClick?.(step)
  }

  const iconForStatus = (status: Step["status"]) => {
    switch (status) {
      case "pending":
        return "circle-ban-sign"
      case "running":
        return "circle-ban-sign"
      case "completed":
        return "circle-check"
      case "error":
        return "circle-x"
    }
  }

  return (
    <div class="timeline-nodes">
      <div class="timeline-track" />
      <For each={props.steps}>
        {(step) => (
          <div
            class="timeline-node"
            classList={{ "timeline-node-highlighted": highlighted() === step.id }}
            onClick={() => handleClick(step)}
          >
            <div class="timeline-node-icon">
              <Icon name={iconForStatus(step.status)} size="small" />
            </div>
            <div class="timeline-node-label">{step.label}</div>
            <Show when={step.durationMs}>
              <div class="timeline-node-duration">{Math.round(step.durationMs! / 1000)}s</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}
