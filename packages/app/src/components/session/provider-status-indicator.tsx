import { Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"
import { useLanguage } from "@/context/language"
// Use a loose type here to avoid coupling to generated SDK union shapes
// The SessionStatus used in UI can contain provider_* variants added elsewhere.
type SessionStatus = any

export interface ProviderStatusIndicatorProps {
  status: () => SessionStatus
  providerID?: () => string | undefined
}

export function ProviderStatusIndicator(props: ProviderStatusIndicatorProps) {
  const language = useLanguage()
  const [tooltipOpen, setTooltipOpen] = createSignal(false)

  // Determine status type and severity
  const statusInfo = createMemo(() => {
    const status = props.status()
    const providerID = props.providerID?.()

    switch (status.type) {
      case "provider_error":
        return {
          state: "error" as const,
          severity: status.severity,
          message: status.message,
          providerID: status.providerID || providerID,
          code: status.code,
        }
      case "provider_warning":
        return {
          state: "warning" as const,
          severity: "warning" as const,
          message: status.message,
          providerID: status.providerID || providerID,
          code: status.code,
        }
      case "provider_status":
        return {
          state: "status" as const,
          severity: status.severity,
          message: status.message,
          providerID: status.providerID || providerID,
          code: status.code,
        }
      case "retry":
        return {
          state: "retrying" as const,
          severity: "warning" as const,
          message: status.message,
          providerID: providerID,
        }
      case "busy":
        return {
          state: "busy" as const,
          severity: "info" as const,
          message: language.t("streaming.status.streaming"),
          providerID: providerID,
        }
      case "idle":
      default:
        return {
          state: "idle" as const,
          severity: "success" as const,
          message: language.t("provider.status.ready"),
          providerID: providerID,
        }
    }
  })

  // Get dot color class
  const dotColorClass = createMemo(() => {
    const info = statusInfo()
    switch (info.state) {
      case "error":
        return info.severity === "critical" ? "bg-error-base animate-pulse" : "bg-error-base"
      case "warning":
      case "retrying":
        return "bg-warning-base animate-pulse"
      case "busy":
        return "bg-success-base animate-pulse"
      case "status":
        return info.severity === "warning" ? "bg-warning-base" : "bg-info-base"
      case "idle":
      default:
        return "bg-success-base"
    }
  })

  // Get icon based on state
  const stateIcon = createMemo(() => {
    const info = statusInfo()
    switch (info.state) {
      case "error":
        return "circle-x"
      case "warning":
        return "alert-triangle"
      case "retrying":
        return "refresh-cw"
      case "busy":
        return "loader-2"
      case "status":
        return "info"
      case "idle":
      default:
        return "check-circle-2"
    }
  })

  // Check if there's an active status to show
  const hasActiveStatus = createMemo(() => {
    const info = statusInfo()
    return info.state !== "idle" && info.state !== "busy"
  })

  return (
    <div class="relative flex items-center gap-2">
      {/* Status dot with pulse animation */}
      <button
        type="button"
        class="relative flex items-center justify-center p-1 rounded-md hover:bg-surface-base-active transition-colors"
        onClick={() => setTooltipOpen(!tooltipOpen())}
        onBlur={() => setTimeout(() => setTooltipOpen(false), 200)}
        aria-label={language.t("provider.status.indicator")}
      >
        <span
          class={`size-2.5 rounded-full ${dotColorClass()}`}
          data-state={statusInfo().state}
          data-severity={statusInfo().severity}
        />
        <Show when={hasActiveStatus()}>
          <span class={`absolute inset-0 size-2.5 rounded-full ${dotColorClass()} animate-ping opacity-50`} />
        </Show>
      </button>

      {/* Provider name (if available) */}
      <Show when={statusInfo().providerID}>
        <span class="text-xs text-text-weak truncate max-w-[120px]">{statusInfo().providerID}</span>
      </Show>

      {/* Tooltip */}
      <Show when={tooltipOpen()}>
        <div
          class="absolute bottom-full left-0 mb-2 z-50 w-64 p-3 rounded-lg bg-surface-raised-base border border-border-weak-base shadow-lg"
          role="tooltip"
        >
          <div class="flex items-start gap-2">
            <Icon
              // icon names are a wide set across packages; cast to any to satisfy strict icon union types
              name={stateIcon() as any}
              size="small"
              class={
                statusInfo().state === "error"
                  ? "text-error-base"
                  : statusInfo().state === "warning" || statusInfo().state === "retrying"
                    ? "text-warning-base"
                    : statusInfo().state === "busy"
                      ? "text-success-base"
                      : "text-text-weak"
              }
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-text-base">
                {statusInfo().state === "error"
                  ? language.t("provider.status.error" as any)
                  : statusInfo().state === "warning"
                    ? language.t("provider.status.warning" as any)
                    : statusInfo().state === "retrying"
                      ? language.t("provider.status.retrying" as any)
                      : statusInfo().state === "busy"
                        ? language.t("provider.status.busy" as any)
                        : language.t("provider.status.ready" as any)}
              </p>
              <Show when={statusInfo().message}>
                <p class="text-xs text-text-weak mt-1 line-clamp-3">{statusInfo().message}</p>
              </Show>
              <Show when={statusInfo().code}>
                <p class="text-xs text-text-weak/70 mt-1">
                  {language.t("provider.status.code")}: {statusInfo().code}
                </p>
              </Show>
            </div>
          </div>
          {/* Arrow */}
          <div class="absolute top-full left-3 -mt-1">
            <div class="size-2 bg-surface-raised-base border-r border-b border-border-weak-base rotate-45" />
          </div>
        </div>
      </Show>
    </div>
  )
}
