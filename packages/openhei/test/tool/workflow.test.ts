import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { WorkflowTool } from "../../src/tool/workflow"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.workflow", () => {
  test("init creates deterministic slug and task file", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await WorkflowTool.init()
        const first = await tool.execute({ action: "init", text: "Add a rate limiter to API" }, ctx as any)
        const second = await tool.execute({ action: "init", text: "Add a rate limiter to API" }, ctx as any)
        expect(first.metadata.slug).toBe(second.metadata.slug)
        expect(first.metadata.existed).toBe(false)
        expect(second.metadata.existed).toBe(true)

        const file = path.join(tmp.path, "tasks", `${first.metadata.slug}.md`)
        expect(await Bun.file(file).text()).toContain("ROUTE:NEXT=planner")
      },
    })
  })
})
