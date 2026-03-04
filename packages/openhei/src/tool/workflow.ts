import z from "zod"
import crypto from "crypto"
import path from "path"
import { Tool } from "./tool"
import DESCRIPTION from "./workflow.txt"
import { WorkflowValidate } from "@/workflow/validate"
import { WorkflowOrchestrator } from "@/workflow/orchestrator"
import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"

const params = z.object({
  action: z.enum(["init", "validate", "next", "advance"]).describe("Workflow action"),
  slug: z.string().optional().describe("Task slug (for next/advance)"),
  text: z.string().optional().describe("Optional text to derive slug from (init only)"),
})

type WorkflowMetadata = Record<string, unknown>

function slug(text: string) {
  const words = text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 6)
    .join("-")
  const base = words && words.length ? words : "task"
  const hash = crypto.createHash("sha1").update(text.trim()).digest("hex").slice(0, 8)
  return `${base}-${hash}`.slice(0, 60)
}

function lastUser(ctx: Tool.Context) {
  const msg = [...ctx.messages].reverse().find((m) => m.info.role === "user")
  const parts = msg?.parts ?? []
  const text = parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim()
  return text && text.length ? text : undefined
}

export const WorkflowTool = Tool.define<typeof params, WorkflowMetadata>("workflow", {
  description: DESCRIPTION,
  parameters: params,
  async execute(input, ctx) {
    if (input.action === "init") {
      const seed = input.text ?? lastUser(ctx)
      if (!seed) throw new Error("init requires `text` or a prior user message")

      const s = slug(seed)
      const file = path.join(Instance.worktree, "tasks", `${s}.md`)
      const existed = await Filesystem.exists(file)
      if (!existed) {
        const content = [`# Task: ${s}`, "", "AUTO_CREATED=1", "", "ROUTE:NEXT=planner", ""].join("\n")
        await Filesystem.write(file, content)
      }

      return {
        title: "workflow init",
        output: JSON.stringify({ slug: s, file: `tasks/${s}.md`, existed }, null, 2),
        metadata: { slug: s, file, existed } as Record<string, unknown>,
      }
    }

    if (input.action === "validate") {
      const result = await WorkflowValidate.run()
      return {
        title: "workflow validate",
        output: result.ok ? "ok" : result.errors.join("\n"),
        metadata: result as Record<string, unknown>,
      }
    }

    if (!input.slug) throw new Error("slug is required")

    if (input.action === "next") {
      const next = await WorkflowOrchestrator.next(input.slug)
      const metadata: Record<string, unknown> = { agent: next.agent, source: next.source }
      return {
        title: "workflow next",
        output: JSON.stringify(metadata, null, 2),
        metadata,
      }
    }

    const out = await WorkflowOrchestrator.advance(input.slug)
    return {
      title: "workflow advance",
      output: JSON.stringify(out, null, 2),
      metadata: out as Record<string, unknown>,
    }
  },
})
