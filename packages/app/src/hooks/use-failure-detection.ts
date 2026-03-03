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
  let scheduledTimer: ReturnType<typeof setTimeout> | undefined

  function add(type: string, message: string) {
    logs.add(type, message)
  }

  function scheduleRetry() {
    const cur = retryState()
    if (cur.state === "scheduled" || cur.state === "running") return
    const attempts = cur.attempts + 1
    // exponential backoff base 2s, cap 60s
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
        // notify caller to perform the retry action (e.g., resend prompt)
        try {
          opts.onPerformRetry?.()
        } catch (e) {}
        // fallback: if caller didn't provide a callback, try global handler
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
    // if no activity for 20s, emit still-working; if for 40s, mark stalled and schedule a retry
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

  // expose a small API
  const api = {
    add,
    scheduleRetry,
    stopRetries,
    detectStall,
    getLogs: () => peekTurnLogs(sessionID, messageID),
    retryState,
  }

  createEffect(() => {
    // noop effect to ensure cleanup runs in same lifecycle
  })

  onCleanup(() => {
    if (scheduledTimer) clearInterval(scheduledTimer)
    if (stallTimer) clearTimeout(stallTimer)
  })

  return api
}
