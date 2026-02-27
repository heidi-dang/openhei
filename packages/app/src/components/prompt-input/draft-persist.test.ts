import { beforeEach, describe, expect, test } from "bun:test"

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  clear() {
    this.values.clear()
  }
  get length() {
    return this.values.size
  }
  key(i: number) {
    return Array.from(this.values.keys())[i] ?? null
  }
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

const storage = new MemoryStorage()

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })
})

describe("draft persist v2 stale policy", () => {
  test("fresh draft is restored", () => {
    const mod = require("./draft-persist")
    const key = mod.draftKey("ws", "sid")
    const payload = JSON.stringify({ text: "abc", ts_ms: Date.now() })
    localStorage.setItem(key, payload)
    const got = mod.readDraft(key)
    expect(got).toBe("abc")
  })

  test("stale draft is ignored and removed", () => {
    const mod = require("./draft-persist")
    const key = mod.draftKey("ws", "sid")
    const payload = JSON.stringify({ text: "old", ts_ms: Date.now() - (mod.STALE_MS + 1000) })
    localStorage.setItem(key, payload)
    const got = mod.readDraft(key)
    expect(got).toBeUndefined()
    expect(localStorage.getItem(key)).toBeNull()
  })

  test("invalid JSON returns undefined", () => {
    const mod = require("./draft-persist")
    const key = mod.draftKey("ws", "sid")
    localStorage.setItem(key, "not-json")
    const got = mod.readDraft(key)
    expect(got).toBeUndefined()
  })
})
