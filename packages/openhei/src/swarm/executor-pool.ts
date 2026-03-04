import { Log } from "../util/log"
import { EventEmitter } from "events"
import type { SwarmEvent, SwarmSlot, SwarmRuntimeState, SwarmSlotState } from "./runtime"
import { RunEventBus } from "../stream/event-bus"
import { Config } from "../config/config"
import { Session } from "../session"
import { Agent } from "../agent/agent"
import { Identifier } from "../id/id"
import { Instance } from "../project/instance"
import { SessionPrompt } from "../session/prompt"

const log = Log.create({ service: "swarm.runtime" })

export class SwarmExecutorPool extends EventEmitter {
  private state: SwarmRuntimeState
  private running = false
  private aborted = false

  constructor(state: SwarmRuntimeState) {
    super()
    this.state = state
  }

  get id(): string {
    return this.state.id
  }

  get swarmId(): string {
    return this.state.id
  }

  get runId(): string {
    return this.state.run_id
  }

  get sessionId(): string {
    return this.state.session_id
  }

  isEnabled(): boolean {
    return this.state.enabled
  }

  getMaxSubagents(): number {
    return this.state.max_subagents
  }

  getMaxExecutors(): number {
    return this.state.max_executors
  }

  getSubagentModels(): string[] {
    return this.state.subagent_models
  }

  getSlotState(slot: SwarmSlot): SwarmSlotState | null {
    return this.state.slots[slot - 1]
  }

  isSlotAvailable(slot: SwarmSlot): boolean {
    return this.state.slots[slot - 1] === null
  }

  getAvailableSlot(): SwarmSlot | null {
    for (let i = 1; i <= 2; i++) {
      if (this.isSlotAvailable(i as SwarmSlot)) {
        return i as SwarmSlot
      }
    }
    return null
  }

  canSpawnSubagent(): boolean {
    if (!this.state.enabled) return false
    if (this.state.waiting_consent) return false
    const activeSlots = this.state.slots.filter((s) => s !== null && s.status === "working")
    return activeSlots.length < this.state.max_subagents
  }

  private emitEvent(event: SwarmEvent) {
    this.emit("event", event)
    RunEventBus.publish({
      run_id: this.state.run_id,
      type: event.type,
      properties: event,
    })
  }

  async requestConsent(reason: string, planned_tasks: string[], models: string[]): Promise<void> {
    this.state.waiting_consent = true
    this.state.consent_request = {
      swarm_id: this.state.id,
      reason,
      planned_tasks,
      models,
    }

    this.emitEvent({
      type: "swarm.consent_required",
      run_id: this.state.run_id,
      swarm_id: this.state.id,
      session_id: this.state.session_id,
      reason,
      planned_tasks,
      models,
      ts: Date.now(),
    })

    log.info("consent required", { swarm_id: this.state.id, reason })
  }

  async grantConsent(): Promise<void> {
    if (!this.state.waiting_consent) {
      log.warn("no pending consent request", { swarm_id: this.state.id })
      return
    }

    this.state.waiting_consent = false
    const consent_request = this.state.consent_request
    this.state.consent_request = null

    this.emitEvent({
      type: "swarm.consent_granted",
      run_id: this.state.run_id,
      swarm_id: this.state.id,
      session_id: this.state.session_id,
      ts: Date.now(),
    })

    log.info("consent granted", { swarm_id: this.state.id })

    return
  }

  async denyConsent(): Promise<void> {
    if (!this.state.waiting_consent) {
      log.warn("no pending consent request", { swarm_id: this.state.id })
      return
    }

    this.state.waiting_consent = false
    const consent_request = this.state.consent_request
    this.state.consent_request = null

    this.emitEvent({
      type: "swarm.consent_denied",
      run_id: this.state.run_id,
      swarm_id: this.state.id,
      session_id: this.state.session_id,
      ts: Date.now(),
    })

    log.info("consent denied", { swarm_id: this.state.id })
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    this.emitEvent({
      type: "swarm.started",
      run_id: this.state.run_id,
      swarm_id: this.state.id,
      session_id: this.state.session_id,
      max_subagents: this.state.max_subagents,
      max_executors: this.state.max_executors,
      ts: Date.now(),
    })

    log.info("swarm started", {
      swarm_id: this.state.id,
      run_id: this.state.run_id,
      max_subagents: this.state.max_subagents,
      max_executors: this.state.max_executors,
    })
  }

  async stop(reason: string = "stopped"): Promise<void> {
    if (!this.running) return
    this.running = false
    this.aborted = true

    for (let i = 0; i < this.state.slots.length; i++) {
      const slot = this.state.slots[i]
      if (slot && slot.session_id) {
        try {
          SessionPrompt.cancel(slot.session_id)
        } catch (e) {
          log.warn("failed to cancel session", { session_id: slot.session_id, error: e })
        }
      }
    }

    this.emitEvent({
      type: "swarm.ended",
      run_id: this.state.run_id,
      swarm_id: this.state.id,
      reason,
      ts: Date.now(),
    })

    log.info("swarm stopped", { swarm_id: this.state.id, reason })
  }

  isStopped(): boolean {
    return this.aborted
  }

  async executeTask(params: {
    slot: SwarmSlot
    agentName: string
    model: { providerID: string; modelID: string }
    prompt: string
    parentSessionID: string
    taskDescription: string
  }): Promise<{ sessionID: string; result: string }> {
    const slotIndex = params.slot - 1

    const session = await Session.create({
      parentID: params.parentSessionID,
      title: params.taskDescription + ` (@${params.agentName} subagent)`,
      permission: [],
    })

    const slotState: SwarmSlotState = {
      slot: params.slot,
      session_id: session.id,
      parent_session_id: params.parentSessionID,
      role: "subagent",
      agent_name: params.agentName,
      model: `${params.model.providerID}/${params.model.modelID}`,
      status: "working",
      phase: "analyzing",
    }

    this.state.slots[slotIndex] = slotState

    this.emitEvent({
      type: "swarm.slot.started",
      run_id: this.state.run_id,
      swarm_id: this.state.id,
      session_id: session.id,
      parent_session_id: params.parentSessionID,
      slot: params.slot,
      role: "subagent",
      agent_name: params.agentName,
      model: `${params.model.providerID}/${params.model.modelID}`,
      phase: "analyzing",
      ts: Date.now(),
    })

    log.info("slot started", {
      swarm_id: this.state.id,
      slot: params.slot,
      session_id: session.id,
      agent: params.agentName,
    })

    const messageID = Identifier.ascending("message")

    try {
      this.state.slots[slotIndex]!.phase = "tool_run"
      this.emitEvent({
        type: "swarm.slot.status",
        run_id: this.state.run_id,
        swarm_id: this.state.id,
        session_id: session.id,
        slot: params.slot,
        status: "working",
        phase: "tool_run",
        ts: Date.now(),
      })

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: params.model,
        agent: params.agentName,
        tools: {
          todo: false,
        },
        parts: [{ type: "text", text: params.prompt }],
      })

      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      this.state.slots[slotIndex]!.status = "done"
      this.state.slots[slotIndex]!.phase = "done"

      this.emitEvent({
        type: "swarm.slot.ended",
        run_id: this.state.run_id,
        swarm_id: this.state.id,
        session_id: session.id,
        slot: params.slot,
        status: "done",
        ts: Date.now(),
      })

      log.info("slot completed", {
        swarm_id: this.state.id,
        slot: params.slot,
        session_id: session.id,
      })

      return { sessionID: session.id, result: text }
    } catch (error) {
      this.state.slots[slotIndex]!.status = "error"
      this.state.slots[slotIndex]!.phase = "error"

      this.emitEvent({
        type: "swarm.slot.ended",
        run_id: this.state.run_id,
        swarm_id: this.state.id,
        session_id: session.id,
        slot: params.slot,
        status: "error",
        ts: Date.now(),
      })

      this.emitEvent({
        type: "swarm.error",
        run_id: this.state.run_id,
        swarm_id: this.state.id,
        session_id: session.id,
        slot: params.slot,
        error: String(error),
        ts: Date.now(),
      })

      log.error("slot error", {
        swarm_id: this.state.id,
        slot: params.slot,
        error,
      })

      throw error
    }
  }

  getState(): SwarmRuntimeState {
    return this.state
  }
}

const swarmPools = new Map<string, SwarmExecutorPool>()

export async function createSwarmPool(run_id: string, session_id: string): Promise<SwarmExecutorPool> {
  const config = await Config.get()
  const swarmConfig = config.swarm || {
    enabled: false,
    max_subagents: 2,
    max_parallel_executors: 3,
    subagent_models: [],
  }

  const { createSwarmRuntimeState } = await import("./runtime")
  const state = createSwarmRuntimeState(
    run_id,
    session_id,
    swarmConfig.enabled,
    swarmConfig.max_subagents,
    swarmConfig.max_parallel_executors,
    swarmConfig.subagent_models,
  )

  const pool = new SwarmExecutorPool(state)
  swarmPools.set(state.id, pool)

  return pool
}

export function getSwarmPool(swarm_id: string): SwarmExecutorPool | undefined {
  return swarmPools.get(swarm_id)
}

export function getSwarmPoolByRunId(run_id: string): SwarmExecutorPool | undefined {
  for (const pool of swarmPools.values()) {
    if (pool.runId === run_id) {
      return pool
    }
  }
  return undefined
}

export function removeSwarmPool(swarm_id: string): void {
  swarmPools.delete(swarm_id)
}
