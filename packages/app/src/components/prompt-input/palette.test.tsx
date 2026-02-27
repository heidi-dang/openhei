import { describe, expect, test, beforeAll, beforeEach, mock } from "bun:test"
import { createSignal } from "solid-js"

// Lightweight tests to assert palette gating and selection behavior.
beforeAll(() => {
  mock.module("@/context/prompt", () => ({
    usePrompt: () => ({
      current: () => [{ type: "text", content: "/plan do something", start: 0, end: 18 }],
      reset: () => undefined,
      set: () => undefined,
      context: { items: () => [] },
    }),
  }))
  mock.module("@/context/sync", () => ({
    useSync: () => ({ data: { command: [] } }),
  }))
  mock.module("@/context/local", () => ({ useLocal: () => ({}) }))
  mock.module("@/context/layout", () => ({ useLayout: () => ({ handoff: { setTabs: () => undefined } }) }))
  mock.module("@/context/sdk", () => ({ useSDK: () => ({ directory: "/repo/main", client: {} }) }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
  mock.module("@/context/platform", () => ({ usePlatform: () => ({ platform: "desktop", storage: () => null }) }))
})

describe("palette createPalette", () => {
  test("filters and active index behavior", async () => {
    const { createPalette } = require("./palette")
    const p = createPalette()
    p.setOpen(true)
    p.setQuery("pl")
    expect(p.filtered().length).toBeGreaterThan(0)
    expect(p.activeIndex()).toBe(0)
    p.setActiveIndex(1)
    expect(p.activeIndex()).toBe(1)
    p.setOpen(false)
  })
})
