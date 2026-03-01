import { BusEvent } from "@/bus/bus-event"
import path from "path"
import { $ } from "bun"
import z from "zod"
import { NamedError } from "@openhei-ai/util/error"
import { Log } from "../util/log"
import { iife } from "@/util/iife"
import { Flag } from "../flag/flag"

declare global {
  const OPENHEI_VERSION: string
  const OPENHEI_CHANNEL: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })

  export const UpdateStatus = z
    .object({
      state: z.union([z.literal("idle"), z.literal("running"), z.literal("complete"), z.literal("failed")]),
      progress: z.number().min(0).max(100),
      message: z.string().optional(),
      target: z.string().optional(),
      startedAt: z.number().optional(),
      finishedAt: z.number().optional(),
      error: z.string().optional(),
    })
    .meta({
      ref: "InstallationUpdateStatus",
    })
  export type UpdateStatus = z.infer<typeof UpdateStatus>

  let update: UpdateStatus = { state: "idle", progress: 0 }
  let updating: Promise<void> | undefined

  export function status() {
    return update
  }

  const setUpdate = (next: Partial<UpdateStatus>) => {
    update = {
      ...update,
      ...next,
      progress: Math.max(0, Math.min(100, next.progress ?? update.progress ?? 0)),
    }
  }

  async function cmdForUpgrade(
    method: Method,
    target: string,
  ): Promise<{ cmd: string[]; env?: Record<string, string> }> {
    switch (method) {
      case "curl":
        return {
          cmd: ["bash", "-c", `$(curl -fsSL https://raw.githubusercontent.com/heidi-dang/openhei/v${target}/install.sh)`],
          env: { ...process.env, VERSION: target },
        }
      case "npm":
        return { cmd: ["npm", "install", "-g", `openhei-ai@${target}`] }
      case "pnpm":
        return { cmd: ["pnpm", "install", "-g", `openhei-ai@${target}`] }
      case "bun":
        return { cmd: ["bun", "install", "-g", `openhei-ai@${target}`] }
      case "brew":
        return iife(async () => {
          const formula = await getBrewFormula()
          if (formula.includes("/")) {
            return {
              cmd: [
                "bash",
                "-lc",
                `brew tap anomalyco/tap && cd "$(brew --repo anomalyco/tap)" && git pull --ff-only && brew upgrade ${formula}`,
              ],
              env: {
                HOMEBREW_NO_AUTO_UPDATE: "1",
                ...process.env,
              },
            }
          }

          return {
            cmd: ["brew", "upgrade", formula],
            env: {
              HOMEBREW_NO_AUTO_UPDATE: "1",
              ...process.env,
            },
          }
        })
      case "choco":
        return { cmd: ["choco", "upgrade", "openhei", `--version=${target}`, "-y"] }
      case "scoop":
        return { cmd: ["scoop", "install", `openhei@${target}`] }
      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  async function readLines(stream: ReadableStream<Uint8Array> | null | undefined, onLine: (line: string) => void) {
    if (!stream) return
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      while (true) {
        const idx = buf.indexOf("\n")
        if (idx === -1) break
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) onLine(line)
      }
    }
    const rest = buf.trim()
    if (rest) onLine(rest)
  }

  export async function startUpdate(target: string) {
    if (update.state === "running") return

    const method = await Installation.method()
    const startedAt = Date.now()
    setUpdate({ state: "running", progress: 0, message: "Starting update…", target, startedAt, finishedAt: undefined })

    updating = (async () => {
      try {
        setUpdate({ progress: 5, message: `Preparing (${method})…` })
        const info = await cmdForUpgrade(method, target)

        const proc = Bun.spawn(info.cmd, {
          env: info.env,
          stdout: "pipe",
          stderr: "pipe",
        })

        const tick = setInterval(() => {
          if (update.state !== "running") return
          const elapsed = Date.now() - startedAt
          const next = Math.min(85, 10 + Math.floor(elapsed / 500))
          if (next <= update.progress) return
          setUpdate({ progress: next })
        }, 250)

        const lines: string[] = []
        const onLine = (line: string) => {
          lines.push(line)
          if (lines.length > 4) lines.shift()
          setUpdate({ message: line })
        }

        await Promise.all([readLines(proc.stdout, onLine), readLines(proc.stderr, onLine), proc.exited]).finally(() => {
          clearInterval(tick)
        })

        if (proc.exitCode !== 0) {
          throw new UpgradeFailedError({
            stderr: lines.join("\n") || "Update command failed",
          })
        }

        setUpdate({ progress: 95, message: "Finishing…" })
        await $`${process.execPath} --version`.nothrow().quiet().text()
        setUpdate({ state: "complete", progress: 100, message: "Update installed.", finishedAt: Date.now() })

        const argv = process.argv.slice(1)
        const command = argv.find((x) => x === "web" || x === "serve")
        const wantsServer = command === "web" || command === "serve"
        if (!wantsServer) return

        setUpdate({ message: "Restarting server…" })

        const restart = () => {
          try {
            const next = Bun.spawn([process.execPath, ...argv], {
              env: {
                ...process.env,
                OPENHEI_NO_OPEN: "1",
                OPENHEI_RESTART_WAIT: "1",
              },
              stdout: "ignore",
              stderr: "ignore",
              stdin: "ignore",
              detached: true,
            })
            next.unref()
            return next
          } catch {
            return
          }
        }

        const child = restart()
        if (!child) return

        // Best effort: stop the current server to free the port.
        const handle = (await import("@/server/server")).Server.handle()
        if (handle) {
          try {
            await handle.stop(true)
          } catch {
            // ignore
          }
        }

        await Bun.sleep(250)
        process.exit(0)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setUpdate({
          state: "failed",
          progress: Math.max(update.progress, 10),
          error: message,
          message: "Update failed.",
          finishedAt: Date.now(),
        })
        log.error("update failed", { error: err })
      }
    })()

    void updating
  }

  export type Method = Awaited<ReturnType<typeof method>>

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export async function info() {
    if (isLocal()) {
      return {
        version: VERSION,
        latest: VERSION,
      }
    }
    return {
      version: VERSION,
      latest: await latest().catch((err) => {
        log.warn("failed to check latest", { error: err })
        return VERSION
      }),
    }
  }

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export async function method() {
    if (process.execPath.includes(path.join(".openhei", "bin"))) return "curl"
    if (process.execPath.includes(path.join(".local", "bin"))) return "curl"
    const exec = process.execPath.toLowerCase()

    const checks = [
      {
        name: "npm" as const,
        command: () => $`npm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "yarn" as const,
        command: () => $`yarn global list`.throws(false).quiet().text(),
      },
      {
        name: "pnpm" as const,
        command: () => $`pnpm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "bun" as const,
        command: () => $`bun pm ls -g`.throws(false).quiet().text(),
      },
      {
        name: "brew" as const,
        command: () => $`brew list --formula openhei`.throws(false).quiet().text(),
      },
      {
        name: "scoop" as const,
        command: () => $`scoop list openhei`.throws(false).quiet().text(),
      },
      {
        name: "choco" as const,
        command: () => $`choco list --limit-output openhei`.throws(false).quiet().text(),
      },
    ]

    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name)
      const bMatches = exec.includes(b.name)
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })

    for (const check of checks) {
      const output = await check.command()
      const installedName =
        check.name === "brew" || check.name === "choco" || check.name === "scoop" ? "openhei" : "openhei-ai"
      if (output.includes(installedName)) {
        return check.name
      }
    }

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  async function getBrewFormula() {
    const tapFormula = await $`brew list --formula anomalyco/tap/openhei`.throws(false).quiet().text()
    if (tapFormula.includes("openhei")) return "anomalyco/tap/openhei"
    const coreFormula = await $`brew list --formula openhei`.throws(false).quiet().text()
    if (coreFormula.includes("openhei")) return "openhei"
    return "openhei"
  }

  export async function upgrade(method: Method, target: string) {
    let cmd
    switch (method) {
      case "curl":
        cmd = $`bash -c "$(curl -fsSL https://raw.githubusercontent.com/heidi-dang/openhei/v${target}/install.sh)"`.env({
          ...process.env,
          VERSION: target,
        })
        break
      case "npm":
        cmd = $`npm install -g openhei-ai@${target}`
        break
      case "pnpm":
        cmd = $`pnpm install -g openhei-ai@${target}`
        break
      case "bun":
        cmd = $`bun install -g openhei-ai@${target}`
        break
      case "brew": {
        const formula = await getBrewFormula()
        if (formula.includes("/")) {
          cmd =
            $`brew tap anomalyco/tap && cd "$(brew --repo anomalyco/tap)" && git pull --ff-only && brew upgrade ${formula}`.env(
              {
                HOMEBREW_NO_AUTO_UPDATE: "1",
                ...process.env,
              },
            )
          break
        }
        cmd = $`brew upgrade ${formula}`.env({
          HOMEBREW_NO_AUTO_UPDATE: "1",
          ...process.env,
        })
        break
      }
      case "choco":
        cmd = $`echo Y | choco upgrade openhei --version=${target}`
        break
      case "scoop":
        cmd = $`scoop install openhei@${target}`
        break
      default:
        throw new Error(`Unknown method: ${method}`)
    }
    const result = await cmd.quiet().throws(false)
    if (result.exitCode !== 0) {
      const stderr = method === "choco" ? "not running from an elevated command shell" : result.stderr.toString("utf8")
      throw new UpgradeFailedError({
        stderr: stderr,
      })
    }
    log.info("upgraded", {
      method,
      target,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    await $`${process.execPath} --version`.nothrow().quiet().text()
  }

  export const VERSION = typeof OPENHEI_VERSION === "string" ? OPENHEI_VERSION : "local"
  export const CHANNEL = typeof OPENHEI_CHANNEL === "string" ? OPENHEI_CHANNEL : "local"
  export const USER_AGENT = `openhei/${CHANNEL}/${VERSION}/${Flag.OPENHEI_CLIENT}`

  export async function latest(installMethod?: Method) {
    const detectedMethod = installMethod || (await method())

    if (detectedMethod === "brew") {
      const formula = await getBrewFormula()
      if (formula.includes("/")) {
        const infoJson = await $`brew info --json=v2 ${formula}`.quiet().text()
        const info = JSON.parse(infoJson)
        const version = info.formulae?.[0]?.versions?.stable
        if (!version) throw new Error(`Could not detect version for tap formula: ${formula}`)
        return version
      }
      return fetch("https://formulae.brew.sh/api/formula/openhei.json")
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.versions.stable)
    }

    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
      const registry = await iife(async () => {
        const r = (await $`npm config get registry`.quiet().nothrow().text()).trim()
        const reg = r || "https://registry.npmjs.org"
        return reg.endsWith("/") ? reg.slice(0, -1) : reg
      })
      const channel = CHANNEL
      return fetch(`${registry}/openhei-ai/${channel}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.version)
    }

    if (detectedMethod === "choco") {
      return fetch(
        "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27openhei%27%20and%20IsLatestVersion&$select=Version",
        { headers: { Accept: "application/json;odata=verbose" } },
      )
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.d.results[0].Version)
    }

    if (detectedMethod === "scoop") {
      return fetch("https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/openhei.json", {
        headers: { Accept: "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.version)
    }

    return fetch("https://api.github.com/repos/heidi-dang/openhei/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: any) => data.tag_name.replace(/^v/, ""))
  }
}
