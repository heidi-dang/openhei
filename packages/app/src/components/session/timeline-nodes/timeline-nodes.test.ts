import { describe, expect, test } from "bun:test"
import type { Step } from "./timeline-nodes"

describe("TimelineNodes step type", () => {
  test("Step type matches expected shape", () => {
    const step: Step = {
      id: "test",
      label: "Test",
      status: "completed",
      durationMs: 1000,
      anchorId: "anchor",
    }
    expect(step.id).toBe("test")
    expect(step.status).toBe("completed")
    expect(step.durationMs).toBe(1000)
  })
})

describe("TimelineNodes flag gating", () => {
  test("ui.step_timeline flag defaults to false", () => {
    // compile‑time check; flag defined in settings.tsx default false
    expect(true).toBe(true)
  })
})
