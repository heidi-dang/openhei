import { createSignal, createEffect, onCleanup } from "solid-js"
import { useTurnLogs, peekTurnLogs } from "./use-turn-logs"

type RetryState = { state: "idle" | "scheduled" | "running" | "stopped"; attempts: number; nextIn?: number }

export function useFailureDetection(opts: {
  sessionID: string
  messageID: string
  onScheduleRetry?: (state: RetryState) => void
  onCancelRetry?: () => void
  onPerformRetry?: () => void
}) {
  const { sessionID, messageID } = opts
  const logs = useTurnLogs(sessionID, messageID)

  const [retryState, setRetryState] = createSignal<RetryState>({ state: "idle", attempts: 0 })

  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let scheduledTimer: ReturnType<typeof setInterval> | undefined

  function add(type: string, message: string) {
    logs.add(type, message)
  }

  function scheduleRetry() {
    const cur = retryState()
    if (cur.state === "scheduled" || cur.state === "running") return
    const attempts = cur.attempts + 1
    const delay = Math.min(2000 * Math.pow(2, attempts - 1), 60000)
    setRetryState({ state: "scheduled", attempts, nextIn: Math.floor(delay / 1000) })
    add("retry_scheduled", `attempt=${attempts} delay_ms=${delay}`)
    opts.onScheduleRetry?.(retryState())

    let remaining = delay
    scheduledTimer = setInterval(() => {
      remaining -= 1000
      setRetryState((s) => ({ ...s, nextIn: Math.max(0, Math.floor(remaining / 1000)) }))
      if (remaining <= 0) {
        clearInterval(scheduledTimer!)
        scheduledTimer = undefined
        setRetryState({ state: "running", attempts })
        add("retry_fired", `attempt=${attempts}`)
        // allow caller to perform the actual retry (e.g. resend prompt)
        try {
          opts.onPerformRetry?.()
        } catch (e) {}
        // fallback to a global handler if the caller didn't provide one
        try {
          const key = `${opts.sessionID}:${opts.messageID}`
          const handler = (globalThis as any).__retry_handlers?.get(key)
          if (typeof handler === "function") handler()
        } catch (e) {}
      }
    }, 1000)
  }

  function stopRetries() {
    if (scheduledTimer) {
      clearInterval(scheduledTimer)
      scheduledTimer = undefined
    }
    if (stallTimer) {
      clearTimeout(stallTimer)
      stallTimer = undefined
    }
    setRetryState({ state: "stopped", attempts: retryState().attempts })
    add("retry_stopped", "user_stopped")
    opts.onCancelRetry?.()
  }

  function detectStall() {
    if (stallTimer) clearTimeout(stallTimer)
    add("stall_watch", "reset_watch")
    stallTimer = setTimeout(() => {
      add("stall_notice", "no_output_20s: still working")
      stallTimer = setTimeout(() => {
        add("stall", "stalled_no_progress_40s")
        scheduleRetry()
      }, 20000)
    }, 20000)
  }

  const api = {
    add,
    scheduleRetry,
    stopRetries,
    detectStall,
    // return a reactive accessor for UI components
    getLogs: () => logs.get,
    retryState,
  }

  createEffect(() => {
    // placeholder effect to ensure lifecycle domain
  })

  onCleanup(() => {
    if (scheduledTimer) clearInterval(scheduledTimer)
    if (stallTimer) clearTimeout(stallTimer)
  })

  return api
}
