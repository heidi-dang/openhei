import { describe, expect, test, beforeAll, beforeEach, mock } from "bun:test"
import { shouldOpenPalette, stripSlashPrefix } from "./palette-util"

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

describe("palette utils", () => {
  test("shouldOpenPalette respects flag and parses query", () => {
    expect(shouldOpenPalette(false, "/plan hi")).toEqual({ open: false, query: "" })
    expect(shouldOpenPalette(true, "not a slash")).toEqual({ open: false, query: "" })
    expect(shouldOpenPalette(true, "/pl rest")).toEqual({ open: true, query: "pl" })
  })

  test("stripSlashPrefix removes leading /cmd and optional space", () => {
    expect(stripSlashPrefix("/plan do this", "plan")).toBe("do this")
    expect(stripSlashPrefix("/plando this", "plan")).toBe("do this")
    expect(stripSlashPrefix("/search  term", "search")).toBe("term")
  })
})
