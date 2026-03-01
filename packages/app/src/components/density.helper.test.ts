import { describe, expect, test } from "bun:test"
import { normalizeDensity, DENSITY_VALUES } from "./density.helper"

describe("normalizeDensity", () => {
  test("fallbacks to comfortable for undefined/invalid", () => {
    expect(normalizeDensity(undefined)).toBe("comfortable")
    expect(normalizeDensity("")).toBe("comfortable")
    expect(normalizeDensity("weird" as any)).toBe("comfortable")
    expect(normalizeDensity("COMPACT" as any)).toBe("comfortable")
  })

  test("accepts valid values", () => {
    for (const v of DENSITY_VALUES) {
      expect(normalizeDensity(v)).toBe(v)
    }
  })
})
