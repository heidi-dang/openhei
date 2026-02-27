import { createSignal, Show } from "solid-js"

export default function ToolCard(props: {
  id: string
  title: string
  subtitle?: string
  status?: string
  durationMs?: number
  output?: string
}) {
  const [open, setOpen] = createSignal(false)
  const short = () => (props.output && props.output.length > 200 ? props.output.slice(0, 200) + "..." : props.output)

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
          <pre class="tool-card-output">{short()}</pre>
          <Show when={props.output && props.output.length > 200}>
            <button
              class="tool-card-show-more"
              onClick={() => alert("show more — to be implemented (lazy load full output)")}
            >
              Show more
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}
