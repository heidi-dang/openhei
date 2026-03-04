import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"
import { Button } from "@openhei-ai/ui/button"
import { useLanguage } from "@/context/language"
// Loose-session status typing for UI component to avoid direct coupling with generated SDK union
type SessionStatus = any

export interface ProviderStatusBannerProps {
  status: () => SessionStatus
  onRetry?: () => void
}

export function ProviderStatusBanner(props: ProviderStatusBannerProps) {
  const language = useLanguage()
  const [expanded, setExpanded] = createSignal(false)
  const [countdown, setCountdown] = createSignal(0)

  // Check if status is a provider error or warning
  const isProviderStatus = createMemo(() => {
    const status = props.status()
    return status.type === "provider_error" || status.type === "provider_warning" || status.type === "provider_status"
  })

  // Get status details
  const statusDetails = createMemo(() => {
    const status = props.status()
    if (!status) return null
    if (status.type === "provider_error") {
      return {
        type: "error" as const,
        severity: status.severity,
        code: status.code,
        message: status.message,
        details: status.details,
        providerID: status.providerID,
        retryable: status.retryable,
        retryAttempt: status.retryAttempt,
        nextRetryAt: status.nextRetryAt,
      }
    }
    if (status.type === "provider_warning") {
      return {
        type: "warning" as const,
        code: status.code,
        message: status.message,
        details: status.details,
        providerID: status.providerID,
        retryable: false,
      }
    }
    if (status.type === "provider_status") {
      return {
        type: "info" as const,
        severity: status.severity,
        code: status.code,
        message: status.message,
        details: status.details,
        providerID: status.providerID,
        retryable: status.retryable,
      }
    }
    return null
  })

  // Get icon based on status type
  const statusIcon = createMemo(() => {
    const details = statusDetails()
    if (!details) return "info"
    switch (details.type) {
      case "error":
        return details.severity === "critical" ? "circle-x" : "alert-circle"
      case "warning":
        return "alert-triangle"
      case "info":
        return "info"
      default:
        return "info"
    }
  })

  // Get color class based on status type
  const statusColorClass = createMemo(() => {
    const details = statusDetails()
    if (!details) return "bg-surface-raised-base border-border-weak-base"
    switch (details.type) {
      case "error":
        return details.severity === "critical"
          ? "bg-error-base/10 border-error-base text-error-base"
          : "bg-error-base/5 border-error-base/50 text-error-base"
      case "warning":
        return "bg-warning-base/10 border-warning-base text-warning-base"
      case "info":
        return "bg-info-base/10 border-info-base text-info-base"
      default:
        return "bg-surface-raised-base border-border-weak-base"
    }
  })

  // Countdown timer for retry
  onMount(() => {
    const interval = setInterval(() => {
      const details = statusDetails()
      if (details?.nextRetryAt) {
        const remaining = Math.max(0, Math.ceil((details.nextRetryAt - Date.now()) / 1000))
        setCountdown(remaining)
      }
    }, 1000)
    onCleanup(() => clearInterval(interval))
  })

  // Format countdown
  const formattedCountdown = createMemo(() => {
    const seconds = countdown()
    if (seconds <= 0) return null
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  })

  // Get user-friendly title
  const statusTitle = createMemo(() => {
    const details = statusDetails()
    if (!details) return ""
    switch (details.code) {
      case "AUTH_FAILED":
        return language.t("provider.error.authFailed")
      case "QUOTA_EXCEEDED":
        return language.t("provider.error.quotaExceeded")
      case "BILLING_ERROR":
        return language.t("provider.error.billingError")
      case "RATE_LIMITED":
        return language.t("provider.error.rateLimited")
      case "CONTEXT_OVERFLOW":
        return language.t("provider.error.contextOverflow")
      case "TOOL_NOT_SUPPORTED":
        return language.t("provider.error.toolNotSupported")
      case "MODEL_UNAVAILABLE":
        return language.t("provider.error.modelUnavailable")
      case "NETWORK_ERROR":
        return language.t("provider.error.networkError")
      case "TIMEOUT":
        return language.t("provider.error.timeout")
      case "SERVER_ERROR":
        return language.t("provider.error.serverError")
      case "PROVIDER_OVERLOADED":
        return language.t("provider.error.providerOverloaded")
      default:
        return details.type === "error" ? language.t("provider.error.generic") : language.t("provider.warning.generic")
    }
  })

  return (
    <Show when={isProviderStatus() && statusDetails()}>
      <div
        class={`rounded-lg border p-3 ${statusColorClass()}`}
        data-component="provider-status-banner"
        data-status-type={statusDetails()?.type}
        data-status-code={statusDetails()?.code}
      >
        <div class="flex items-start gap-3">
          {/* Icon */}
          <div class="mt-0.5 flex-shrink-0">
            <Icon name={statusIcon()} size="small" />
          </div>

          {/* Content */}
          <div class="flex-1 min-w-0">
            {/* Header */}
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-sm">{statusTitle()}</span>
              <span class="text-xs opacity-70">({statusDetails()?.providerID})</span>
            </div>

            {/* Message */}
            <p class="text-sm mt-1 opacity-90">{statusDetails()?.message}</p>

            {/* Countdown for retry */}
            <Show when={formattedCountdown()}>
              <p class="text-xs mt-1 opacity-70">
                {language.t("provider.status.retryingIn")}: {formattedCountdown()}
              </p>
            </Show>

            {/* Expandable details */}
            <Show when={statusDetails()?.details}>
              <button
                class="text-xs mt-2 underline opacity-70 hover:opacity-100"
                onClick={() => setExpanded(!expanded())}
              >
                {expanded() ? language.t("common.hideDetails") : language.t("common.showDetails")}
              </button>
              <Show when={expanded()}>
                <pre class="mt-2 p-2 rounded bg-black/5 text-xs overflow-auto max-h-40">{statusDetails()?.details}</pre>
              </Show>
            </Show>
          </div>

          {/* Actions */}
          <div class="flex items-center gap-2 flex-shrink-0">
            <Show when={statusDetails()?.retryable && props.onRetry}>
              <Button variant="secondary" size="small" onClick={props.onRetry} disabled={countdown() > 0}>
                <Icon name="refresh-cw" size="small" class="mr-1" />
                {language.t("common.retry")}
              </Button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
