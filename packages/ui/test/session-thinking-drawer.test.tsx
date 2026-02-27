import { describe, it, expect } from "vitest"

import shouldRenderThinkingDrawer from "../src/components/session-turn.helpers"
import { getReasoningSummary, computeReasoningDuration } from "../src/components/thinking-drawer"

describe("Thinking drawer helpers", () => {
  it("gating: feature flag off always false", () => {
    const msg = { reasoning_summary: "x" }
    expect(shouldRenderThinkingDrawer(false, "auto", msg)).toBe(false)
    expect(shouldRenderThinkingDrawer(false, "always", msg)).toBe(false)
  })

  it("gating: mode never prevents rendering", () => {
    const msg = { reasoning_summary: "x" }
    expect(shouldRenderThinkingDrawer(true, "never", msg)).toBe(false)
  })

  it("gating: mode always renders regardless of summary", () => {
    expect(shouldRenderThinkingDrawer(true, "always", {})).toBe(true)
  })

  it("gating: mode auto renders only when safe summary exists", () => {
    const withSummary = { reasoning_summary: "  ok  " }
    const withoutSummary = { reasoning_summary: "   " }
    const altCamel = { reasoningSummary: "s" }
    const meta = { metadata: { reasoning_summary: "m" } }

    expect(shouldRenderThinkingDrawer(true, "auto", withSummary)).toBe(true)
    expect(shouldRenderThinkingDrawer(true, "auto", withoutSummary)).toBe(false)
    expect(shouldRenderThinkingDrawer(true, "auto", altCamel)).toBe(true)
    expect(shouldRenderThinkingDrawer(true, "auto", meta)).toBe(true)
  })

  it("getReasoningSummary reads snake/camel/metadata and trims", () => {
    expect(getReasoningSummary({})).toBe("")
    expect(getReasoningSummary({ reasoning_summary: " hi " })).toBe("hi")
    expect(getReasoningSummary({ reasoningSummary: " cs " })).toBe("cs")
    expect(getReasoningSummary({ metadata: { reasoning_summary: " meta " } })).toBe("meta")
  })

  it("computeReasoningDuration returns formatted durations or null", () => {
    // sub-second, show 1 decimal
    expect(computeReasoningDuration({ reasoning_started: 0, answer_started: 500 })).toBe("0.5s")
    // >10s rounds to integer seconds
    expect(computeReasoningDuration({ reasoning_started: 0, answer_started: 12000 })).toBe("12s")
    // negative delta -> null
    expect(computeReasoningDuration({ reasoning_started: 2000, answer_started: 1000 })).toBeNull()
    // missing numeric -> null
    expect(computeReasoningDuration({})).toBeNull()
  })
})
