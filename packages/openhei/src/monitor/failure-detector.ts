import { RunEventBus } from "@/stream/event-bus"
import { Config } from "@/config/config"

export type FailureEvent = {
  run_id?: string
  kind: string
  providerID?: string
  url?: string
  status?: number
  message?: string
  severity?: "info" | "warning" | "critical"
  details?: Record<string, unknown>
}

export namespace FailureDetector {
  const lastEmitted = new Map<string, number>()

  function now() {
    return Date.now()
  }

  async function rateLimitWindow() {
    try {
      const cfg = await Config.get()
      return cfg.failure_detection?.rate_limit_window ?? 60_000
    } catch {
      return 60_000
    }
  }

  function keyFor(kind: string, providerID?: string, url?: string) {
    return `${kind}:${providerID ?? "-"}:${url ?? "-"}`
  }

  export async function publishFailure(event: FailureEvent) {
    const run_id = event.run_id ?? "system"
    const payload = {
      run_id,
      type: "run.failure.detected",
      kind: event.kind,
      provider_id: event.providerID,
      url: event.url,
      status: event.status,
      message: event.message,
      severity: event.severity ?? "warning",
      details: event.details ?? {},
      ts: Date.now(),
    }
    RunEventBus.publish(payload)
  }

  export async function rateLimit(opts: { providerID?: string; url?: string; status?: number; message?: string }) {
    const window = await rateLimitWindow()
    const k = keyFor("rate_limit", opts.providerID, opts.url)
    const last = lastEmitted.get(k) ?? 0
    if (now() - last < window) return
    lastEmitted.set(k, now())
    await publishFailure({
      kind: "rate_limit",
      providerID: opts.providerID,
      url: opts.url,
      status: opts.status,
      message: opts.message,
    })
  }

  export async function upstream5xx(opts: { providerID?: string; url?: string; status?: number; message?: string }) {
    const window = await rateLimitWindow()
    const k = keyFor("upstream_5xx", opts.providerID, opts.url)
    const last = lastEmitted.get(k) ?? 0
    if (now() - last < window) return
    lastEmitted.set(k, now())
    await publishFailure({
      kind: "upstream_5xx",
      providerID: opts.providerID,
      url: opts.url,
      status: opts.status,
      message: opts.message,
      severity: "critical",
    })
  }

  export async function stall(opts: { run_id?: string; message?: string; providerID?: string }) {
    await publishFailure({
      run_id: opts.run_id,
      kind: "stall",
      providerID: opts.providerID,
      message: opts.message,
      severity: "warning",
    })
  }

  export async function disconnect(opts: { run_id?: string; message?: string; providerID?: string }) {
    await publishFailure({
      run_id: opts.run_id,
      kind: "disconnect",
      providerID: opts.providerID,
      message: opts.message,
      severity: "warning",
    })
  }
}

export default FailureDetector
