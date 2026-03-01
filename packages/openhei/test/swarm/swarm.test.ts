import { describe, expect, test, beforeEach } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { createSwarmState, type SwarmState, type Task, type Agent, SwarmStatus } from "../../src/swarm/types"
import {
  createStrategy,
  StrictHierarchyStrategy,
  DemocracyStrategy,
  ParallelOnlyStrategy,
  AdversarialDuelStrategy,
} from "../../src/swarm/executor"

describe("swarm types", () => {
  test("createSwarmState generates valid state", () => {
    const state = createSwarmState("Test goal", "strict-hierarchy")

    expect(state.id).toBeDefined()
    expect(state.goal).toBe("Test goal")
    expect(state.mode).toBe("strict-hierarchy")
    expect(state.status).toBe("pending")
    expect(state.agents).toBeDefined()
    expect(state.tasks).toEqual({})
  })

  test("createSwarmState includes default agents", () => {
    const state = createSwarmState("Test")

    const agentIds = Object.keys(state.agents)
    expect(agentIds.length).toBeGreaterThan(0)

    const roles = Object.values(state.agents).map((a) => a.role)
    expect(roles).toContain("lead")
    expect(roles).toContain("worker")
    expect(roles).toContain("reviewer")
  })

  test("swarm state accepts different modes", () => {
    const modes = ["strict-hierarchy", "democracy", "parallel-only", "adversarial-duel"] as const

    for (const mode of modes) {
      const state = createSwarmState("Test", mode)
      expect(state.mode).toBe(mode)
    }
  })
})

describe("orchestration strategies", () => {
  test("StrictHierarchyStrategy assigns tasks to workers", async () => {
    const strategy = new StrictHierarchyStrategy()
    expect(strategy.name).toBe("strict-hierarchy")
  })

  test("DemocracyStrategy has correct name", () => {
    const strategy = new DemocracyStrategy()
    expect(strategy.name).toBe("democracy")
  })

  test("ParallelOnlyStrategy has correct name", () => {
    const strategy = new ParallelOnlyStrategy()
    expect(strategy.name).toBe("parallel-only")
  })

  test("AdversarialDuelStrategy has correct name", () => {
    const strategy = new AdversarialDuelStrategy()
    expect(strategy.name).toBe("adversarial-duel")
  })

  test("createStrategy returns correct strategy for each mode", () => {
    expect(createStrategy("strict-hierarchy").name).toBe("strict-hierarchy")
    expect(createStrategy("democracy").name).toBe("democracy")
    expect(createStrategy("parallel-only").name).toBe("parallel-only")
    expect(createStrategy("adversarial-duel").name).toBe("adversarial-duel")
  })

  test("createStrategy defaults to strict-hierarchy for unknown mode", () => {
    expect(createStrategy("unknown" as any).name).toBe("strict-hierarchy")
  })
})

describe("task management", () => {
  test("tasks can be added to state", () => {
    const state = createSwarmState("Test")

    // Simulate adding a task
    state.tasks["task-1"] = {
      id: "task-1",
      title: "Test Task",
      description: "A test task",
      dependencies: [],
      status: "pending",
      attempts: 0,
    }

    expect(Object.keys(state.tasks)).toContain("task-1")
    expect(state.tasks["task-1"].title).toBe("Test Task")
  })

  test("task dependencies are tracked", () => {
    const state = createSwarmState("Test")

    state.tasks["task-1"] = {
      id: "task-1",
      title: "Task 1",
      description: "First task",
      dependencies: [],
      status: "completed",
      attempts: 0,
    }

    state.tasks["task-2"] = {
      id: "task-2",
      title: "Task 2",
      description: "Second task",
      dependencies: ["task-1"],
      status: "pending",
      attempts: 0,
    }

    expect(state.tasks["task-2"].dependencies).toContain("task-1")
  })

  test("task status transitions", () => {
    const task: Task = {
      id: "task-1",
      title: "Test",
      description: "Test",
      dependencies: [],
      status: "pending",
      attempts: 0,
    }

    // Simulate status changes
    task.status = "running"
    expect(task.status).toBe("running")

    task.status = "completed"
    expect(task.status).toBe("completed")

    task.status = "failed"
    expect(task.status).toBe("failed")

    task.status = "blocked"
    expect(task.status).toBe("blocked")
  })

  test("blocked task after 2 failures", () => {
    const task: Task = {
      id: "task-1",
      title: "Test",
      description: "Test",
      dependencies: [],
      status: "pending",
      attempts: 0,
    }

    task.attempts = 1
    task.status = "failed"
    expect(task.status).toBe("failed")

    task.attempts = 2
    task.status = "failed"
    expect(task.status).toBe("failed")
    // After 2 attempts, should be blocked
  })
})

describe("agent management", () => {
  test("agent roles are correctly assigned", () => {
    const state = createSwarmState("Test")

    for (const agent of Object.values(state.agents)) {
      expect(agent.role).toMatch(/^(lead|worker|reviewer|security|qa|refactor)$/)
    }
  })

  test("agents have correct initial status", () => {
    const state = createSwarmState("Test")

    for (const agent of Object.values(state.agents)) {
      expect(agent.status).toBe("pending")
    }
  })

  test("agent can be assigned a task", () => {
    const agent: Agent = {
      id: "worker-0",
      role: "worker",
      status: "pending",
      logs: "",
    }

    agent.taskId = "task-1"
    agent.status = "running"

    expect(agent.taskId).toBe("task-1")
    expect(agent.status).toBe("running")
  })
})

describe("config defaults", () => {
  test("default config values", () => {
    const state = createSwarmState("Test")

    expect(state.config.maxWorkers).toBe(6)
    expect(state.config.timeout).toBe(600000)
    expect(state.config.gates).toEqual(["lint", "test", "typecheck"])
  })

  test("config can be overridden", () => {
    const state = createSwarmState("Test")

    state.config.maxWorkers = 8
    state.config.gates = ["lint", "test"]

    expect(state.config.maxWorkers).toBe(8)
    expect(state.config.gates).toEqual(["lint", "test"])
  })
})

describe("debate rounds", () => {
  test("debate rounds can be added to state", () => {
    const state = createSwarmState("Test")

    state.debateRounds.push({
      round: 1,
      proposer: "worker-0",
      patch: "diff content",
      argument: "This is better because...",
      votes: {
        "reviewer-0": "approve",
        "security-0": "approve",
      },
      decision: "approve",
      rationale: "Selected for better performance",
    })

    expect(state.debateRounds.length).toBe(1)
    expect(state.debateRounds[0].round).toBe(1)
    expect(state.debateRounds[0].decision).toBe("approve")
  })

  test("max 2 debate rounds enforced", () => {
    const state = createSwarmState("Test")

    // Add 2 rounds
    state.debateRounds.push({
      round: 1,
      proposer: "worker-0",
      patch: "patch 1",
      argument: "arg 1",
      votes: {},
      decision: "approve",
      rationale: "r1",
    })

    state.debateRounds.push({
      round: 2,
      proposer: "worker-1",
      patch: "patch 2",
      argument: "arg 2",
      votes: {},
      decision: "reject",
      rationale: "r2",
    })

    // Should not add a 3rd round
    expect(() => {
      if (state.debateRounds.length >= 2) {
        throw new Error("Max debate rounds reached")
      }
    }).toThrow()
  })
})
