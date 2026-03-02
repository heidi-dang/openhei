import { createSignal, Show } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"

export default function ErrorCard(props: {
  id: string
  title: string
  message: string
  details?: string
  onRetry?: () => void
}) {
  const [open, setOpen] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const copyDetails = () => {
    const text = props.details || props.message
    const doCopy = async () => {
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
          return
        } catch {}
      }
      const textarea = window.document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.left = "-9999px"
      window.document.body.appendChild(textarea)
      textarea.select()
      window.document.execCommand("copy")
      window.document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    doCopy()
  }

  return (
    <div class="error-card" data-component="error-card">
      <div class="error-card-header" onClick={() => setOpen((v) => !v)}>
        <div class="error-card-title">
          <Icon name="circle-x" size="small" />
          <span>{props.title}</span>
        </div>
        <div class="error-card-actions">
          <button
            class="error-card-copy"
            onClick={(e) => {
              e.stopPropagation()
              copyDetails()
            }}
            aria-label={copied() ? "Copied" : "Copy error details"}
          >
            <Icon name={copied() ? "circle-check" : "copy"} size="small" />
          </button>
          <Show when={props.onRetry}>
            <button
              class="error-card-retry"
              onClick={(e) => {
                e.stopPropagation()
                props.onRetry?.()
              }}
            >
              Retry
            </button>
          </Show>
        </div>
      </div>
      <Show when={open()}>
        <div class="error-card-body">
          <div class="error-card-message">{props.message}</div>
          <Show when={props.details}>
            <pre class="error-card-details">{props.details}</pre>
          </Show>
        </div>
      </Show>
    </div>
  )
}
