import path from "path"
import { Log } from "../util/log"
import { git, type GitResult } from "../util/git"

const log = Log.create({ service: "swarm.worktree" })

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

export class WorktreeManager {
  private baseDir: string // The run directory
  private gitRoot: string // The git repo root (for running git commands)

  constructor(baseDir: string, gitRoot?: string) {
    this.baseDir = baseDir
    this.gitRoot = gitRoot || baseDir
  }

  async create(agentId: string, baseRef: string = "HEAD"): Promise<WorktreeInfo> {
    const worktreePath = path.join(this.baseDir, "worktrees", agentId)
    const branchName = `swarm/${agentId}-${Date.now()}`

    log.info("creating worktree", { agentId, path: worktreePath, branch: branchName, baseRef })

    const result = await git(["worktree", "add", worktreePath, "-b", branchName], {
      cwd: this.gitRoot,
    })

    if (result.exitCode !== 0) {
      const stderr = await result.text()
      throw new Error(`Failed to create worktree: ${stderr}`)
    }

    const headResult = await git(["rev-parse", "HEAD"], { cwd: worktreePath })
    const head = (await headResult.text()).trim()

    return {
      path: worktreePath,
      branch: branchName,
      head,
    }
  }

  async createIntegration(): Promise<WorktreeInfo> {
    const worktreePath = path.join(this.baseDir, "integration")
    const branchName = `swarm/integration-${Date.now()}`

    log.info("creating integration worktree", { path: worktreePath, branch: branchName })

    const result = await git(["worktree", "add", worktreePath, "-b", branchName], {
      cwd: this.gitRoot,
    })

    if (result.exitCode !== 0) {
      const stderr = await result.text()
      throw new Error(`Failed to create integration worktree: ${stderr}`)
    }

    const headResult = await git(["rev-parse", "HEAD"], { cwd: worktreePath })
    const head = (await headResult.text()).trim()

    return {
      path: worktreePath,
      branch: branchName,
      head,
    }
  }

  async remove(worktreePath: string): Promise<void> {
    log.info("removing worktree", { path: worktreePath })

    const result = await git(["worktree", "remove", "--force", worktreePath], {
      cwd: this.gitRoot,
    })

    if (result.exitCode !== 0) {
      const stderr = await result.text()
      log.warn("failed to remove worktree", { path: worktreePath, error: stderr })
    }
  }

  async list(): Promise<WorktreeInfo[]> {
    const result = await git(["worktree", "list", "--porcelain"], {
      cwd: this.gitRoot,
    })

    if (result.exitCode !== 0) {
      return []
    }

    const worktrees: WorktreeInfo[] = []
    const text = await result.text()
    const entries = text.split("\n\n")

    for (const entry of entries) {
      const lines = entry.split("\n")
      let pathLine = ""
      let branchLine = ""

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          pathLine = line.slice(9)
        }
        if (line.startsWith("branch ")) {
          branchLine = line.slice(7)
        }
      }

      if (pathLine) {
        const headResult = await git(["rev-parse", "HEAD"], { cwd: pathLine })
        worktrees.push({
          path: pathLine,
          branch: branchLine || "(detached)",
          head: (await headResult.text()).trim(),
        })
      }
    }

    return worktrees
  }

  async commit(worktreePath: string, message: string): Promise<string> {
    const result = await git(["add", "-A"], { cwd: worktreePath })
    if (result.exitCode !== 0) {
      const stderr = await result.text()
      throw new Error(`Failed to stage changes: ${stderr}`)
    }

    const commitResult = await git(["commit", "-m", message], { cwd: worktreePath })
    if (commitResult.exitCode !== 0) {
      const stderr = await commitResult.text()
      throw new Error(`Failed to commit: ${stderr}`)
    }

    const logResult = await git(["log", "-1", "--format=%H"], { cwd: worktreePath })
    return (await logResult.text()).trim()
  }

  async cherryPick(worktreePath: string, commits: string[]): Promise<void> {
    const args = ["cherry-pick", ...commits]
    const result = await git(args, { cwd: worktreePath })

    if (result.exitCode !== 0) {
      const stderr = await result.text()
      throw new Error(`Cherry-pick failed: ${stderr}`)
    }
  }

  async cherryPickWithCheck(worktreePath: string, commits: string[]): Promise<boolean> {
    // First try to cherry-pick to check for conflicts
    const args = ["cherry-pick", "--no-commit", ...commits]
    const result = await git(args, { cwd: worktreePath })

    if (result.exitCode !== 0) {
      // Conflicts detected
      await git(["cherry-pick", "--abort"], { cwd: worktreePath }).catch(() => {})
      return true
    }

    return false
  }

  async getDiff(worktreePath: string): Promise<string> {
    const result = await git(["diff", "HEAD"], { cwd: worktreePath })
    return await result.text()
  }

  async hasConflicts(worktreePath: string): Promise<boolean> {
    const result = await git(["diff", "--check"], { cwd: worktreePath })
    return result.exitCode !== 0
  }

  async getStatus(worktreePath: string): Promise<string> {
    const result = await git(["status", "--porcelain"], { cwd: worktreePath })
    return await result.text()
  }
}
