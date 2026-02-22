import * as fs from "fs/promises"
import os from "os"
import path from "path"
import type { Config } from "../../src/config/config"

// Strip null bytes from paths (defensive fix for CI environment issues)
function sanitizePath(p: string): string {
  return p.replace(/\0/g, "")
}

type TmpDirOptions<T> = {
  git?: boolean
  config?: Partial<Config.Info>
  init?: (dir: string) => Promise<T>
  dispose?: (dir: string) => Promise<T>
}

export const hasGit = () => Bun.which("git") !== null

async function run(args: string[], cwd: string) {
  const proc = Bun.spawn(args, {
    cwd,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  })
  const code = await proc.exited
  if (code === 0) return
  throw new Error((await new Response(proc.stderr).text()) || `Command failed: ${args.join(" ")}`)
}

async function fake(dir: string) {
  const git = path.join(dir, ".git")
  await fs.mkdir(path.join(git, "refs", "heads"), { recursive: true })
  await Bun.write(path.join(git, "HEAD"), "ref: refs/heads/main\n")
  await Bun.write(
    path.join(git, "config"),
    "[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tlogallrefupdates = true\n",
  )
  await Bun.write(path.join(git, "refs", "heads", "main"), "0000000000000000000000000000000000000000\n")
}
export async function tmpdir<T>(options?: TmpDirOptions<T>) {
  const dirpath = sanitizePath(path.join(os.tmpdir(), "openhei-test-" + Math.random().toString(36).slice(2)))
  await fs.mkdir(dirpath, { recursive: true })
  if (options?.git) {
    const git = Bun.which("git")
    if (!git) {
      await fake(dirpath)
      const id = Math.random().toString(16).slice(2).padEnd(40, "0").slice(0, 40)
      await Bun.write(path.join(dirpath, ".git", "openhei"), id + "\n")
    } else {
      await run([git, "init"], dirpath)
      await run(
        [
          git,
          "-c",
          "user.name=openhei-test",
          "-c",
          "user.email=openhei-test@local",
          "commit",
          "--allow-empty",
          "-m",
          `root commit ${dirpath}`,
        ],
        dirpath,
      )
    }
  }
  if (options?.config) {
    await Bun.write(
      path.join(dirpath, "openhei.json"),
      JSON.stringify({
        $schema: "https://openhei.ai/config.json",
        ...options.config,
      }),
    )
  }
  const extra = await options?.init?.(dirpath)
  const realpath = sanitizePath(await fs.realpath(dirpath))
  const result = {
    [Symbol.asyncDispose]: async () => {
      await options?.dispose?.(dirpath)
      // await fs.rm(dirpath, { recursive: true, force: true })
    },
    path: realpath,
    extra: extra as T,
  }
  return result
}
