// Configuration for applied-delta deduplication (LRU+TTL)
// Defaults chosen to be safe for long-running sessions.
const DEFAULT_CAPACITY = 2000
const DEFAULT_TTL_MS = 10 * 60 * 1000 // 10 minutes

export type DedupeConfig = {
  capacity: number
  ttlMs: number
  persist: boolean
  persistKey?: string
}

const overrides: Partial<DedupeConfig> = {}

export const DEDUPE_CAPACITY = overrides?.capacity ?? DEFAULT_CAPACITY
export const DEDUPE_TTL_MS = overrides?.ttlMs ?? DEFAULT_TTL_MS
export const PERSIST_APPLIED_DELTAS = overrides?.persist ?? false
export const PERSIST_APPLIED_DELTAS_KEY = overrides?.persistKey ?? "openhei:appliedDeltas"

export function dedupeOptions() {
  return {
    capacity: DEDUPE_CAPACITY,
    ttlMs: DEDUPE_TTL_MS,
    persistKey: PERSIST_APPLIED_DELTAS ? PERSIST_APPLIED_DELTAS_KEY : undefined,
  }
}

export default dedupeOptions
