import type { Event } from "@openhei-ai/sdk/v2/client"
import { createSimpleContext } from "@openhei-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup } from "solid-js"
import z from "zod"
import { createSdkForServer } from "@/utils/server"
import { usePlatform } from "./platform"
import { useServer } from "./server"

const abortError = z.object({
  name: z.literal("AbortError"),
})

export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()
    const platform = usePlatform()
    const abort = new AbortController()

    const eventFetch = (() => {
      if (!platform.fetch || !server.current) return
      try {
        const url = new URL(server.current.http.url)
        const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"
        if (url.protocol === "http:" && !loopback) return platform.fetch
      } catch {
        return
      }
    })()

    const currentServer = server.current
    if (!currentServer) throw new Error("No server available")

    const eventSdk = createSdkForServer({
      signal: abort.signal,
      fetch: eventFetch,
      server: currentServer.http,
    })
    const emitter = createGlobalEmitter<{
      [key: string]: Event
    }>()

    type Queued = { directory: string; payload: Event }
    const FLUSH_FRAME_MS = 16
    const STREAM_YIELD_MS = 8
    const RECONNECT_DELAY_MS = 250
    const MAX_RECONNECT_DELAY_MS = 30_000

    let queue: Queued[] = []
    let buffer: Queued[] = []
    const coalesced = new Map<string, number>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0

    const key = (directory: string, payload: Event) => {
      if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`
      if (payload.type === "lsp.updated") return `lsp.updated:${directory}`
      if (payload.type === "message.part.updated") {
        const part = payload.properties.part
        return `message.part.updated:${directory}:${part.messageID}:${part.id}`
      }
      if (payload.type === "message.part.delta") {
        const props = payload.properties
        return `message.part.delta:${directory}:${props.messageID}:${props.partID}:${props.field}`
      }
    }

    const flush = () => {
      if (timer) clearTimeout(timer)
      timer = undefined

      if (queue.length === 0) return

      const events = queue
      queue = buffer
      buffer = events
      queue.length = 0
      coalesced.clear()

      last = Date.now()
      console.debug("[flush] emitting", events.length, "events")
      batch(() => {
        for (const event of events) {
          if (event.payload.type === "message.part.delta") {
            console.debug(
              "[flush] emitting delta",
              key(event.directory, event.payload),
              `"${event.payload.properties.delta}"`,
            )
          }
          emitter.emit(event.directory, event.payload)
        }
      })

      buffer.length = 0
    }

    const schedule = () => {
      if (timer) return
      const elapsed = Date.now() - last
      timer = setTimeout(flush, Math.max(0, FLUSH_FRAME_MS - elapsed))
    }

    let streamErrorLogged = false
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
    const aborted = (error: unknown) => abortError.safeParse(error).success
    let reconnectDelay = RECONNECT_DELAY_MS
    const jitter = () => Math.random() * 0.5 * reconnectDelay

    const MAX_RECOVERY_TIME_MS = 60_000
    let recoveryStartTime: number | undefined
    const clearRecoveryTimeout = () => {
      recoveryStartTime = undefined
    }
    const checkRecoveryTimeout = () => {
      if (!recoveryStartTime) return false
      return Date.now() - recoveryStartTime > MAX_RECOVERY_TIME_MS
    }
    const startRecovery = () => {
      if (recoveryStartTime === undefined) {
        recoveryStartTime = Date.now()
      }
    }

    let attempt: AbortController | undefined
    const HEARTBEAT_TIMEOUT_MS = 15_000
    const CONNECTION_TIMEOUT_MS = 30_000
    let lastEventAt = Date.now()
    let heartbeat: ReturnType<typeof setTimeout> | undefined
    let connectionTimeout: ReturnType<typeof setTimeout> | undefined
    let deltaBuffer: { directory: string; payload: Event }[] = []
    let isReconnecting = false

    const resetHeartbeat = () => {
      lastEventAt = Date.now()
      if (heartbeat) clearTimeout(heartbeat)
      if (connectionTimeout) clearTimeout(connectionTimeout)
      heartbeat = setTimeout(() => {
        attempt?.abort()
      }, HEARTBEAT_TIMEOUT_MS)
      connectionTimeout = setTimeout(() => {
        console.warn("[global-sdk] Connection timeout - forcing reconnect")
        attempt?.abort()
      }, CONNECTION_TIMEOUT_MS)
    }
    const clearHeartbeat = () => {
      if (heartbeat) clearTimeout(heartbeat)
      if (connectionTimeout) clearTimeout(connectionTimeout)
      heartbeat = undefined
      connectionTimeout = undefined
    }

    // Buffer deltas during reconnection to prevent data loss
    const bufferDelta = (directory: string, payload: Event) => {
      if (isReconnecting && payload.type === "message.part.delta") {
        deltaBuffer.push({ directory, payload })
        // Keep buffer size manageable
        if (deltaBuffer.length > 1000) {
          deltaBuffer = deltaBuffer.slice(-500)
        }
      }
    }

    // Flush buffered deltas after reconnection
    const flushDeltaBuffer = () => {
      if (deltaBuffer.length === 0) return
      batch(() => {
        for (const { directory, payload } of deltaBuffer) {
          emitter.emit(directory, payload)
        }
      })
      deltaBuffer = []
    }

    void (async () => {
      while (!abort.signal.aborted) {
        attempt = new AbortController()
        lastEventAt = Date.now()
        const onAbort = () => {
          attempt?.abort()
        }
        abort.signal.addEventListener("abort", onAbort)
        try {
          const events = await eventSdk.global.event({
            signal: attempt.signal,
            onSseError: (error) => {
              if (aborted(error)) return
              if (streamErrorLogged) return
              streamErrorLogged = true
              const normalizedError = error ?? new Error("Unknown SSE error (null)")
              console.error("[global-sdk] event stream error", {
                url: currentServer.http.url,
                fetch: eventFetch ? "platform" : "webview",
                error: normalizedError,
              })
            },
          })
          let yielded = Date.now()
          resetHeartbeat()
          reconnectDelay = RECONNECT_DELAY_MS
          clearRecoveryTimeout()
          isReconnecting = false

          // Flush any buffered deltas from previous reconnection
          flushDeltaBuffer()
          for await (const event of events.stream) {
            resetHeartbeat()
            streamErrorLogged = false
            const directory = event.directory ?? "global"
            const payload = event.payload
            bufferDelta(directory, payload)
            const k = key(directory, payload)
            if (k) {
              const i = coalesced.get(k)
              if (i !== undefined) {
                const prev = queue[i]
                if (prev?.payload.type === "message.part.delta" && payload.type === "message.part.delta") {
                  const a = prev.payload.properties
                  const b = payload.properties
                  if (a.delta === b.delta) {
                    continue
                  }
                  continue
                }
                coalesced.set(k, queue.length)
              } else {
                coalesced.set(k, queue.length)
              }
            }
            queue.push({ directory, payload })
            schedule()

            if (Date.now() - yielded < STREAM_YIELD_MS) continue
            yielded = Date.now()
            await wait(0)
          }
        } catch (error) {
          isReconnecting = true
          startRecovery()
          if (checkRecoveryTimeout()) {
            console.error("[global-sdk] event stream recovery timeout after 60s, triggering reconnect", {
              url: currentServer.http.url,
              fetch: eventFetch ? "platform" : "webview",
              recoveryTimeMs: MAX_RECOVERY_TIME_MS,
            })
            clearRecoveryTimeout()
            reconnectDelay = RECONNECT_DELAY_MS
          }
          if (!aborted(error) && !streamErrorLogged) {
            streamErrorLogged = true
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
            const normalizedError = error ?? new Error("Unknown stream error (null)")
            console.error("[global-sdk] event stream failed", {
              url: currentServer.http.url,
              fetch: eventFetch ? "platform" : "webview",
              error: normalizedError,
              reconnectDelay,
            })
          }
        } finally {
          abort.signal.removeEventListener("abort", onAbort)
          attempt = undefined
          clearHeartbeat()
        }

        if (abort.signal.aborted) return
        await wait(reconnectDelay + jitter())
      }
    })().finally(flush)

    const onVisibility = () => {
      if (typeof document === "undefined") return
      if (document.visibilityState !== "visible") return
      const timeSinceLastEvent = Date.now() - lastEventAt
      if (timeSinceLastEvent > HEARTBEAT_TIMEOUT_MS) {
        console.info("[global-sdk] Tab became visible after long absence, forcing reconnect")
        attempt?.abort()
      } else if (timeSinceLastEvent > 5000) {
        console.info("[global-sdk] Checking connection health after tab visibility change")
        forceReconnectIfStale(5000)
      }
    }

    const onOnline = () => {
      console.info("[global-sdk] Network came online, forcing reconnect")
      attempt?.abort()
    }
    const onOffline = () => {
      console.info("[global-sdk] Network went offline")
      isReconnecting = true
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility)
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline)
      window.addEventListener("offline", onOffline)
    }

    onCleanup(() => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility)
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline)
        window.removeEventListener("offline", onOffline)
      }
      abort.abort()
      flush()
    })

    const sdk = createSdkForServer({
      server: server.current.http,
      fetch: platform.fetch,
      throwOnError: true,
    })

    const forceReconnect = () => {
      attempt?.abort()
    }

    const forceReconnectIfStale = (thresholdMs = 30_000) => {
      if (Date.now() - lastEventAt > thresholdMs) attempt?.abort()
    }

    const lastRealtimeAt = () => lastEventAt

    return {
      url: currentServer.http.url,
      client: sdk,
      event: emitter,
      // Force a reconnect unconditionally (idempotent)
      forceReconnect,
      // Abort the current attempt only if the last realtime timestamp is older
      // than `thresholdMs`. Useful for resume handling.
      forceReconnectIfStale,
      // Expose the last seen realtime timestamp (ms since epoch)
      lastRealtimeAt,
      createClient(opts: Omit<Parameters<typeof createSdkForServer>[0], "server" | "fetch">) {
        const s = server.current
        if (!s) throw new Error("Server not available")
        return createSdkForServer({
          server: s.http,
          fetch: platform.fetch,
          ...opts,
        })
      },
    }
  },
})
