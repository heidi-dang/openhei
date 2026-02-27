import { test, expect } from "bun:test"
import { DEFAULT_SETTINGS } from "./settings"

test("all ui flags default to false", () => {
  const flags = DEFAULT_SETTINGS.flags
  const keys = Object.keys(flags)
  expect(keys.length).toBeGreaterThan(0)
  for (const k of keys) {
    // @ts-ignore - dynamic key access for test
    expect((flags as any)[k]).toBe(false)
  }
})
