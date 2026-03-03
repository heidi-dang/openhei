import { createSignal } from "solid-js"

type LogEntry = { ts: number; type: string; message: string }

// Reactive per-session/turn ring buffer keyed by sessionId+turnId
const buffers = new Map<string, { get: () => LogEntry[]; set: (v: LogEntry[]) => void }>()
const MAX_ENTRIES = 200

function key(sessionID: string, messageID: string) {
  return `${sessionID}:${messageID}`
}

function ensureBuffer(k: string) {
  if (!buffers.has(k)) {
    const [get, set] = createSignal<LogEntry[]>([])
    buffers.set(k, { get, set })
  }
  return buffers.get(k)!
}

export function useTurnLogs(sessionID: string, messageID: string) {
  const k = key(sessionID, messageID)
  const buf = ensureBuffer(k)

  const add = (type: string, message: string) => {
    const arr = buf.get()
    const next = arr.concat({ ts: Date.now(), type, message })
    const slice = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
    buf.set(slice)
  }

  const get = buf.get

  const clear = () => buf.set([])

  return { add, get, clear }
}

export function peekTurnLogs(sessionID: string, messageID: string) {
  const b = buffers.get(key(sessionID, messageID))
  return b ? b.get().slice().reverse() : []
}

export function addTurnLog(sessionID: string, messageID: string, type: string, message: string) {
  const k = key(sessionID, messageID)
  const buf = ensureBuffer(k)
  const next = buf.get().concat({ ts: Date.now(), type, message })
  const slice = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
  buf.set(slice)
}
