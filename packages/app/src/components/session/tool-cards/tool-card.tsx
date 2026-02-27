import { createSignal, Show, createMemo } from "solid-js"

function truncateText(text: string, limit: number) {
  if (text.length <= limit) return { head: text, isTruncated: false, remainingCount: 0 }
  const head = text.slice(0, limit)
  const remainingCount = text.length - limit
  return { head, isTruncated: true, remainingCount }
}

export default function ToolCard(props: {
  id: string
  title: string
  subtitle?: string
  status?: string
  durationMs?: number
  output?: string
}) {
  const [open, setOpen] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const limit = 200
  const truncated = createMemo(() => (props.output ? truncateText(props.output, limit) : null))
  const showTruncatedHint = createMemo(() => truncated()?.isTruncated && !expanded())
  const displayText = createMemo(() => {
    if (!props.output) return ""
    if (expanded()) return props.output
    return truncated()?.head ?? props.output
  })

  return (
    <div class="tool-card">
      <div class="tool-card-header" onClick={() => setOpen((v) => !v)}>
        <div class="tool-card-title">{props.title}</div>
        <div class="tool-card-meta">
          {props.status} {props.durationMs ? `· ${Math.round((props.durationMs || 0) / 1000)}s` : ""}
        </div>
      </div>
      <Show when={open()}>
        <div class="tool-card-body">
          <div class="tool-card-subtitle">{props.subtitle}</div>
          <pre class="tool-card-output">{displayText()}</pre>
          <Show when={showTruncatedHint()}>
            <div class="tool-card-truncated-hint">
              <span class="tool-card-truncated-label">(truncated +{truncated()?.remainingCount} chars)</span>
              <button class="tool-card-show-more" onClick={() => setExpanded(true)}>
                Show more
              </button>
            </div>
          </Show>
          <Show when={expanded()}>
            <button class="tool-card-show-less" onClick={() => setExpanded(false)}>
              Show less
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}
