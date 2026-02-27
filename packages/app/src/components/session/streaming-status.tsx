import { createSignal, Show, createMemo } from "solid-js"
import { Icon } from "@openhei-ai/ui/icon"
import { Button } from "@openhei-ai/ui/button"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { SessionStatus } from "@openhei-ai/sdk/v2"

export interface StreamingStatusProps {
  status: () => SessionStatus
  sessionID: () => string | undefined
}

export function StreamingStatus(props: StreamingStatusProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const [stopping, setStopping] = createSignal(false)

  const statusType = createMemo(() => {
    const status = props.status()
    if (status.type === "idle") return "idle"
    if (status.type === "resync_required") return "resyncing"
    if (status.type === "retry") return "reconnecting"
    return "streaming"
  })

  const handleStop = async () => {
    const sessionID = props.sessionID()
    if (!sessionID || stopping()) return
    setStopping(true)
    try {
      await sdk.client.session.abort({ sessionID })
    } catch {
      // Ignore errors - abort is best-effort
    } finally {
      // Clear stopping state after a timeout to ensure we don't get stuck
      setTimeout(() => setStopping(false), 5000)
    }
  }

  // Clear stopping when status becomes idle
  createMemo(() => {
    if (props.status().type === "idle") {
      setStopping(false)
    }
  })

  return (
    <Show when={statusType() !== "idle"}>
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-raised-base border border-border-weak-base">
        <div class="flex items-center gap-1.5">
          <Show
            when={statusType() === "streaming"}
            fallback={
              <Show
                when={statusType() === "resyncing"}
                fallback={<div class="size-2 rounded-full bg-warning-base animate-pulse" />}
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
                : language.t("streaming.status.resyncing")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="small"
          class="h-6 px-2 text-12-regular text-text-weak hover:text-text-base"
          onClick={handleStop}
          disabled={stopping()}
        >
          <Icon name="stop" size="small" class="mr-1" />
          {stopping() ? language.t("streaming.status.stopping") : language.t("streaming.stop")}
        </Button>
      </div>
    </Show>
  )
}
