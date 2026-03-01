import { Log } from "../util/log"
import { SwarmCoordinator } from "./coordinator"
import { WorktreeManager } from "./worktree"
import type { OrchestrationMode, SwarmRole, SwarmState, Task } from "./types"
import { execGates } from "./gates"
import { generatePrDraft } from "./pr-draft"

const log = Log.create({ service: "swarm.executor" })

export interface Strategy {
  name: OrchestrationMode
  assign(coordinator: SwarmCoordinator, tasks: Task[]): Promise<void>
  debate(coordinator: SwarmCoordinator, taskId: string): Promise<void>
  merge(coordinator: SwarmCoordinator): Promise<void>
}

export class SwarmExecutor {
  private coordinator: SwarmCoordinator
  private worktreeManager: WorktreeManager
  private strategy: Strategy

  constructor(coordinator: SwarmCoordinator, strategy: Strategy) {
    this.coordinator = coordinator
    this.worktreeManager = new WorktreeManager(coordinator.runDirectory, coordinator.gitRepositoryRoot)
    this.strategy = strategy
  }

  async run(goal: string): Promise<void> {
    const state = this.coordinator.getState()
    log.info("starting swarm execution", { id: state.id, goal, mode: state.mode })

    await this.coordinator.setStatus("running")

    try {
      await this.setupWorktrees()

      await this.phasePlanning(goal)

      await this.phaseExecution()

      await this.phaseMerge()

      await this.phaseFinalGates()

      await this.generateArtifacts()

      await this.coordinator.setStatus("completed")
      log.info("swarm execution completed", { id: state.id })
    } catch (error) {
      log.error("swarm execution failed", { id: state.id, error: String(error) })
      await this.coordinator.setStatus("failed")
      throw error
    }
  }

  private async setupWorktrees(): Promise<void> {
    const agents = this.coordinator.getAgents()

    for (const agent of agents) {
      if (agent.role === "lead") continue

      try {
        const worktree = await this.worktreeManager.create(agent.id)
        await this.coordinator.setWorktree(agent.id, worktree.path)
        log.info("worktree created", { agentId: agent.id, path: worktree.path })
      } catch (error) {
        log.error("failed to create worktree", { agentId: agent.id, error: String(error) })
      }
    }

    try {
      await this.worktreeManager.createIntegration()
      log.info("integration worktree created")
    } catch (error) {
      log.error("failed to create integration worktree", { error: String(error) })
    }
  }

  private async phasePlanning(goal: string): Promise<void> {
    const lead = this.coordinator.getAgents().find((a) => a.role === "lead")
    if (!lead) {
      throw new Error("No lead agent found")
    }

    log.info("planning phase started", { leadId: lead.id })

    const planningPrompt = `
You are the Lead agent for a swarm execution.

Goal: ${goal}

Your job is to:
1. Break down this goal into discrete tasks
2. Assign tasks to appropriate worker agents
3. Consider dependencies between tasks

Return a JSON array of tasks with the following structure:
[
  {
    "title": "Task title",
    "description": "Detailed description of what needs to be done",
    "dependencies": ["task-id-1", "task-id-2"] // IDs of tasks that must complete first
  }
]

Create 3-6 tasks maximum. Be realistic about what can be accomplished.
`

    await this.coordinator.addLog(lead.id, "Starting planning phase")
    await this.coordinator.addLog(lead.id, `Goal: ${goal}`)

    // In a real implementation, this would call the LLM
    // For now, we'll create some default tasks
    const defaultTasks = [
      {
        title: "Implement core functionality",
        description: "Implement the main feature based on the goal",
        dependencies: [],
      },
      {
        title: "Write tests",
        description: "Write unit and integration tests for the implementation",
        dependencies: ["task-1"],
      },
      {
        title: "Security review",
        description: "Review code for security vulnerabilities",
        dependencies: ["task-1"],
      },
    ]

    let taskIdx = 1
    for (const task of defaultTasks) {
      await this.coordinator.createTask(`task-${taskIdx}: ${task.title}`, task.description, task.dependencies)
      taskIdx++
    }

    await this.strategy.assign(this.coordinator, this.coordinator.getTasks())
  }

  private async phaseExecution(): Promise<void> {
    log.info("execution phase started")

    const tasks = this.coordinator.getTasks().filter((t) => t.status === "pending")

    for (const task of tasks) {
      if (this.coordinator.isAborted()) {
        log.warn("execution aborted")
        break
      }

      const assigneeId = task.assignee
      if (!assigneeId) {
        log.warn("task has no assignee", { taskId: task.id })
        continue
      }

      log.info("executing task", { taskId: task.id, assignee: assigneeId })

      await this.coordinator.assignTask(assigneeId, task.id)
      await this.coordinator.startTask(assigneeId, task.id)

      const agent = this.coordinator.getAgent(assigneeId)
      if (!agent?.worktree) {
        await this.coordinator.failTask(assigneeId, task.id, "No worktree available")
        continue
      }

      try {
        // Run the agent's work in their worktree
        // In a real implementation, this would invoke the agent with the task
        await this.coordinator.addLog(assigneeId, `Working on task: ${task.title}`)
        await this.coordinator.addLog(assigneeId, `Description: ${task.description}`)

        // Simulate work completion
        await this.coordinator.completeTask(assigneeId, task.id, "Task completed successfully")

        // Run gates in the worktree - HARD GATE: must pass before merge
        const gatesPassed = await execGates(agent.worktree, this.coordinator.getState().config.gates)

        if (!gatesPassed) {
          // HARD GATE: task cannot merge if gates fail
          await this.coordinator.failTask(assigneeId, task.id, "Gates failed - cannot merge")

          if (task.attempts >= 2) {
            // After 2 failures, escalate to lead for replanning
            await this.coordinator.setStatus("debating")
            await this.strategy.debate(this.coordinator, task.id)
          }
          // Do NOT proceed to merge - fail closed
          continue
        }

        // Gates passed - task is now mergeable (HARD GATE satisfied)
        await this.coordinator.completeTaskWithGates(assigneeId, task.id, "Task completed - gates passed")
        await this.coordinator.addLog(assigneeId, `Gates passed - task ready for merge`)

        log.info("task completed with gates passed", { taskId: task.id, assignee: assigneeId })
      } catch (error) {
        await this.coordinator.failTask(assigneeId, task.id, String(error))
        log.error("task failed", { taskId: task.id, error: String(error) })
      }
    }
  }

  private async phaseMerge(): Promise<void> {
    log.info("merge phase started")

    await this.strategy.merge(this.coordinator)
  }

  private async phaseFinalGates(): Promise<void> {
    log.info("final gates phase started")

    const integrationPath = this.coordinator.getIntegrationWorktreePath()
    const gatesPassed = await execGates(integrationPath, this.coordinator.getState().config.gates)

    if (!gatesPassed) {
      throw new Error("Final gates failed - cannot merge")
    }

    log.info("final gates passed")
  }

  private async generateArtifacts(): Promise<void> {
    log.info("generating artifacts")

    const state = this.coordinator.getState()
    const draft = generatePrDraft(state)

    await this.coordinator.setPrDraft(draft)

    log.info("artifacts generated")
  }

  async stop(): Promise<void> {
    log.info("stopping swarm")
    this.coordinator.abort()
    await this.coordinator.cleanup(false)
  }
}

export function createStrategy(mode: OrchestrationMode): Strategy {
  switch (mode) {
    case "strict-hierarchy":
      return new StrictHierarchyStrategy()
    case "democracy":
      return new DemocracyStrategy()
    case "parallel-only":
      return new ParallelOnlyStrategy()
    case "adversarial-duel":
      return new AdversarialDuelStrategy()
    default:
      return new StrictHierarchyStrategy()
  }
}

export class StrictHierarchyStrategy implements Strategy {
  name: OrchestrationMode = "strict-hierarchy"

  async assign(coordinator: SwarmCoordinator, tasks: Task[]): Promise<void> {
    const workers = coordinator.getAgents().filter((a) => a.role === "worker")
    const reviewers = coordinator.getAgents().filter((a) => a.role === "reviewer")

    let workerIdx = 0
    for (const task of tasks) {
      const worker = workers[workerIdx % workers.length]
      await coordinator.assignTask(worker.id, task.id)
      workerIdx++
    }

    log.info("tasks assigned (strict-hierarchy)", { taskCount: tasks.length })
  }

  async debate(coordinator: SwarmCoordinator, taskId: string): Promise<void> {
    log.info("debate triggered", { taskId })
    // In strict-hierarchy, lead makes the decision
  }

  async merge(coordinator: SwarmCoordinator): Promise<void> {
    log.info("merge started (strict-hierarchy)")

    // Get only tasks that have passed gates (HARD GATE)
    const completedTasks = Object.values(coordinator.getState().tasks)
      .filter((t) => t.status === "completed" && t.gatesPassed === true)
      .sort((a, b) => {
        // Sort by dependency order
        if (a.dependencies.length === 0) return -1
        if (b.dependencies.length === 0) return 1
        return a.dependencies.length - b.dependencies.length
      })

    const integrationPath = coordinator.getIntegrationWorktreePath()
    const worktreeManager = new WorktreeManager(coordinator.runDirectory, coordinator.gitRepositoryRoot)

    for (const task of completedTasks) {
      if (!task.assignee) continue

      const agent = coordinator.getAgent(task.assignee)
      if (!agent?.worktree) continue

      try {
        // Cherry-pick worker commits into integration worktree
        const commits = await getCommits(agent.worktree)
        if (commits.length > 0) {
          const hasConflicts = await worktreeManager.cherryPickWithCheck(integrationPath, commits)

          if (hasConflicts) {
            // Conflict detected - trigger debate round
            log.warn("conflict detected during merge", { taskId: task.id })
            coordinator.setStatus("debating")

            // Run debate - max 2 rounds
            for (let round = 1; round <= 2; round++) {
              await coordinator.appendJournal({
                type: "debate-started",
                taskId: task.id,
                round,
              })

              // Get proposals from relevant agents
              const proposal = await getProposal(agent, task)

              // Vote (reviewer + security)
              const votes = await runVoting(coordinator, proposal)

              const decision = votes.approve > votes.reject ? "approve" : "reject"
              const rationale = `Round ${round}: ${decision} - ${proposal.reasoning}`

              await coordinator.appendJournal({
                type: "debate-decision",
                taskId: task.id,
                round,
                decision,
                rationale,
              })

              if (decision === "approve") {
                // Apply winning patch
                await applyPatch(integrationPath, proposal.patch)
                break
              }

              if (round === 2) {
                throw new Error("Merge blocked: debate exhausted without resolution")
              }
            }
          }
        }

        await coordinator.setIntegrationCommit(await worktreeManager.commit(integrationPath, `Merge: ${task.title}`))

        log.info("task merged", { taskId: task.id })
      } catch (error) {
        log.error("merge failed", { taskId: task.id, error: String(error) })
        throw error
      }
    }

    log.info("merge completed", { taskCount: completedTasks.length })
  }
}

export class DemocracyStrategy implements Strategy {
  name: OrchestrationMode = "democracy"

  async assign(coordinator: SwarmCoordinator, tasks: Task[]): Promise<void> {
    const workers = coordinator.getAgents().filter((a) => a.role === "worker")

    for (let i = 0; i < tasks.length; i++) {
      const worker = workers[i % workers.length]
      await coordinator.assignTask(worker.id, tasks[i].id)
    }
  }

  async debate(coordinator: SwarmCoordinator, taskId: string): Promise<void> {
    log.info("debate triggered (democracy)", { taskId })
  }

  async merge(coordinator: SwarmCoordinator): Promise<void> {
    log.info("merge started (democracy)")
  }
}

export class ParallelOnlyStrategy implements Strategy {
  name: OrchestrationMode = "parallel-only"

  async assign(coordinator: SwarmCoordinator, tasks: Task[]): Promise<void> {
    const workers = coordinator.getAgents().filter((a) => a.role === "worker")

    for (let i = 0; i < tasks.length; i++) {
      const worker = workers[i % workers.length]
      await coordinator.assignTask(worker.id, tasks[i].id)
    }
  }

  async debate(coordinator: SwarmCoordinator, taskId: string): Promise<void> {
    // No debate in parallel-only mode
  }

  async merge(coordinator: SwarmCoordinator): Promise<void> {
    log.info("merge started (parallel-only)")
  }
}

export class AdversarialDuelStrategy implements Strategy {
  name: OrchestrationMode = "adversarial-duel"

  async assign(coordinator: SwarmCoordinator, tasks: Task[]): Promise<void> {
    const workers = coordinator.getAgents().filter((a) => a.role === "worker")

    // Assign 2 workers per task for comparison
    for (const task of tasks) {
      const worker1 = workers[task.id.charCodeAt(task.id.length - 1) % workers.length]
      const worker2 = workers[(task.id.charCodeAt(task.id.length - 1) + 1) % workers.length]

      await coordinator.assignTask(worker1.id, task.id)
      await coordinator.assignTask(worker2.id, task.id)
    }
  }

  async debate(coordinator: SwarmCoordinator, taskId: string): Promise<void> {
    log.info("adversarial debate triggered", { taskId })
  }

  async merge(coordinator: SwarmCoordinator): Promise<void> {
    log.info("merge started (adversarial-duel)")
  }
}

async function getCommits(worktreePath: string): Promise<string[]> {
  const { git } = await import("../util/git")
  const result = await git(["log", "--format=%H"], { cwd: worktreePath })
  const text = await result.text()
  return text
    .split("\n")
    .map((s: string) => s.trim())
    .filter(Boolean)
}

async function getProposal(
  agent: import("./types").Agent,
  task: import("./types").Task,
): Promise<{ patch: string; reasoning: string }> {
  // In a real implementation, this would query the agent for their patch and reasoning
  // For now, return a stub
  return {
    patch: "",
    reasoning: "Proposed resolution based on task requirements",
  }
}

async function runVoting(
  coordinator: SwarmCoordinator,
  proposal: { patch: string; reasoning: string },
): Promise<{ approve: number; reject: number; abstain: number }> {
  // In a real implementation, this would query reviewer and security agents
  // For now, default to approve
  const reviewers = coordinator.getAgents().filter((a) => a.role === "reviewer" || a.role === "security")

  let approve = 0
  let reject = 0
  let abstain = 0

  // Default: approve if proposal is reasonable
  if (proposal.patch.length > 0) {
    approve = reviewers.length
  } else {
    reject = reviewers.length
  }

  return { approve, reject, abstain }
}

async function applyPatch(worktreePath: string, patch: string): Promise<void> {
  const { git } = await import("../util/git")
  // Apply patch using git apply
  if (patch.trim().length > 0) {
    await git(["apply", "--3way", "-"], { cwd: worktreePath })
  }
}
