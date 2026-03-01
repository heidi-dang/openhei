import { Log } from "../util/log"
import { git } from "../util/git"
import fs from "fs/promises"

const log = Log.create({ service: "swarm.gates" })

export async function execGates(worktreePath: string, gates: string[]): Promise<boolean> {
  log.info("running gates", { worktree: worktreePath, gates })

  const results: boolean[] = []

  for (const gate of gates) {
    const passed = await runGate(worktreePath, gate)
    results.push(passed)

    if (!passed) {
      log.warn("gate failed", { gate, worktree: worktreePath })
    }
  }

  const allPassed = results.every((r: boolean) => r)
  log.info("gates completed", { worktree: worktreePath, allPassed })

  return allPassed
}

async function runGate(worktreePath: string, gate: string): Promise<boolean> {
  switch (gate) {
    case "lint":
      return await runLint(worktreePath)
    case "test":
      return await runTests(worktreePath)
    case "typecheck":
      return await runTypecheck(worktreePath)
    default:
      log.warn("unknown gate", { gate })
      return true
  }
}

async function runCommand(worktreePath: string, cmd: string[]): Promise<boolean> {
  const result = await git(cmd, { cwd: worktreePath })
  return result.exitCode === 0
}

async function checkFileExists(dir: string, file: string): Promise<boolean> {
  try {
    await fs.access(dir + "/" + file)
    return true
  } catch {
    return false
  }
}

async function runLint(worktreePath: string): Promise<boolean> {
  const hasPkgJson = await checkFileExists(worktreePath, "package.json")
  if (!hasPkgJson) {
    log.warn("no package.json found, skipping lint", { worktree: worktreePath })
    return true
  }

  const commands = [
    ["bun", "run", "lint"],
    ["npm", "run", "lint"],
  ]

  for (const cmd of commands) {
    log.debug("trying lint command", { command: cmd.join(" "), worktree: worktreePath })
    if (await runCommand(worktreePath, cmd)) {
      log.info("lint passed", { command: cmd.join(" "), worktree: worktreePath })
      return true
    }
  }

  log.warn("lint not configured, skipping", { worktree: worktreePath })
  return true
}

async function runTests(worktreePath: string): Promise<boolean> {
  const hasPkgJson = await checkFileExists(worktreePath, "package.json")
  if (!hasPkgJson) {
    log.warn("no package.json found, skipping tests", { worktree: worktreePath })
    return true
  }

  const commands = [
    ["bun", "test"],
    ["bun", "run", "test"],
    ["npm", "test"],
    ["npm", "run", "test"],
  ]

  for (const cmd of commands) {
    log.debug("trying test command", { command: cmd.join(" "), worktree: worktreePath })
    if (await runCommand(worktreePath, cmd)) {
      log.info("tests passed", { command: cmd.join(" "), worktree: worktreePath })
      return true
    }
  }

  log.warn("tests not configured, skipping", { worktree: worktreePath })
  return true
}

async function runTypecheck(worktreePath: string): Promise<boolean> {
  const hasPkgJson = await checkFileExists(worktreePath, "package.json")
  if (!hasPkgJson) {
    log.warn("no package.json found, skipping typecheck", { worktree: worktreePath })
    return true
  }

  const commands = [
    ["bun", "run", "typecheck"],
    ["npx", "tsc", "--noEmit"],
    ["npm", "run", "typecheck"],
  ]

  for (const cmd of commands) {
    log.debug("trying typecheck command", { command: cmd.join(" "), worktree: worktreePath })
    if (await runCommand(worktreePath, cmd)) {
      log.info("typecheck passed", { command: cmd.join(" "), worktree: worktreePath })
      return true
    }
  }

  log.warn("typecheck not configured, skipping", { worktree: worktreePath })
  return true
}
