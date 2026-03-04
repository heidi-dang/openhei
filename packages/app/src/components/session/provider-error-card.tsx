import { createSignal, Show, createMemo } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"
import { Button } from "@openhei-ai/ui/button"
import { useLanguage } from "@/context/language"
// The SDK's generated types may differ across packages; allow flexible typing here.
import type { Message } from "@openhei-ai/sdk/v2"

export interface ProviderErrorCardProps {
  id: string
  error: any
  onRetry?: () => void
  onDismiss?: () => void
}

export function ProviderErrorCard(props: ProviderErrorCardProps) {
  const language = useLanguage()
  const [expanded, setExpanded] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  // Parse error data
  const errorData = createMemo(() => {
    const error = props.error
    if (!error) return null

    // Handle different error types
    if (!error) return null

    if (error.name === "APIError" || error.name === "ApiError" || error.name === "Apierror") {
      const data = error.data as {
        message: string
        statusCode?: number
        isRetryable?: boolean
        responseBody?: string
        responseHeaders?: Record<string, string>
        metadata?: Record<string, string>
      }
      return {
        type: "api_error" as const,
        title: language.t("error.apiError"),
        message: data.message,
        statusCode: data.statusCode,
        retryable: data.isRetryable ?? false,
        details: data.responseBody,
        metadata: data.metadata,
      }
    }

    if (error.name === "ContextOverflowError" || error.name === "ContextOverflow") {
      const data = error.data as { message: string; responseBody?: string }
      return {
        type: "context_overflow" as const,
        title: language.t("error.contextOverflow"),
        message: data.message,
        retryable: false,
        details: data.responseBody,
      }
    }

    if (error.name === "ProviderAuthError" || error.name === "AuthError") {
      const data = error.data as { providerID: string; message: string }
      return {
        type: "auth_error" as const,
        title: language.t("error.authError"),
        message: data.message,
        providerID: data.providerID,
        retryable: false,
      }
    }

    if (error.name === "MessageAbortedError" || error.name === "AbortedError") {
      return {
        type: "aborted" as const,
        title: language.t("error.aborted"),
        message: error.data?.message || language.t("error.requestAborted"),
        retryable: true,
      }
    }

    // Generic error fallback
    return {
      type: "unknown" as const,
      title: language.t("error.unknown" as any),
      message: error.message || language.t("error.unknownError" as any),
      retryable: false,
      details: JSON.stringify(error, null, 2),
    }
  })

  // Get icon based on error type
  const errorIcon = createMemo(() => {
    const data = errorData()
    if (!data) return "alert-circle"
    switch (data.type) {
      case "api_error":
        return data.statusCode && data.statusCode >= 500 ? "server-off" : "alert-circle"
      case "context_overflow":
        return "text-cursor"
      case "auth_error":
        return "lock"
      case "aborted":
        return "stop-circle"
      default:
        return "alert-circle"
    }
  })

  // Get color class based on error type
  const errorColorClass = createMemo(() => {
    const data = errorData()
    if (!data) return "border-border-weak-base bg-surface-raised-base"
    if (data.type === "auth_error" || data.type === "context_overflow") {
      return "border-error-base bg-error-base/5"
    }
    if (data.type === "aborted") {
      return "border-warning-base bg-warning-base/5"
    }
    return "border-error-base/50 bg-error-base/5"
  })

  const copyDetails = () => {
    const data = errorData()
    if (!data?.details) return

    const text = typeof data.details === "string" ? data.details : JSON.stringify(data.details, null, 2)

    const doCopy = async () => {
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
          return
        } catch {}
      }
      // Fallback
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

  const copyErrorMessage = () => {
    const data = errorData()
    if (!data?.message) return

    const doCopy = async () => {
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.message)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
          return
        } catch {}
      }
    }
    doCopy()
  }

  return (
    <Show when={errorData()}>
      <div
        class={`rounded-lg border p-4 ${errorColorClass()}`}
        data-component="provider-error-card"
        data-error-type={errorData()?.type}
        data-error-id={props.id}
      >
        {/* Header */}
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            <div class="mt-0.5 flex-shrink-0 text-error-base">
              <Icon name={errorIcon()} size="small" />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-sm text-text-base">{errorData()?.title}</h4>
              <p class="text-sm text-text-weak mt-1">{errorData()?.message}</p>
            </div>
          </div>

          {/* Actions */}
          <div class="flex items-center gap-1 flex-shrink-0">
            <button
              class="p-1.5 rounded-md hover:bg-surface-base-active transition-colors"
              onClick={copyErrorMessage}
              title={copied() ? language.t("common.copied") : language.t("common.copy")}
            >
              <Icon name={copied() ? "circle-check" : "copy"} size="small" />
            </button>
            <Show when={props.onDismiss}>
              <button
                class="p-1.5 rounded-md hover:bg-surface-base-active transition-colors"
                onClick={props.onDismiss}
                title={language.t("common.dismiss")}
              >
                <Icon name="x" size="small" />
              </button>
            </Show>
          </div>
        </div>

        {/* Status code badge */}
        <Show when={errorData()?.statusCode}>
          <div class="mt-3 flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full bg-surface-base-active text-text-weak">
              HTTP {errorData()?.statusCode}
            </span>
            <Show when={errorData()?.retryable}>
              <span class="text-xs px-2 py-0.5 rounded-full bg-warning-base/20 text-warning-base">
                {language.t("error.retryable")}
              </span>
            </Show>
          </div>
        </Show>

        {/* Expandable details */}
        <Show when={errorData()?.details}>
          <div class="mt-3">
            <button
              class="flex items-center gap-1 text-xs text-text-weak hover:text-text-base transition-colors"
              onClick={() => setExpanded(!expanded())}
            >
              <Icon name={expanded() ? "chevron-down" : "chevron-right"} size="small" />
              {expanded() ? language.t("common.hideDetails") : language.t("common.showDetails")}
            </button>
            <Show when={expanded()}>
              <div class="mt-2 relative">
                <pre class="p-3 rounded-md bg-black/5 text-xs overflow-auto max-h-60 text-text-weak">
                  {typeof errorData()?.details === "string"
                    ? errorData()?.details
                    : JSON.stringify(errorData()?.details, null, 2)}
                </pre>
                <button
                  class="absolute top-2 right-2 p-1.5 rounded-md bg-surface-raised-base hover:bg-surface-base-active transition-colors"
                  onClick={copyDetails}
                  title={language.t("common.copyDetails")}
                >
                  <Icon name={copied() ? "circle-check" : "copy"} size="small" />
                </button>
              </div>
            </Show>
          </div>
        </Show>

        {/* Retry button */}
        <Show when={errorData()?.retryable && props.onRetry}>
          <div class="mt-4 flex justify-end">
            <Button variant="secondary" size="small" onClick={props.onRetry}>
              <Icon name="refresh-cw" size="small" class="mr-1.5" />
              {language.t("common.retry")}
            </Button>
          </div>
        </Show>
      </div>
    </Show>
  )
}
