import z from "zod"
import { Identifier } from "../id/id"

export const SwarmSlot = z.union([z.literal(1), z.literal(2)])
export type SwarmSlot = z.infer<typeof SwarmSlot>

export const SwarmRole = z.enum(["main", "subagent"])
export type SwarmRole = z.infer<typeof SwarmRole>

export const SwarmPhase = z.enum([
  "idle",
  "analyzing",
  "planning",
  "tool_run",
  "patch_apply",
  "tests",
  "done",
  "error",
  "waiting_consent",
])
export type SwarmPhase = z.infer<typeof SwarmPhase>

export const SwarmStatus = z.enum(["pending", "working", "idle", "done", "error"])
export type SwarmStatus = z.infer<typeof SwarmStatus>

export const SwarmRuntimeEventType = z.enum([
  "swarm.started",
  "swarm.ended",
  "swarm.slot.started",
  "swarm.slot.ended",
  "swarm.slot.status",
  "swarm.consent_required",
  "swarm.consent_granted",
  "swarm.consent_denied",
  "swarm.error",
  "swarm.patch_ready",
  "swarm.patch_applied",
  "swarm.patch_failed",
])
export type SwarmEventType = z.infer<typeof SwarmRuntimeEventType>

export const SwarmRuntimeEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("swarm.started"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    max_subagents: z.number(),
    max_executors: z.number(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.ended"),
    run_id: z.string(),
    swarm_id: z.string(),
    reason: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.slot.started"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    parent_session_id: z.string().nullable(),
    slot: SwarmSlot,
    role: SwarmRole,
    agent_name: z.string(),
    model: z.string(),
    phase: SwarmPhase,
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.slot.ended"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    slot: SwarmSlot,
    status: SwarmStatus,
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.slot.status"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    slot: SwarmSlot,
    status: SwarmStatus,
    phase: SwarmPhase,
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.consent_required"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    reason: z.string(),
    planned_tasks: z.array(z.string()),
    models: z.array(z.string()),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.consent_granted"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.consent_denied"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.error"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string().nullable(),
    slot: SwarmSlot.nullable(),
    error: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.patch_ready"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    slot: SwarmSlot,
    patch: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.patch_applied"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    slot: SwarmSlot,
    success: z.boolean(),
    conflicts: z.array(z.string()).optional(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("swarm.patch_failed"),
    run_id: z.string(),
    swarm_id: z.string(),
    session_id: z.string(),
    slot: SwarmSlot,
    error: z.string(),
    ts: z.number(),
  }),
])
export type SwarmEvent = z.infer<typeof SwarmRuntimeEvent>

export interface SwarmSlotState {
  slot: SwarmSlot
  session_id: string | null
  parent_session_id: string | null
  role: SwarmRole
  agent_name: string
  model: string
  status: SwarmStatus
  phase: SwarmPhase
}

export interface SwarmRuntimeState {
  id: string
  run_id: string
  session_id: string
  enabled: boolean
  max_subagents: number
  max_executors: number
  subagent_models: string[]
  slots: [SwarmSlotState | null, SwarmSlotState | null]
  waiting_consent: boolean
  consent_request: {
    swarm_id: string
    reason: string
    planned_tasks: string[]
    models: string[]
  } | null
}

export function createSwarmId(): string {
  return `swm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function createSwarmRuntimeState(
  run_id: string,
  session_id: string,
  enabled: boolean,
  max_subagents: number,
  max_executors: number,
  subagent_models: string[],
): SwarmRuntimeState {
  return {
    id: createSwarmId(),
    run_id,
    session_id,
    enabled,
    max_subagents: Math.min(max_subagents, 2),
    max_executors: Math.min(max_executors, 3),
    subagent_models,
    slots: [null, null],
    waiting_consent: false,
    consent_request: null,
  }
}
