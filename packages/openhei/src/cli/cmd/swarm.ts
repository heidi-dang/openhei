import type { Argv } from "yargs"
import path from "path"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Log } from "../../util/log"
import { Global } from "../../global"
import { SwarmCoordinator, createStrategy, SwarmExecutor } from "../../swarm"
import { Instance } from "../../project/instance"
import fs from "fs/promises"

const log = Log.create({ service: "swarm" })

export const SwarmCommand = cmd({
  command: "swarm [goal]",
  describe: "Run a swarm of agents to accomplish a goal",
  builder: (yargs: Argv) => {
    return yargs
      .positional("goal", {
        describe: "Goal to accomplish",
        type: "string",
        demandOption: true,
      })
      .option("mode", {
        alias: ["m"],
        describe: "Orchestration mode",
        type: "string",
        choices: ["strict-hierarchy", "democracy", "parallel-only", "adversarial-duel"],
        default: "strict-hierarchy",
      })
      .option("workers", {
        alias: ["w"],
        describe: "Maximum number of workers",
        type: "number",
        default: 6,
      })
      .option("keep-worktrees", {
        describe: "Keep worktrees after completion",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    const goal = args.goal
    const mode = args.mode as "strict-hierarchy" | "democracy" | "parallel-only" | "adversarial-duel"
    const maxWorkers = args.workers
    const keepWorktrees = args.keepWorktrees

    await bootstrap(process.cwd(), async () => {
      const rootDir = Instance.directory

      UI.println(UI.Style.TEXT_INFO + "Starting Swarm Mode...")
      UI.println(`Goal: ${goal}`)
      UI.println(`Mode: ${mode}`)
      UI.println(`Max Workers: ${maxWorkers}`)
      UI.empty()

      const coordinator = new SwarmCoordinator(goal, mode)
      await coordinator.init(rootDir)

      const state = coordinator.getState()
      state.config.maxWorkers = maxWorkers

      const strategy = createStrategy(mode)
      const executor = new SwarmExecutor(coordinator, strategy)

      process.on("SIGINT", async () => {
        UI.println(UI.Style.TEXT_WARNING + "\nInterrupted! Cleaning up...")
        await executor.stop()
        process.exit(1)
      })

      process.on("SIGTERM", async () => {
        UI.println(UI.Style.TEXT_WARNING + "\nTerminated! Cleaning up...")
        await executor.stop()
        process.exit(1)
      })

      try {
        await executor.run(goal)

        UI.empty()
        UI.println(UI.Style.TEXT_SUCCESS + "Swarm completed successfully!")
        UI.empty()
        UI.println(`Run ID: ${coordinator.id}`)
        UI.println(`Artifacts: ${coordinator.runDirectory}`)

        if (!keepWorktrees) {
          await coordinator.cleanup(true)
        }

        process.exit(0)
      } catch (error) {
        UI.error(`Swarm failed: ${error}`)
        await coordinator.cleanup(false)
        process.exit(1)
      }
    })
  },
})

export const SwarmStatusCommand = cmd({
  command: "swarm status [runId]",
  describe: "Show status of a swarm run",
  builder: (yargs: Argv) => {
    return yargs.positional("runId", {
      describe: "Run ID to check (defaults to latest)",
      type: "string",
    })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const rootDir = Instance.directory
      const runId = args.runId

      let targetRunId = runId

      if (!targetRunId) {
        const runsDir = path.join(rootDir, ".openhei", "swarm", "runs")
        try {
          const entries = await fs.readdir(runsDir)
          const sorted = entries.sort().reverse()
          targetRunId = sorted[0]
        } catch {
          UI.error("No swarm runs found")
          process.exit(1)
        }
      }

      const coordinator = new SwarmCoordinator("", "strict-hierarchy")
      const loaded = await coordinator.load(targetRunId, rootDir)

      if (!loaded) {
        UI.error(`Run not found: ${targetRunId}`)
        process.exit(1)
      }

      const status = await coordinator.getStatus()
      UI.println(status)
    })
  },
})

export const SwarmTailCommand = cmd({
  command: "swarm tail [runId] [agent]",
  describe: "Tail logs from a swarm run",
  builder: (yargs: Argv) => {
    return yargs
      .positional("runId", {
        describe: "Run ID",
        type: "string",
      })
      .positional("agent", {
        describe: "Agent ID (optional, defaults to all)",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const rootDir = Instance.directory
      const runId = args.runId
      const agentId = args.agent

      if (!runId) {
        UI.error("Run ID is required")
        process.exit(1)
      }

      const coordinator = new SwarmCoordinator("", "strict-hierarchy")
      const loaded = await coordinator.load(runId, rootDir)

      if (!loaded) {
        UI.error(`Run not found: ${runId}`)
        process.exit(1)
      }

      const logsDir = path.join(coordinator.runDirectory, "logs")

      if (agentId) {
        const logFile = path.join(logsDir, `${agentId}.log`)
        try {
          const content = await fs.readFile(logFile, "utf-8")
          UI.println(content)
        } catch {
          UI.error(`Log not found for agent: ${agentId}`)
        }
      } else {
        try {
          const files = await fs.readdir(logsDir)
          for (const file of files) {
            if (file.endsWith(".log")) {
              UI.println(UI.Style.TEXT_INFO + `=== ${file} ===`)
              const content = await fs.readFile(path.join(logsDir, file), "utf-8")
              UI.println(content)
              UI.empty()
            }
          }
        } catch {
          UI.error("No logs found")
        }
      }
    })
  },
})

export const SwarmStopCommand = cmd({
  command: "swarm stop <runId>",
  describe: "Stop a running swarm and cleanup worktrees",
  builder: (yargs: Argv) => {
    return yargs.positional("runId", {
      describe: "Run ID to stop",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const rootDir = Instance.directory
      const runId = args.runId as string

      const coordinator = new SwarmCoordinator("", "strict-hierarchy")
      const loaded = await coordinator.load(runId, rootDir)

      if (!loaded) {
        UI.error(`Run not found: ${runId}`)
        process.exit(1)
      }

      UI.println(UI.Style.TEXT_WARNING + "Stopping swarm and cleaning up...")
      coordinator.abort()
      await coordinator.cleanup(false)

      UI.println(UI.Style.TEXT_SUCCESS + "Swarm stopped and cleaned up")
    })
  },
})

export const SwarmListCommand = cmd({
  command: "swarm list",
  describe: "List all swarm runs",
  builder: (yargs: Argv) => {
    return yargs
  },
  handler: async () => {
    await bootstrap(process.cwd(), async () => {
      const rootDir = Instance.directory
      const runsDir = path.join(rootDir, ".openhei", "swarm", "runs")

      try {
        const entries = await fs.readdir(runsDir)
        const sorted = entries.sort().reverse()

        if (sorted.length === 0) {
          UI.println("No swarm runs found")
          return
        }

        UI.println("Swarm Runs:")
        UI.println("")

        for (const runId of sorted) {
          const stateFile = path.join(runsDir, runId, "SWARM_STATE.json")
          try {
            const content = await fs.readFile(stateFile, "utf-8")
            const state = JSON.parse(content)
            UI.println(`  ${runId}`)
            UI.println(`    Goal: ${state.goal}`)
            UI.println(`    Status: ${state.status}`)
            UI.println(`    Mode: ${state.mode}`)
            UI.println(`    Created: ${new Date(state.createdAt).toISOString()}`)
            UI.empty()
          } catch {
            UI.println(`  ${runId} (state file not readable)`)
          }
        }
      } catch {
        UI.println("No swarm runs found")
      }
    })
  },
})
