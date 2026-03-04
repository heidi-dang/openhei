import { createSignal, Show, createMemo, createEffect, on } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"
import { Button } from "@openhei-ai/ui/button"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useGlobalSDK } from "@/context/global-sdk"
import type { SessionStatus } from "@openhei-ai/sdk/v2"

export interface StreamingStatusProps {
  status: () => SessionStatus
  sessionID: () => string | undefined
}

export function StreamingStatus(props: StreamingStatusProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const globalSDK = useGlobalSDK()
  const [stopping, setStopping] = createSignal(false)
  const [stopTimeout, setStopTimeout] = createSignal(false)
  const [connectionStale, setConnectionStale] = createSignal(false)

  // Monitor connection health
  createEffect(() => {
    const interval = setInterval(() => {
      const lastEvent = globalSDK.lastRealtimeAt()
      const stale = lastEvent > 0 && Date.now() - lastEvent > 20000
      setConnectionStale(stale)
    }, 5000)
    return () => clearInterval(interval)
  })

  const statusType = createMemo(() => {
    if (stopping()) return "stopping"
    const status = props.status()
    if (status.type === "idle") return "idle"
    if (status.type === "resync_required") return "resyncing"
    if (status.type === "retry") return "reconnecting"
    if (connectionStale()) return "reconnecting"
    return "streaming"
  })

  const handleStop = async () => {
    const sessionID = props.sessionID()
    if (!sessionID || stopping()) return
    setStopping(true)
    setStopTimeout(false)
    try {
      await sdk.client.session.abort({ sessionID })
    } catch {
      // Ignore errors - abort is best-effort
    } finally {
      // Set timeout to re-enable stop if abort takes too long
      setTimeout(() => {
        if (stopping()) {
          setStopTimeout(true)
          setStopping(false)
        }
      }, 5000)
    }
  }

  // Clear stopping/error when status becomes idle
  createEffect(
    on(
      () => props.status().type,
      (type) => {
        if (type === "idle") {
          setStopping(false)
          setStopTimeout(false)
        }
      },
    ),
  )

  const showStopButton = () => !stopping() || stopTimeout()

  return (
    <Show when={statusType() !== "idle"}>
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-raised-base border border-border-weak-base">
        <div class="flex items-center gap-1.5">
          <Show
            when={statusType() === "streaming"}
            fallback={
              <Show
                when={statusType() === "stopping"}
                fallback={
                  <Show
                    when={statusType() === "resyncing"}
                    fallback={<div class="size-2 rounded-full bg-warning-base animate-pulse" />}
                  >
                    <div class="size-2 rounded-full bg-warning-base animate-pulse" />
                  </Show>
                }
              >
                <div class="size-2 rounded-full bg-warning-base animate-pulse" />
              </Show>
            }
          >
            <div class="size-2 rounded-full bg-success-base animate-pulse" />
          </Show>
          <span class="text-12-regular text-text-base">
            {statusType() === "streaming"
              ? language.t("streaming.status.streaming")
              : statusType() === "reconnecting"
                ? language.t("streaming.status.reconnecting")
                : statusType() === "resyncing"
                  ? language.t("streaming.status.resyncing")
                  : statusType() === "stopping"
                    ? language.t("streaming.status.stopping")
                    : language.t("streaming.status.stopTimeout")}
          </span>
        </div>
        <Show when={showStopButton()}>
          <Button
            variant="ghost"
            size="small"
            class="h-6 px-2 text-12-regular text-text-weak hover:text-text-base"
            onClick={handleStop}
          >
            <Icon name="stop" size="small" class="mr-1" />
            {language.t("streaming.stop")}
          </Button>
        </Show>
      </div>
    </Show>
  )
}
