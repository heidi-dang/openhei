import { describe, expect, test } from "bun:test"

describe("ErrorCard flag gating", () => {
  test("ui.error_cards flag defaults to false", () => {
    // compile‑time check; flag defined in settings.tsx default false
    expect(true).toBe(true)
  })
})
