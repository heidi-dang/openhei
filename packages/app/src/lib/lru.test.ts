import { describe, expect, test } from "bun:test"
import LruSet from "./lru"

describe("LruSet", () => {
  test("add/has and ttl expiry", async () => {
    const s = new LruSet({ ttlMs: 20 })
    s.add("a")
    expect(s.has("a")).toBe(true)
    // wait for ttl to expire
    await new Promise((r) => setTimeout(r, 30))
    expect(s.has("a")).toBe(false)
  })

  test("capacity evicts oldest entries", () => {
    const s = new LruSet({ capacity: 2, ttlMs: 10000 })
    s.add("a")
    s.add("b")
    s.add("c")
    expect(s.size).toBe(2)
    // a should be evicted
    expect(s.has("a")).toBe(false)
    expect(s.has("b")).toBe(true)
    expect(s.has("c")).toBe(true)
  })
})
