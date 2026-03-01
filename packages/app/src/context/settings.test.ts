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

test("density default is comfortable and flag is off", () => {
  // DEFAULT_SETTINGS is the canonical source of truth for defaults used in the
  // settings provider init. Ensure the density default remains comfortable
  // and the feature gate is off to avoid accidental UX changes.
  expect(DEFAULT_SETTINGS.general.density).toBe("comfortable")
  expect(DEFAULT_SETTINGS.flags["ui.density_modes"]).toBe(false)
})

test("whatsNewPhase5 dismissal defaults to false", () => {
  // The What's New banner should appear by default (not dismissed).
  expect(DEFAULT_SETTINGS.general.dismissedWhatsNewPhase5).toBe(false)
})
