// Simple LRU+TTL set with optional cross-tab persistence via localStorage/BroadcastChannel
export type LruOptions = {
  capacity?: number
  ttlMs?: number
  persistKey?: string
}

export class LruSet {
  private map = new Map<string, number>()
  private capacity: number
  private ttlMs: number
  private persistKey?: string
  private bc?: BroadcastChannel

  constructor(opts: LruOptions = {}) {
    this.capacity = opts.capacity ?? 2000
    this.ttlMs = opts.ttlMs ?? 10 * 60 * 1000
    this.persistKey = opts.persistKey

    if (typeof window !== "undefined") {
      try {
        if (this.persistKey && window.localStorage) {
          const raw = window.localStorage.getItem(this.persistKey)
          if (raw) {
            const arr: Array<[string, number?]> = JSON.parse(raw)
            const now = Date.now()
            for (const [k, maybeExpiry] of arr) {
              const expiry = (maybeExpiry ?? now) as number
              if (expiry > now) this.map.set(k, expiry)
            }
          }
        }
      } catch (e) {
        // ignore parse errors
      }

      try {
        if (typeof BroadcastChannel !== "undefined") {
          this.bc = new BroadcastChannel("openhei:appliedDeltas")
          this.bc.onmessage = (m) => {
            try {
              const data = m.data
              if (!data || !data.entries) return
              const now = Date.now()
              for (const [k, maybeExpiry] of data.entries as Array<[string, number?]>) {
                const expiry = (maybeExpiry ?? now) as number
                if (expiry > now) this.map.set(k, expiry)
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }

  has(key: string) {
    const now = Date.now()
    const expiry = this.map.get(key)
    if (!expiry) return false
    if (expiry < now) {
      this.map.delete(key)
      this.persist()
      return false
    }
    // promote: move to end
    this.map.delete(key)
    this.map.set(key, now + this.ttlMs)
    this.persist()
    return true
  }

  add(key: string) {
    const now = Date.now()
    if (this.map.has(key)) {
      this.map.delete(key)
      this.map.set(key, now + this.ttlMs)
      this.persist()
      return
    }
    if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, now + this.ttlMs)
    this.persist()
  }

  clear() {
    this.map.clear()
    this.persist()
  }

  get size() {
    return this.map.size
  }

  entries(): Array<[string, number]> {
    return Array.from(this.map.entries())
  }

  private persist() {
    if (typeof window === "undefined" || !this.persistKey) return
    try {
      const arr = Array.from(this.map.entries())
      try {
        window.localStorage.setItem(this.persistKey, JSON.stringify(arr))
      } catch (e) {}
      try {
        this.bc?.postMessage({ entries: arr })
      } catch (e) {}
    } catch (e) {}
  }
}

export default LruSet
