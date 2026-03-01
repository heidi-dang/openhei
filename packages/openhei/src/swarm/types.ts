import z from "zod"
import { Identifier } from "../id/id"

function generateId(): string {
  return Identifier.create("session", false)
}

export const SwarmRole = z.enum(["lead", "worker", "reviewer", "security", "qa", "refactor"])
export type SwarmRole = z.infer<typeof SwarmRole>

export const SwarmStatus = z.enum(["pending", "running", "completed", "failed", "blocked", "debating"])
export type SwarmStatus = z.infer<typeof SwarmStatus>

export const OrchestrationMode = z.enum(["strict-hierarchy", "democracy", "parallel-only", "adversarial-duel"])
export type OrchestrationMode = z.infer<typeof OrchestrationMode>

export const Task = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  status: SwarmStatus.default("pending"),
  attempts: z.number().default(0),
  error: z.string().optional(),
  result: z.string().optional(),
  gatesPassed: z.boolean().optional(), // HARD GATE: must be true to merge
})
export type Task = z.infer<typeof Task>

export const Agent = z.object({
  id: z.string(),
  role: SwarmRole,
  model: z.string().optional(),
  provider: z.string().optional(),
  taskId: z.string().optional(),
  status: SwarmStatus.default("pending"),
  worktree: z.string().optional(),
  logs: z.string().default(""),
  lastUpdate: z.number().optional(),
})
export type Agent = z.infer<typeof Agent>

export const DebateRound = z.object({
  round: z.number(),
  proposer: z.string(),
  patch: z.string(),
  argument: z.string(),
  votes: z.record(z.string(), z.enum(["approve", "reject", "abstain"])),
  decision: z.enum(["approve", "reject"]).optional(),
  rationale: z.string().optional(),
})
export type DebateRound = z.infer<typeof DebateRound>

export const SwarmState = z.object({
  id: z.string(),
  goal: z.string(),
  mode: OrchestrationMode.default("strict-hierarchy"),
  baseBranch: z.string().default("HEAD"),
  status: SwarmStatus.default("pending"),
  createdAt: z.number(),
  updatedAt: z.number(),
  agents: z.record(z.string(), Agent),
  tasks: z.record(z.string(), Task),
  debateRounds: z.array(DebateRound).default([]),
  integrationCommit: z.string().optional(),
  prDraft: z.string().optional(),
  config: z
    .object({
      maxWorkers: z.number().default(6),
      leadModel: z.string().optional(),
      workerModel: z.string().optional(),
      gates: z.array(z.string()).default(["lint", "test", "typecheck"]),
      timeout: z.number().default(600000),
    })
    .default(() => ({ maxWorkers: 6, gates: ["lint", "test", "typecheck"], timeout: 600000 })),
})
export type SwarmState = z.infer<typeof SwarmState>

export const SwarmEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task-assigned"), agentId: z.string(), taskId: z.string() }),
  z.object({ type: z.literal("task-started"), agentId: z.string(), taskId: z.string() }),
  z.object({
    type: z.literal("task-completed"),
    agentId: z.string(),
    taskId: z.string(),
    result: z.string(),
    gatesPassed: z.boolean().optional(),
  }),
  z.object({ type: z.literal("task-failed"), agentId: z.string(), taskId: z.string(), error: z.string() }),
  z.object({ type: z.literal("debate-started"), taskId: z.string(), round: z.number() }),
  z.object({
    type: z.literal("debate-vote"),
    taskId: z.string(),
    round: z.number(),
    voter: z.string(),
    vote: z.enum(["approve", "reject", "abstain"]),
  }),
  z.object({
    type: z.literal("debate-decision"),
    taskId: z.string(),
    round: z.number(),
    decision: z.enum(["approve", "reject"]),
    rationale: z.string(),
  }),
  z.object({ type: z.literal("merge-started") }),
  z.object({ type: z.literal("merge-completed"), commit: z.string() }),
  z.object({ type: z.literal("merge-failed"), error: z.string() }),
  z.object({ type: z.literal("gates-passed"), worktree: z.string() }),
  z.object({ type: z.literal("gates-failed"), worktree: z.string(), errors: z.array(z.string()) }),
])
export type SwarmEvent = z.infer<typeof SwarmEvent>

export const DefaultRoles: Record<SwarmRole, { count: number; description: string }> = {
  lead: { count: 1, description: "Plans and coordinates the overall effort" },
  worker: { count: 3, description: "Implements assigned tasks" },
  reviewer: { count: 1, description: "Reviews and critiques work" },
  security: { count: 1, description: "Security hardening pass" },
  qa: { count: 1, description: "Tests and validates functionality" },
  refactor: { count: 0, description: "Optional cleanup and refactoring" },
}

export function createSwarmState(goal: string, mode: OrchestrationMode = "strict-hierarchy"): SwarmState {
  const id = generateId()
  const now = Date.now()

  const agents: Record<string, Agent> = {}
  let agentIdx = 0

  for (const [role, config] of Object.entries(DefaultRoles)) {
    for (let i = 0; i < config.count; i++) {
      const roleName = role as SwarmRole
      agents[`${roleName}-${agentIdx}`] = {
        id: `${roleName}-${agentIdx}`,
        role: roleName,
        status: "pending",
        logs: "",
        lastUpdate: now,
      }
      agentIdx++
    }
  }

  return {
    id,
    goal,
    mode,
    baseBranch: "HEAD",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    agents,
    tasks: {},
    debateRounds: [],
    config: {
      maxWorkers: 6,
      gates: ["lint", "test", "typecheck"],
      timeout: 600000,
    },
  }
}
