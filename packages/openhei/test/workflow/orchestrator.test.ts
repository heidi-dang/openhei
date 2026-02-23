import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { WorkflowOrchestrator } from "../../src/workflow/orchestrator"
import { WorkflowRoute } from "../../src/workflow/route"

function task(slug: string) {
  return path.join(Instance.worktree, "tasks", `${slug}.md`)
}

function audit(slug: string) {
  return path.join(Instance.worktree, "tasks", `${slug}.audit.md`)
}

describe("workflow orchestrator", () => {
  test("planner -> workflow-runner handoff is not terminal", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const slug = "demo"
        await Bun.write(task(slug), ["# Demo", "", "ROUTE:NEXT=workflow-runner", ""].join("\n"))
        const next = await WorkflowOrchestrator.next(slug)
        expect(next.agent).toBe("workflow-runner")
      },
    })
  })

  test("stops only when FINAL=PASS is present", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const slug = "done"
        await Bun.write(task(slug), WorkflowRoute.set("# Task\n", "reviewer-audit"))
        await Bun.write(
          audit(slug),
          ["# Audit", "## Verdict", "PASS", "", "FINAL=PASS", "ROUTE:NEXT=workflow-runner", ""].join("\n"),
        )

        const out = await WorkflowOrchestrator.advance(slug)
        expect(out.changed).toBe(false)
        expect(out.note).toContain("final PASS")
      },
    })
  })

  test("audit FAIL triggers retry routing via advance", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const slug = "fail"
        await Bun.write(task(slug), WorkflowRoute.set("# Task\n", "reviewer-audit"))
        await Bun.write(
          audit(slug),
          [
            "# Audit",
            "## Verdict",
            "FAIL",
            "",
            "## Must-Fix (Required)",
            "- fix one",
            "",
            "FINAL=FAIL",
            "ROUTE:NEXT=workflow-runner",
            "",
          ].join("\n"),
        )

        const out = await WorkflowOrchestrator.advance(slug)
        expect(out.changed).toBe(true)
        expect(out.route).toBe("autocoder")

        const updated = await Bun.file(task(slug)).text()
        expect(updated).toContain("RETRY_COUNT=1")
        expect(updated).toContain("ROUTE:NEXT=autocoder")
      },
    })
  })
})
