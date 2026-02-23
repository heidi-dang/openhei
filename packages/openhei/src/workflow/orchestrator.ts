import path from "path"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"
import { WorkflowRegistry } from "@/workflow/registry"
import { WorkflowRoute } from "@/workflow/route"
import { WorkflowArtifact } from "@/workflow/artifact"

export namespace WorkflowOrchestrator {
  function task(root: string, slug: string) {
    return path.join(root, "tasks", `${slug}.md`)
  }

  function audit(root: string, slug: string) {
    return path.join(root, "tasks", `${slug}.audit.md`)
  }

  async function read(root: string, slug: string) {
    const file = task(root, slug)
    if (!(await Filesystem.exists(file))) throw new Error(`task file not found: ${file}`)
    const txt = await Filesystem.readText(file)

    const a = audit(root, slug)
    if (!(await Filesystem.exists(a))) return { task: txt, audit: undefined as string | undefined }
    return { task: txt, audit: await Filesystem.readText(a) }
  }

  function executor(text: string) {
    const m = text.match(/^EXECUTOR=(runner|autocoder)\b/m)
    return (m?.[1] as "runner" | "autocoder" | undefined) ?? "autocoder"
  }

  function retry(text: string) {
    let last = 0
    for (const m of text.matchAll(/^RETRY_COUNT=(\d+)\b/gm)) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= 0) last = n
    }
    return last
  }

  export async function next(slug: string, root = Instance.worktree) {
    const { task: taskText, audit: auditText } = await read(root, slug)

    const taskRoute = WorkflowRoute.parse(taskText)
    const auditRoute = auditText ? WorkflowRoute.parse(auditText) : undefined
    const next = taskRoute === "reviewer-audit" && auditRoute ? auditRoute : (taskRoute ?? auditRoute)
    if (!next) throw new Error("missing ROUTE:NEXT marker")

    if (next === "runner" || next === "autocoder") {
      const missing = WorkflowArtifact.missingPlan(taskText)
      if (missing.length) throw new Error(`task spec incomplete: ${missing.join(", ")}`)
    }

    if (next === "reviewer-audit") {
      const missRunner = WorkflowArtifact.missingEvidence(taskText, "runner")
      const missCoder = WorkflowArtifact.missingEvidence(taskText, "autocoder")
      if (missRunner.length && missCoder.length) {
        throw new Error(`task missing evidence sections: ${[...new Set([...missRunner, ...missCoder])].join(", ")}`)
      }
    }

    if (next === "self-audit") {
      if (!auditText) throw new Error("audit file missing")
      if (!WorkflowArtifact.verdict(auditText)) throw new Error("audit missing PASS/FAIL verdict")
    }

    if (next === "workflow-runner" && taskRoute === "reviewer-audit") {
      if (!auditText) throw new Error("audit file missing")
      if (!WorkflowArtifact.final(auditText)) throw new Error("audit missing FINAL=PASS|FAIL")
    }

    if (!WorkflowRegistry.isName(next)) throw new Error(`unknown agent in ROUTE:NEXT: ${next}`)
    return {
      agent: next,
      source: taskRoute === "reviewer-audit" && auditRoute ? ("audit" as const) : ("task" as const),
    }
  }

  export async function advance(slug: string, root = Instance.worktree) {
    const paths = { task: task(root, slug), audit: audit(root, slug) }
    const { task: taskText, audit: auditText } = await read(root, slug)

    const taskRoute = WorkflowRoute.parse(taskText)
    const auditRoute = auditText ? WorkflowRoute.parse(auditText) : undefined
    const current = taskRoute === "reviewer-audit" && auditRoute ? auditRoute : (taskRoute ?? auditRoute)
    if (current !== "workflow-runner") {
      return { changed: false, route: current, note: "no-op (ROUTE:NEXT is not workflow-runner)" }
    }

    const done = auditText ? WorkflowArtifact.final(auditText) : undefined
    if (done === "PASS") {
      return { changed: false, route: current, note: "final PASS (workflow complete)" }
    }

    if (done === "FAIL") {
      const count = retry(taskText) + 1
      const items = auditText ? WorkflowArtifact.mustFix(auditText) : []
      const packet = [
        `RETRY_COUNT=${count}`,
        "FAIL_REASONS:",
        ...(items.length ? items : ["- audit failed (no must-fix items found)"]),
        "FIX_TARGETS:",
        ...(items.length ? items : ["- see audit for details"]),
        "",
      ].join("\n")

      const next = count < 3 ? executor(taskText) : "planner"
      const updated = WorkflowRoute.set(`${taskText.trimEnd()}\n\n${packet}`, next)
      await Filesystem.write(paths.task, updated)

      return { changed: true, route: next, note: count < 3 ? `retry ${count}/3` : "retry budget exhausted" }
    }

    const missing = WorkflowArtifact.missingPlan(taskText)
    if (missing.length) {
      const note = ["MISSING_SECTIONS:", ...missing.map((x) => `- ${x}`), ""].join("\n")
      await Filesystem.write(paths.task, WorkflowRoute.set(`${taskText.trimEnd()}\n\n${note}`, "planner"))
      return { changed: true, route: "planner", note: "task spec incomplete" }
    }

    const next = executor(taskText)
    await Filesystem.write(paths.task, WorkflowRoute.set(`${taskText.trimEnd()}\n\nSTAGE=RUNNER\n`, next))
    return { changed: true, route: next, note: "routed to executor" }
  }
}
