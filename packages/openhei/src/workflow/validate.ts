import path from "path"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"
import { Glob } from "@/util/glob"
import { WorkflowRegistry } from "@/workflow/registry"
import { WorkflowRoute } from "@/workflow/route"
import { WorkflowArtifact } from "@/workflow/artifact"

export namespace WorkflowValidate {
  export async function run(root = Instance.worktree) {
    const errors: string[] = []

    const tasks = await Glob.scan("tasks/**/*.md", {
      cwd: root,
      absolute: true,
      dot: true,
      symlink: true,
    })

    for (const f of tasks) {
      const rel = path.relative(root, f)
      const text = await Filesystem.readText(f)

      for (const route of text.matchAll(/^ROUTE:NEXT=([^\s#]+)\s*$/gm)) {
        const val = route[1]
        if (!val) continue
        if (!WorkflowRegistry.isName(val)) errors.push(`unknown ROUTE:NEXT agent in ${rel}: ${val}`)
      }

      const next = WorkflowRoute.parse(text)
      if (!next) continue
      if (rel.endsWith(".audit.md")) continue

      if (next !== "planner") {
        const miss = WorkflowArtifact.missingPlan(text)
        if (miss.length) errors.push(`task missing required sections (${next}) in ${rel}: ${miss.join(", ")}`)
      }
    }

    return { ok: errors.length === 0, errors }
  }
}
