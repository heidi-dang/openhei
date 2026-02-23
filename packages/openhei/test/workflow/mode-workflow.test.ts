import { describe, expect, test } from "bun:test"
import path from "path"

describe("workflow mode prompt", () => {
  test("requires continuing the loop after planner", async () => {
    const file = path.join(import.meta.dir, "..", "..", "..", "..", ".openhei", "mode", "workflow.md")
    const txt = await Bun.file(file).text()
    expect(txt).toContain("Planner completion is NEVER terminal")
    expect(txt).toContain("Immediately after Planner writes `ROUTE:NEXT=workflow-runner`")
    expect(txt).toContain("MUST call `workflow { action: \"next\" }")
  })
})
