import path from "path"
import fs from "fs/promises"
import { Log } from "../util/log"
import {
  type SwarmState,
  type SwarmEvent,
  type Agent,
  type Task,
  type OrchestrationMode,
  type SwarmRole,
  createSwarmState,
  SwarmStatus,
} from "./types"

const log = Log.create({ service: "swarm" })

async function mkdirp(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function rmrf(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {}
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

const TOKEN_PATTERNS = [
  /[a-zA-Z0-9_-]*token[a-zA-Z0-9_-]*[=:][\s]*[a-zA-Z0-9_-]+/gi,
  /[a-zA-Z0-9_-]*api[_-]?key[a-zA-Z0-9_-]*[=:][\s]*[a-zA-Z0-9_-]+/gi,
  /[a-zA-Z0-9_-]*secret[a-zA-Z0-9_-]*[=:][\s]*[a-zA-Z0-9_-]+/gi,
  /password[=:][\s]*[^\s]+/gi,
  /bearer[ ][a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
]

function redact(text: string): string {
  let result = text
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, "$1[REDACTED]")
  }
  return result
}

export class SwarmCoordinator {
  private state: SwarmState
  private runDir: string
  private gitRoot: string // The git repo root for worktree operations
  private abortController: AbortController
  private eventBus: SwarmEvent[] = []
  private journal: string

  constructor(goal: string, mode: OrchestrationMode = "strict-hierarchy") {
    this.state = createSwarmState(goal, mode)
    this.runDir = ""
    this.gitRoot = ""
    this.abortController = new AbortController()
    this.journal = ""
  }

  get id(): string {
    return this.state.id
  }

  get gitRepositoryRoot(): string {
    return this.gitRoot
  }

  get runDirectory(): string {
    return this.runDir
  }

  async init(rootDir: string): Promise<void> {
    this.runDir = path.join(rootDir, ".openhei", "swarm", "runs", this.state.id)
    this.gitRoot = rootDir // The git repo root for worktree operations

    await mkdirp(this.runDir)
    await mkdirp(path.join(this.runDir, "worktrees"))
    await mkdirp(path.join(this.runDir, "logs"))

    this.journal = path.join(this.runDir, "journal.jsonl")

    await this.saveState()
    log.info("swarm initialized", { id: this.state.id, runDir: this.runDir, gitRoot: this.gitRoot })
  }

  async load(runId: string, rootDir: string): Promise<boolean> {
    this.runDir = path.join(rootDir, ".openhei", "swarm", "runs", runId)
    this.gitRoot = rootDir
    const stateFile = path.join(this.runDir, "SWARM_STATE.json")

    if (!(await exists(stateFile))) {
      return false
    }

    const content = await fs.readFile(stateFile, "utf-8")
    const parsed = JSON.parse(content)
    this.state = parsed
    this.journal = path.join(this.runDir, "journal.jsonl")
    return true
  }

  async saveState(): Promise<void> {
    const stateFile = path.join(this.runDir, "SWARM_STATE.json")
    this.state.updatedAt = Date.now()
    await fs.writeFile(stateFile, JSON.stringify(this.state, null, 2))

    const tasksFile = path.join(this.runDir, "SWARM_TASKS.md")
    await fs.writeFile(tasksFile, this.renderTasks())
  }

  private renderTasks(): string {
    const lines = ["# Swarm Tasks\n", `Goal: ${this.state.goal}\n\n`]

    for (const [taskId, task] of Object.entries(this.state.tasks)) {
      lines.push(`## ${taskId}: ${task.title}`)
      lines.push(`- Status: ${task.status}`)
      lines.push(`- Assignee: ${task.assignee ?? "unassigned"}`)
      lines.push(`- Description: ${task.description}`)
      if (task.error) lines.push(`- Error: ${task.error}`)
      lines.push("")
    }

    return lines.join("\n")
  }

  async appendJournal(event: SwarmEvent): Promise<void> {
    this.eventBus.push(event)
    const line = JSON.stringify({ ...event, timestamp: Date.now() }) + "\n"
    this.journal += line
    await fs.writeFile(this.journal, line, { flag: "a" })
  }

  getState(): SwarmState {
    return this.state
  }

  getAgents(): Agent[] {
    return Object.values(this.state.agents)
  }

  getTasks(): Task[] {
    return Object.values(this.state.tasks)
  }

  getAgent(agentId: string): Agent | undefined {
    return this.state.agents[agentId]
  }

  getTask(taskId: string): Task | undefined {
    return this.state.tasks[taskId]
  }

  async assignTask(agentId: string, taskId: string): Promise<void> {
    const agent = this.state.agents[agentId]
    const task = this.state.tasks[taskId]
    if (!agent || !task) throw new Error("Invalid agent or task")

    agent.taskId = taskId
    agent.status = "running"
    agent.lastUpdate = Date.now()
    task.assignee = agentId
    task.status = "running"

    await this.appendJournal({ type: "task-assigned", agentId, taskId })
    await this.saveState()
  }

  async startTask(agentId: string, taskId: string): Promise<void> {
    await this.appendJournal({ type: "task-started", agentId, taskId })
  }

  async completeTask(agentId: string, taskId: string, result: string): Promise<void> {
    const agent = this.state.agents[agentId]
    const task = this.state.tasks[taskId]
    if (!agent || !task) throw new Error("Invalid agent or task")

    task.status = "completed"
    task.result = result
    agent.status = "completed"
    agent.lastUpdate = Date.now()

    await this.appendJournal({ type: "task-completed", agentId, taskId, result })
    await this.saveState()
  }

  async completeTaskWithGates(agentId: string, taskId: string, result: string): Promise<void> {
    const agent = this.state.agents[agentId]
    const task = this.state.tasks[taskId]
    if (!agent || !task) throw new Error("Invalid agent or task")

    task.status = "completed"
    task.result = result
    task.gatesPassed = true
    agent.status = "completed"
    agent.lastUpdate = Date.now()

    await this.appendJournal({ type: "task-completed", agentId, taskId, result, gatesPassed: true })
    await this.saveState()
  }

  async failTask(agentId: string, taskId: string, error: string): Promise<void> {
    const agent = this.state.agents[agentId]
    const task = this.state.tasks[taskId]
    if (!agent || !task) throw new Error("Invalid agent or task")

    task.attempts++
    task.error = error

    if (task.attempts >= 2) {
      task.status = "blocked"
      agent.status = "blocked"
    } else {
      task.status = "pending"
      agent.status = "pending"
      agent.taskId = undefined
    }
    agent.lastUpdate = Date.now()

    await this.appendJournal({ type: "task-failed", agentId, taskId, error })
    await this.saveState()
  }

  async createTask(title: string, description: string, dependencies: string[] = []): Promise<string> {
    const taskId = `task-${Object.keys(this.state.tasks).length + 1}`
    this.state.tasks[taskId] = {
      id: taskId,
      title,
      description,
      dependencies,
      status: "pending",
      attempts: 0,
    }
    await this.saveState()
    return taskId
  }

  async setStatus(status: SwarmStatus): Promise<void> {
    this.state.status = status
    await this.saveState()
  }

  TOKEN_PATTERNS = [
    /[a-zA-Z0-9_-]*token[a-zA-Z0-9_-]*[=:][\s]*[a-zA-Z0-9_-]+/gi,
    /[a-zA-Z0-9_-]*api[_-]?key[a-zA-Z0-9_-]*[=:][\s]*[a-zA-Z0-9_-]+/gi,
    /[a-zA-Z0-9_-]*secret[a-zA-Z0-9_-]*[=:][\s]*[a-zA-Z0-9_-]+/gi,
    /password[=:][\s]*[^\s]+/gi,
    /bearer[ ][a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
  ]

  async addLog(agentId: string, logEntry: string): Promise<void> {
    const agent = this.state.agents[agentId]
    if (!agent) return

    const timestamp = new Date().toISOString()
    const redacted = redact(logEntry)
    agent.logs += `[${timestamp}] ${redacted}\n`

    const logFile = path.join(this.runDir, "logs", `${agentId}.log`)
    await fs.writeFile(logFile, agent.logs, { flag: "a" })
  }

  async setWorktree(agentId: string, worktree: string): Promise<void> {
    const agent = this.state.agents[agentId]
    if (!agent) return

    agent.worktree = worktree
    await this.saveState()
  }

  async setIntegrationCommit(commit: string): Promise<void> {
    this.state.integrationCommit = commit
    await this.saveState()
  }

  async setPrDraft(draft: string): Promise<void> {
    this.state.prDraft = draft
    const draftFile = path.join(this.runDir, "PR_DRAFT.md")
    await fs.writeFile(draftFile, draft)
    await this.saveState()
  }

  getWorktreePath(agentId: string): string {
    return path.join(this.runDir, "worktrees", agentId)
  }

  getIntegrationWorktreePath(): string {
    return path.join(this.runDir, "integration")
  }

  abort(): void {
    this.abortController.abort()
  }

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  isAborted(): boolean {
    return this.abortController.signal.aborted
  }

  async cleanup(keepWorktrees: boolean = false): Promise<void> {
    if (keepWorktrees) {
      log.info("cleanup skipped (keeping worktrees)", { id: this.state.id })
      return
    }

    log.info("starting cleanup", { id: this.state.id, runDir: this.runDir })

    // Use WorktreeManager to properly remove git worktrees
    const { WorktreeManager } = await import("./worktree")
    const wm = new WorktreeManager(this.runDir, this.gitRoot)

    // Remove each agent's worktree (from state)
    for (const agent of Object.values(this.state.agents)) {
      if (agent.worktree) {
        try {
          await wm.remove(agent.worktree)
          log.info("removed worktree", { agentId: agent.id, path: agent.worktree })
        } catch (e) {
          log.warn("failed to remove worktree", { agentId: agent.id, error: String(e) })
        }
      }
    }

    // Also remove any worktrees that might not be in state (e.g., from failed runs)
    const worktreesDir = path.join(this.runDir, "worktrees")
    try {
      if (await exists(worktreesDir)) {
        const entries = await fs.readdir(worktreesDir)
        for (const entry of entries) {
          const worktreePath = path.join(worktreesDir, entry)
          try {
            await wm.remove(worktreePath)
            log.info("removed orphaned worktree", { path: worktreePath })
          } catch (e) {
            // Ignore - might not be a git worktree
          }
        }
      }
    } catch (e) {
      log.warn("failed to cleanup worktrees dir", { error: String(e) })
    }

    // Remove integration worktree
    const integrationPath = path.join(this.runDir, "integration")
    try {
      await wm.remove(integrationPath)
      log.info("removed integration worktree")
    } catch (e) {
      log.warn("failed to remove integration worktree", { error: String(e) })
    }

    // Also remove the directories themselves
    const dirs = [worktreesDir, integrationPath]

    for (const dir of dirs) {
      if (await exists(dir)) {
        try {
          await rmrf(dir)
        } catch (e) {
          log.warn("failed to cleanup directory", { dir, error: String(e) })
        }
      }
    }

    log.info("cleanup completed", { id: this.state.id })
  }

  async getStatus(): Promise<string> {
    const lines = [
      `Swarm ID: ${this.state.id}`,
      `Goal: ${this.state.goal}`,
      `Mode: ${this.state.mode}`,
      `Status: ${this.state.status}`,
      `Created: ${new Date(this.state.createdAt).toISOString()}`,
      "",
      "Agents:",
    ]

    for (const agent of Object.values(this.state.agents)) {
      lines.push(`  ${agent.id} (${agent.role}): ${agent.status}${agent.taskId ? ` - task: ${agent.taskId}` : ""}`)
    }

    lines.push("", "Tasks:")
    for (const task of Object.values(this.state.tasks)) {
      lines.push(`  ${task.id}: ${task.title} - ${task.status}`)
    }

    return lines.join("\n")
  }
}
