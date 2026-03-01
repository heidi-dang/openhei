import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { Provider } from "../../provider/provider"
import { ModelsDev } from "../../provider/models"
import { Global } from "../../global"
import { lazy } from "../../util/lazy"
// ChildProcess typing from Bun is not portable here; use `any` for proc.

const tools = path.join(Global.Path.data, "tools")
const heidi = path.join(tools, "heidi-engine")
const venv = path.join(heidi, ".venv")

const getRealHome = async (): Promise<string> => {
  try {
    const uid = process.getuid?.() || 1000
    const p = await fs.readFile("/etc/passwd", "utf-8")
    const line = p.split("\n").find((l) => l.startsWith(`heidi:`))
    if (line) {
      const parts = line.split(":")
      if (parts[5]) return parts[5]
    }
  } catch {}
  return "/home/heidi"
}

const runs = path.join(Global.Path.data, "runs")
const active = path.join(Global.Path.state, "qlora.active.json")
const installing = path.join(Global.Path.state, "qlora.install.json")
const configPath = path.join(Global.Path.state, "qlora.config.json")

const getpy = async () => {
  const a = path.join(venv, "bin", "python")
  const b = path.join(venv, "Scripts", "python.exe")
  const aok = await fs
    .stat(a)
    .then(() => a)
    .catch(() => undefined)
  if (aok) return aok
  const bok = await fs
    .stat(b)
    .then(() => b)
    .catch(() => undefined)
  return bok
}

const exists = (p: string) =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)

const run = async (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) => {
  try {
    const proc = Bun.spawn(cmd, {
      cwd: opts?.cwd,
      env: { ...process.env, ...(opts?.env ?? {}) },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    const code = await proc.exited
    return { code, out, err }
  } catch (e) {
    const err = e instanceof Error ? e.stack || e.message : String(e)
    return { code: 127, out: "", err }
  }
}

const spawnLogged = (cmd: string[], logPath: string, opts?: { env?: Record<string, string> }) => {
  const args = ["setsid", "-w", ...cmd]
  const proc = Bun.spawn(args, {
    env: { ...process.env, ...(opts?.env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  })

  const sink = Bun.file(logPath).writer()
  const pump = async (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      if (value) sink.write(value)
    }
  }

  void Promise.all([pump(proc.stdout), pump(proc.stderr)]).finally(async () => {
    await sink.end()
  })

  return proc
}

const findpy = async () => {
  // Prefer a configured python from qlora.config.json if present
  let cfg: any = {}
  try {
    const txt = await fs.readFile(configPath, "utf-8").catch(() => "")
    if (txt) cfg = JSON.parse(txt)
  } catch {}

  const realHome = await getRealHome()
  const candidates = [
    cfg?.heidi_engine_path,
    path.join(Global.Path.data, "tools", "heidi-engine"),
    path.join(realHome, ".local", "share", "openhei", "tools", "heidi-engine"),
    path.join(Global.Path.home, ".local", "share", "openhei", "tools", "heidi-engine"),
    "/home/heidi/.local/share/openhei/tools/heidi-engine",
  ].filter(Boolean) as string[]

  const uniqueCandidates = [...new Set(candidates)]

  // If a specific python path is configured, prefer that.
  if (cfg?.heidi_engine_python) {
    const py = cfg.heidi_engine_python
    const ok = await run([py, "-c", "import heidi_engine"])
      .then((x) => x.code === 0)
      .catch(() => false)
    if (ok) return py
  }

  for (const cand of uniqueCandidates) {
    try {
      const venvPath = path.join(cand, ".venv")
      const venvPy = path.join(venvPath, "bin", "python")
      const it = await fs
        .stat(venvPy)
        .then(() => venvPy)
        .catch(() => undefined)
      if (it) {
        const ok = await run([it, "-c", "import heidi_engine"]).then((x) => x.code === 0)
        if (ok) return it
      }
    } catch {
      // ignore
    }
  }

  // Fallback: try python3 and python on PATH
  const checks = ["python3", "python"]
  for (const p of checks) {
    const ok = await run([p, "-c", "import heidi_engine"])
      .then((x) => x.code === 0)
      .catch(() => false)
    if (ok) return p
  }
  return undefined
}

// Run an extended diagnostic using a specific python interpreter (if provided).
const doctorHeidiEngine = async (python?: string, toolDirCandidates?: string[]) => {
  const tried: Array<{ cmd: string[]; code: number; out: string; err: string }> = []
  const push = async (cmd: string[]) => {
    const r = await run(cmd)
    tried.push({ cmd, code: r.code ?? 127, out: r.out ?? "", err: r.err ?? "" })
    return r
  }

  let pick = python
  if (!pick) {
    try {
      pick = await findpy()
    } catch {
      pick = undefined
    }
  }

  const result: any = { python: pick }

  if (!pick) {
    result.import_ok = false
    result.import_err = "no python found"
    result.tried = tried
    return result
  }

  // sys.executable, sys.prefix, site.getsitepackages()
  const infoCmd = [
    pick,
    "-c",
    "import sys,site,json;print(sys.executable);print(sys.prefix);print(json.dumps(getattr(site,'getsitepackages',lambda:[] )()))",
  ]
  const info = await push(infoCmd)
  const lines = (info.out || "").split(/\r?\n/).filter((l) => l)
  result.sys_executable = lines[0]
  result.sys_prefix = lines[1]
  try {
    result.site_packages = JSON.parse(lines[2] || "[]")
  } catch {
    result.site_packages = []
  }

  // pip show
  await push([pick, "-m", "pip", "show", "heidi-engine"]).then((r) => (result.pip_show = r.out || r.err || ""))

  // import check and version
  const imp = await push([pick, "-c", "import heidi_engine;print(getattr(heidi_engine,'__version__', ''))"]).catch(
    () => ({ code: 127, out: "", err: "import failed" }),
  )
  result.import_ok = imp.code === 0
  result.import_err = imp.code === 0 ? undefined : imp.err || imp.out
  result.module_version = imp.code === 0 ? (imp.out || "").trim() : undefined

  // try console entrypoint variants
  const entrypoints = [
    [pick, "-m", "heidi_engine", "--help"],
    [pick, "-m", "heidi_engine.dashboard", "--help"],
  ]
  result.entrypoints = []
  for (const e of entrypoints) {
    const r = await push(e)
    result.entrypoints.push({ cmd: e, code: r.code, out: r.out, err: r.err })
  }

  if (toolDirCandidates) result.tool_dir_candidates = toolDirCandidates
  result.tried = tried
  return result
}

const pidok = (pid: number) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const findInstallPidByPs = async () => {
  if (process.platform === "win32") return
  const out = await run(["ps", "-eo", "pid,args"]).then((x) => (x.code === 0 ? x.out : ""))
  if (!out) return
  const lines = out.split(/\r?\n/)
  for (const line of lines) {
    if (!line.includes("pip")) continue
    if (!line.includes("heidi-engine")) continue
    if (!line.includes(heidi)) continue
    const m = line.trim().match(/^([0-9]+)\s+/)
    if (m) return Number(m[1])
  }
}

const sleep = (ms: number) => Bun.sleep(ms)

const killchildren = async (pid: number) => {
  if (process.platform === "win32") return
  try {
    const out = await run(["pgrep", "-P", String(pid)])
    if (out.code !== 0) return
    const pids = out.out
      .split("\n")
      .filter((x) => x.trim())
      .map((x) => Number(x.trim()))
    for (const child of pids) {
      if (child) {
        try {
          process.kill(child, "SIGKILL")
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

const killpid = async (pid: number, signal: "SIGTERM" | "SIGKILL") => {
  if (!pid) return
  if (process.platform === "win32") {
    if (signal === "SIGKILL") {
      const p = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" })
      await p.exited
      return
    }
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // ignore
    }
    return
  }

  const send = (target: number) => {
    try {
      process.kill(target, signal)
    } catch {
      // ignore
    }
  }
  send(pid)
  send(-pid)
  killchildren(pid)
}

const waitdead = async (pid: number, timeout_ms: number) => {
  const start = Date.now()
  while (pidok(pid) && Date.now() - start < timeout_ms) await sleep(125)
  return !pidok(pid)
}

const redact = (line: string) => {
  return line
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, "sk-***REDACTED***")
    .replace(/\bhf_[A-Za-z0-9]{16,}\b/g, "hf_***REDACTED***")
    .replace(
      /\b(OPENAI_API_KEY|OPENAI_KEY|HF_TOKEN|HUGGINGFACE_HUB_TOKEN|ANTHROPIC_API_KEY|GEMINI_API_KEY)=\S+/g,
      "$1=***REDACTED***",
    )
    .replace(/\b(Authorization:\s*Bearer\s+)\S+/gi, "$1***REDACTED***")
}

const readactive = async () => {
  const text = await fs.readFile(active, "utf-8").catch(() => "")
  if (!text) return
  const data = z
    .object({ run_id: z.string(), pid: z.number().int(), started_at: z.string() })
    .safeParse(JSON.parse(text))
  if (!data.success) return
  return data.data
}

const readinstall = async () => {
  const text = await fs.readFile(installing, "utf-8").catch(() => "")
  if (!text) return
  const data = z.object({ pid: z.number().int(), started_at: z.string(), log: z.string() }).safeParse(JSON.parse(text))
  if (!data.success) return
  return data.data
}

const writeinstall = async (data: { pid: number; started_at: string; log: string } | undefined) => {
  await fs.mkdir(path.dirname(installing), { recursive: true })
  if (!data) {
    await fs.rm(installing, { force: true })
    return
  }
  await fs.writeFile(installing, JSON.stringify(data, null, 2) + "\n")
}

const writeactive = async (data: { run_id: string; pid: number; started_at: string } | undefined) => {
  await fs.mkdir(path.dirname(active), { recursive: true })
  if (!data) {
    await fs.rm(active, { force: true })
    return
  }
  await fs.writeFile(active, JSON.stringify(data, null, 2) + "\n")
}

const attachok = async (url: string) => {
  const doc = url.replace(/\/+$/, "") + "/doc"
  const res = await fetch(doc, { signal: AbortSignal.timeout(2500) }).catch(() => undefined)
  return !!res && res.ok
}

const basemodels = async () => {
  const home = os.homedir()
  const envHome = process.env.HOME
  const realHome = envHome && envHome.includes("/snap/") ? envHome.split("/snap/")[0] : envHome

  const roots = new Set<string>()
  const add = (p?: string) => {
    if (!p) return
    const v = p.trim()
    if (!v) return
    roots.add(v)
  }

  add(process.env.HUGGINGFACE_HUB_CACHE)
  add(process.env.HF_HOME)
  add(process.env.TRANSFORMERS_CACHE)
  add(process.env.XDG_CACHE_HOME && path.join(process.env.XDG_CACHE_HOME, "huggingface"))
  add(path.join(home, ".cache", "huggingface"))
  add(envHome && path.join(envHome, ".cache", "huggingface"))
  add(realHome && path.join(realHome, ".cache", "huggingface"))
  add(path.join(home, "huggingface"))
  add(realHome && path.join(realHome, "huggingface"))

  // Snap installs often place cache under ~/snap/<app>/<rev>/.cache
  const snap = path.join(realHome ?? home, "snap")
  const snapApps = await fs.readdir(snap).catch(() => [])
  for (const app of snapApps.slice(0, 25)) {
    const base = path.join(snap, app)
    const revs = await fs.readdir(base).catch(() => [])
    for (const rev of revs.slice(0, 10)) {
      roots.add(path.join(base, rev, ".cache", "huggingface"))
    }
  }

  const models: string[] = []
  for (const root of roots) {
    const hub = path.join(root, "hub")
    const list = await fs.readdir(hub).catch(() => [])
    for (const x of list) {
      if (!x.startsWith("models--")) continue
      const id = x
        .replace(/^models--/, "")
        .split("--")
        .slice(0, 2)
        .join("/")
      if (id.includes("/")) models.push(id)
    }
  }
  return [...new Set(models)].sort((a, b) => a.localeCompare(b))
}

const teacher = z
  .object({
    teacher_backend: z.enum(["legacy", "openhei"]).default("openhei"),
    teacher_model: z.string().min(1).max(200),
    teacher_workers: z.number().int().min(1).max(12).default(1),
    teacher_batch_size: z.number().int().min(1).max(8).default(1),
    teacher_max_tokens: z.number().int().min(64).max(2048).default(256),
    openhei_attach: z
      .string()
      .url()
      .max(200)
      .refine((u) => u.startsWith("http://") || u.startsWith("https://"), { message: "must be http(s)" })
      .default("http://127.0.0.1:4100"),
    openhei_agent: z
      .string()
      .max(64)
      .regex(/^[a-zA-Z0-9._-]*$/)
      .optional()
      .default(""),
    openhei_start: z.boolean().optional().default(false),
    openhei_attach_strict: z.boolean().optional().default(false),
  })
  .strict()

const cfg = z
  .object({
    run_id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .optional(),
    preset: z
      .string()
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("safe"),
    stack: z.enum(["python", "cpp", "github-ci", "mixed"]).default("python"),
    max_repos: z.number().int().min(1).max(500).default(50),
    rounds: z.number().int().min(1).max(50).default(2),
    samples_per_run: z.number().int().min(1).max(5000).default(100),
    max_requests: z.number().int().min(1).max(1_000_000).default(10_000),
    base_model: z.string().min(1).max(200),
    train_steps: z.number().int().min(1).max(1_000_000).default(1200),
    save_steps: z.number().int().min(1).max(1_000_000).default(100),
    eval_steps: z.number().int().min(1).max(1_000_000).default(200),
    seq_len: z.number().int().min(128).max(8192).default(1024),
    batch_size: z.number().int().min(1).max(16).default(1),
    grad_accum: z.number().int().min(1).max(128).default(8),
    lora_r: z.number().int().min(4).max(256).default(32),
    val_ratio: z.number().min(0).max(0.5).default(0.05),
    heidi_engine_python: z.string().max(400).optional(),
    heidi_engine_path: z.string().max(400).optional(),
    teacher: teacher,
  })
  .strict()

const stacks = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    available: z.boolean(),
    reason: z.string().optional(),
  }),
)

const availableStacks = [
  { id: "python", label: "Python", description: "Python repositories using pip/poetry/venv", available: true },
  {
    id: "cpp",
    label: "C++",
    description: "C++ repositories using CMake/ninja",
    available: false,
    reason: "Coming soon",
  },
  {
    id: "github-ci",
    label: "GitHub CI",
    description: "Repositories with GitHub Actions workflows",
    available: false,
    reason: "Coming soon",
  },
  { id: "mixed", label: "Mixed", description: "Mixed language repositories", available: false, reason: "Coming soon" },
]

type Run = {
  run_id: string
  pid: number
  started_at: string
  dir: string
  log: string
  proc: any
}

const state = { run: undefined as Run | undefined }

export const QLoRARoutes = lazy(() =>
  new Hono()
    .get(
      "/stacks",
      describeRoute({
        summary: "Get available execution stacks",
        operationId: "qlora.get_stacks",
        responses: {
          200: {
            description: "Stack list",
            content: {
              "application/json": {
                schema: resolver(stacks),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(availableStacks)
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "Get QLoRA config",
        operationId: "qlora.get_config",
        responses: {
          200: {
            description: "Config",
            content: {
              "application/json": {
                schema: resolver(cfg),
              },
            },
          },
        },
      }),
      async (c) => {
        const txt = await fs.readFile(configPath, "utf-8").catch(() => "")
        if (!txt)
          return c.json(
            cfg.parse({
              preset: "safe",
              stack: "python",
              max_repos: 50,
              rounds: 2,
              samples_per_run: 100,
              max_requests: 10000,
              base_model: "mistralai/Mistral-7B-Instruct-v0.2",
              train_steps: 1200,
              save_steps: 100,
              eval_steps: 200,
              seq_len: 1024,
              batch_size: 1,
              grad_accum: 8,
              lora_r: 32,
              val_ratio: 0.05,
              teacher: {
                teacher_backend: "openhei",
                teacher_model: "openai/gpt-5.2",
                teacher_workers: 1,
                teacher_batch_size: 1,
                teacher_max_tokens: 256,
                openhei_attach: "http://127.0.0.1:4100",
                openhei_agent: "",
                openhei_start: false,
                openhei_attach_strict: false,
              },
            }),
          )

        try {
          const parsed = JSON.parse(txt)
          const ok = cfg.parse(parsed)
          return c.json(ok)
        } catch (e) {
          const def = cfg.parse({
            preset: "safe",
            stack: "python",
            max_repos: 50,
            rounds: 2,
            samples_per_run: 100,
            max_requests: 10000,
            base_model: "mistralai/Mistral-7B-Instruct-v0.2",
            train_steps: 1200,
            save_steps: 100,
            eval_steps: 200,
            seq_len: 1024,
            batch_size: 1,
            grad_accum: 8,
            lora_r: 32,
            val_ratio: 0.05,
            teacher: {
              teacher_backend: "openhei",
              teacher_model: "openai/gpt-5.2",
              teacher_workers: 1,
              teacher_batch_size: 1,
              teacher_max_tokens: 256,
              openhei_attach: "http://127.0.0.1:4100",
              openhei_agent: "",
              openhei_start: false,
              openhei_attach_strict: false,
            },
          })
          return c.json(def)
        }
      },
    )
    .put(
      "/config",
      describeRoute({
        summary: "Save QLoRA config",
        operationId: "qlora.put_config",
        responses: {
          200: {
            description: "Saved",
            content: {
              "application/json": {
                schema: resolver(cfg),
              },
            },
          },
          400: {
            description: "Validation error",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    error: z.object({
                      code: z.string(),
                      message: z.string(),
                      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
                    }),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator("json", cfg),
      async (c) => {
        const body = c.req.valid("json")
        await fs.mkdir(path.dirname(configPath), { recursive: true })
        await fs.writeFile(configPath, JSON.stringify(body, null, 2) + "\n")
        return c.json(body)
      },
    )
    .get(
      "/doctor",
      describeRoute({
        summary: "QLoRA doctor",
        operationId: "qlora.doctor",
        responses: {
          200: {
            description: "Doctor report",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      installed: z.boolean(),
                      tool_dir: z.string(),
                      tool_dir_candidates: z.array(z.string()),
                      selected_tool_dir: z.string().optional(),
                      venv_python: z.string().optional(),
                      import_ok: z.boolean(),
                      import_err: z.string().optional(),
                      reason: z.string().optional(),
                      checks: z
                        .object({
                          exists: z.boolean(),
                          pump_import_ok: z.boolean(),
                          venv_python_path: z.string().optional(),
                        })
                        .optional(),
                      python: z.string().optional(),
                      version: z.string().optional(),
                      gpu: z.string().optional(),
                      disk: z.object({ path: z.string(), free_bytes: z.number().int().nonnegative() }).optional(),
                      install: z.object({ pid: z.number().int(), started_at: z.string(), log: z.string() }).optional(),
                      active: z
                        .object({ run_id: z.string(), pid: z.number().int(), started_at: z.string() })
                        .optional(),
                      diagnostics: z
                        .object({
                          sys_executable: z.string().optional(),
                          sys_prefix: z.string().optional(),
                          site_packages: z.array(z.string()).optional(),
                          pip_show: z.string().optional(),
                          module_version: z.string().optional(),
                          entrypoints: z.array(z.any()).optional(),
                          tried: z
                            .array(
                              z.object({
                                cmd: z.array(z.string()),
                                code: z.number().int(),
                                out: z.string(),
                                err: z.string(),
                              }),
                            )
                            .optional(),
                          install_cmd: z.string().optional(),
                        })
                        .optional(),
                    })
                    .strict(),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const realHome = await getRealHome()
        const envHome = process.env.HOME || ""
        const isSnap = envHome.startsWith("/home/heidi/snap/") || envHome.startsWith("/snap/")

        const candidates = [
          path.join(Global.Path.data, "tools", "heidi-engine"),
          path.join(realHome, ".local", "share", "openhei", "tools", "heidi-engine"),
          path.join(Global.Path.home, ".local", "share", "openhei", "tools", "heidi-engine"),
          "/home/heidi/.local/share/openhei/tools/heidi-engine",
        ]

        if (isSnap) {
          candidates.push("/home/heidi/.local/share/openhei/tools/heidi-engine")
        }

        const uniqueCandidates = [...new Set(candidates)]

        // Run the canonical doctor which prefers configured python keys if present
        const cfgTxt = await fs.readFile(configPath, "utf-8").catch(() => "")
        let cfg: any = {}
        try {
          if (cfgTxt) cfg = JSON.parse(cfgTxt)
        } catch {}

        const diag = await doctorHeidiEngine(cfg?.heidi_engine_python, uniqueCandidates)

        const a = await readactive()
        const active_ = a && pidok(a.pid) ? a : undefined
        if (a && !active_) await writeactive(undefined)

        const i = await readinstall()
        const install_ = i && pidok(i.pid) ? i : undefined
        if (i && !install_) await writeinstall(undefined)

        const installed = !!diag.python && diag.import_ok

        const checks = diag.python
          ? { exists: true, pump_import_ok: diag.import_ok, venv_python_path: diag.sys_executable }
          : { exists: false, pump_import_ok: false, venv_python_path: undefined }

        const gpu = await run(["nvidia-smi", "-L"]).then((x) => (x.code === 0 ? x.out.trim() : undefined))

        const disk = await run(["df", "-k", Global.Path.data]).then((x) => {
          if (x.code !== 0) return
          const line = x.out
            .split(/\r?\n/)
            .filter((y) => y)
            .slice(-1)[0]
          const parts = line?.trim().split(/\s+/)
          const free = parts?.[3]
          const free_bytes = free ? Number(free) * 1024 : 0
          if (!Number.isFinite(free_bytes)) return
          return { path: Global.Path.data, free_bytes }
        })

        const install_cmd = diag.python
          ? `${diag.python} -m pip install -U heidi-engine`
          : `python3 -m pip install -U heidi-engine`

        return c.json({
          installed,
          tool_dir: heidi,
          tool_dir_candidates: uniqueCandidates,
          selected_tool_dir: cfg?.heidi_engine_path ?? undefined,
          venv_python: diag.sys_executable,
          import_ok: diag.import_ok,
          import_err: diag.import_err ? String(diag.import_err).slice(0, 500) : undefined,
          reason: !installed
            ? diag.import_err
              ? `import failed: ${String(diag.import_err).slice(0, 200)}`
              : "not found"
            : undefined,
          checks,
          python: diag.python ?? undefined,
          version: diag.module_version || undefined,
          gpu,
          disk,
          install: install_ || undefined,
          active: active_ || undefined,
          diagnostics: {
            sys_executable: diag.sys_executable,
            sys_prefix: diag.sys_prefix,
            site_packages: diag.site_packages,
            pip_show: diag.pip_show,
            module_version: diag.module_version,
            entrypoints: diag.entrypoints,
            tried: diag.tried,
            install_cmd,
          },
        })
      },
    )
    .post(
      "/install",
      describeRoute({
        summary: "Install heidi-engine pump",
        operationId: "qlora.install",
        responses: {
          200: {
            description: "Install result",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.boolean(), message: z.string() }).strict()),
              },
            },
          },
        },
      }),
      async (c) => {
        await fs.mkdir(tools, { recursive: true })
        const py = await run(["python3", "-V"]).then((x) => (x.code === 0 ? "python3" : undefined))
        if (!py) return c.json({ ok: false, message: "python3 not found in PATH" })

        await fs.mkdir(heidi, { recursive: true })

        const src = "https://github.com/heidi-dang/heidi-engine/archive/refs/heads/main.zip"
        const local = "/home/heidi/work/heidi-engine"
        const localOk = await exists(path.join(local, "pyproject.toml"))
        const spec = localOk ? `${local}[ml]` : `heidi-engine[ml] @ ${src}`

        let basePip = await run([py, "-m", "pip", "--version"])
        if (basePip.code !== 0) {
          const ep = await run([py, "-m", "ensurepip", "--upgrade"])
          if (ep.code === 0) basePip = await run([py, "-m", "pip", "--version"])
        }
        if (basePip.code !== 0) {
          const url = "https://bootstrap.pypa.io/get-pip.py"
          const text = await fetch(url, { signal: AbortSignal.timeout(10_000) })
            .then((r) => (r.ok ? r.text() : ""))
            .catch(() => "")
          if (text) {
            const gp = path.join(heidi, "get-pip.py")
            await fs.writeFile(gp, text)
            await run([py, gp, "--user"])
            basePip = await run([py, "-m", "pip", "--version"])
          }
        }
        if (basePip.code !== 0) {
          return c.json({
            ok: false,
            message: basePip.err.trim() || basePip.out.trim() || "python3 pip not found (install python3-pip)",
          })
        }

        const cur = await readinstall()
        if (cur && pidok(cur.pid)) return c.json({ ok: true, message: "install already running" })
        if (cur && !pidok(cur.pid)) await writeinstall(undefined)

        const existing = await findInstallPidByPs()
        if (existing && pidok(existing)) {
          await writeinstall({ pid: existing, started_at: new Date().toISOString(), log: "unknown" })
          return c.json({ ok: true, message: "install already running" })
        }

        // Prefer an isolated venv when possible.
        if (!(await exists(venv))) {
          const v = await run([py, "-m", "venv", venv])
          if (v.code !== 0) {
            // Best-effort: fall back to virtualenv if available.
            await run([py, "-m", "pip", "install", "--user", "-U", "virtualenv"])
            await run([py, "-m", "virtualenv", venv])
          }
        }

        const ensureVenvPip = async () => {
          const p = await getpy()
          if (!p) return
          const pip = await run([p, "-m", "pip", "--version"])
          if (pip.code === 0) return p
          await run([p, "-m", "ensurepip", "--upgrade"])
          const pip2 = await run([p, "-m", "pip", "--version"])
          if (pip2.code === 0) return p

          await run([py, "-m", "pip", "install", "--user", "-U", "virtualenv"])
          await fs.rm(venv, { recursive: true, force: true })
          const vv = await run([py, "-m", "virtualenv", venv])
          if (vv.code !== 0) return
          const p2 = await getpy()
          if (!p2) return
          const pip3 = await run([p2, "-m", "pip", "--version"])
          return pip3.code === 0 ? p2 : undefined
        }

        const vpy = await ensureVenvPip()
        const pipPy = vpy ?? py
        const pipArgs = vpy ? [] : ["--user"]

        await run([pipPy, "-m", "pip", "install", ...pipArgs, "-U", "pip"])
        const deps = await run([pipPy, "-m", "pip", "install", ...pipArgs, "-U", "setuptools", "wheel"])
        if (deps.code !== 0) {
          return c.json({ ok: false, message: deps.err.trim() || deps.out.trim() || "python deps install failed" })
        }

        const log = path.join(heidi, `install-${dt()}.log`)
        const base = [pipPy, "-m", "pip", "install", ...pipArgs, "-U"]
        const cmd = localOk ? [...base, "-e", spec] : [...base, spec]
        const proc = spawnLogged(cmd, log)

        const started_at = new Date().toISOString()
        await writeinstall({ pid: proc.pid, started_at, log })
        void proc.exited.then(async () => {
          const cur = await readinstall()
          if (cur && cur.pid === proc.pid) await writeinstall(undefined)
        })

        return c.json({ ok: true, message: "install started" })
      },
    )
    .get(
      "/teacher-models",
      describeRoute({
        summary: "Teacher models",
        operationId: "qlora.teacher_models",
        responses: {
          200: {
            description: "Teacher models",
            content: {
              "application/json": {
                schema: resolver(z.object({ models: z.array(z.string()) }).strict()),
              },
            },
          },
        },
      }),
      async (c) => {
        const list = await Provider.list()
          .then((providers) =>
            Object.entries(providers).flatMap(([pid, p]) => Object.keys(p.models).map((mid) => `${pid}/${mid}`)),
          )
          .catch(async () => {
            const all = await ModelsDev.get()
            return Object.entries(all).flatMap(([pid, p]) => Object.keys(p.models).map((mid) => `${pid}/${mid}`))
          })

        const models = [...new Set(list)].sort((a, b) => a.localeCompare(b))
        return c.json({ models })
      },
    )
    .get(
      "/base-models",
      describeRoute({
        summary: "Base models",
        operationId: "qlora.base_models",
        responses: {
          200: {
            description: "Base models",
            content: {
              "application/json": {
                schema: resolver(z.object({ models: z.array(z.string()) }).strict()),
              },
            },
          },
        },
      }),
      async (c) => c.json({ models: await basemodels() }),
    )
    .post(
      "/start",
      describeRoute({
        summary: "Start pump",
        operationId: "qlora.start",
        responses: {
          200: {
            description: "Started",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({ ok: z.boolean(), run_id: z.string().optional(), message: z.string() }).strict(),
                ),
              },
            },
          },
        },
      }),
      validator("json", cfg),
      async (c) => {
        const input = c.req.valid("json")

        // Prefer python path from request body (unsaved) if present
        let py: string | undefined
        if (input?.heidi_engine_python) {
          const test = await run([input.heidi_engine_python, "-c", "import heidi_engine"])
          if (test.code === 0) py = input.heidi_engine_python
          else
            return c.json({
              ok: false,
              message: `Checked using ${input.heidi_engine_python}: import heidi_engine failed: ${String(test.err || test.out || "").trim()}`,
            })
        }
        if (!py) {
          py = await findpy()
        }
        if (!py) return c.json({ ok: false, message: "heidi-engine not installed (run Install first)" })

        const a = await readactive()
        if (a && pidok(a.pid)) return c.json({ ok: false, message: `already running: ${a.run_id}` })
        if (state.run && pidok(state.run.pid))
          return c.json({ ok: false, message: `already running: ${state.run.run_id}` })

        const run_id = input.run_id || dt()
        const dir = path.join(runs, run_id)
        const log = path.join(dir, "pump.log")
        await fs.mkdir(dir, { recursive: true })

        const attach = input.teacher.openhei_attach || "http://127.0.0.1:4100"
        if (!input.teacher.openhei_start) {
          const ok = await attachok(attach)
          if (!ok) return c.json({ ok: false, message: `attach not reachable: ${attach}/doc` })
        }

        const args = [
          py,
          "-m",
          "heidi_engine.pump",
          "--runs-dir",
          runs,
          "--run-id",
          run_id,
          "--stack",
          input.stack,
          "--max-repos",
          String(input.max_repos),
          "--rounds",
          String(input.rounds),
          "--samples-per-run",
          String(input.samples_per_run),
          "--max-requests",
          String(input.max_requests),
          "--teacher-backend",
          input.teacher.teacher_backend,
          "--teacher-model",
          input.teacher.teacher_model,
          "--openhei-attach",
          attach,
          "--openhei-agent",
          input.teacher.openhei_agent || "",
          "--base-model",
          input.base_model,
          "--train-steps",
          String(input.train_steps),
          "--save-steps",
          String(input.save_steps),
          "--eval-steps",
          String(input.eval_steps),
          "--val-ratio",
          String(input.val_ratio),
        ]

        if (input.teacher.openhei_start) {
          args.push("--openhei-start")
          args.push("--openhei-host", "127.0.0.1")
          args.push("--openhei-port", "4100")
        }
        if (input.teacher.openhei_attach_strict) args.push("--openhei-attach-strict")

        const env: Record<string, string> = {
          TEACHER_WORKERS: String(input.teacher.teacher_workers),
          TEACHER_BATCH_SIZE: String(input.teacher.teacher_batch_size),
          TEACHER_MAX_TOKENS: String(input.teacher.teacher_max_tokens),
          SEQ_LEN: String(input.seq_len),
          BATCH_SIZE: String(input.batch_size),
          GRAD_ACCUM: String(input.grad_accum),
          LORA_R: String(input.lora_r),
        }

        // If a local checkout exists, tell pump where scripts live.
        const local = "/home/heidi/work/heidi-engine"
        if (await exists(path.join(local, "scripts"))) env["HEIDI_ENGINE_PROJECT_ROOT"] = local

        // Ensure heidi-engine can find the OpenHei CLI even when it's not in PATH.
        const cli = path.resolve(__dirname, "../../index.ts")
        if (await exists(cli)) {
          env["OPENHEI_CLI"] = `/snap/bin/bun run --conditions=browser ${cli}`
        }

        const proc = spawnLogged(args, log, { env })

        const started_at = new Date().toISOString()
        state.run = { run_id, pid: proc.pid, started_at, dir, log, proc }
        await writeactive({ run_id, pid: proc.pid, started_at })

        // Register in process registry for tracking
        const registry = await readProcessRegistry()
        registry.push({ pid: proc.pid, run_id, started_at, tag: "qlora" })
        await writeProcessRegistry(registry)

        void proc.exited.then(async () => {
          if (state.run?.run_id === run_id) state.run = undefined
          const cur = await readactive()
          if (cur?.run_id === run_id) await writeactive(undefined)
          // Clean up registry entry
          const reg = await readProcessRegistry()
          const filtered = reg.filter((r) => r.pid !== proc.pid)
          if (filtered.length !== reg.length) await writeProcessRegistry(filtered)
        })

        return c.json({ ok: true, run_id, message: "started" })
      },
    )
    .post(
      "/stop",
      describeRoute({
        summary: "Stop pump",
        operationId: "qlora.stop",
        responses: {
          200: {
            description: "Stopped",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.boolean(), message: z.string() }).strict()),
              },
            },
          },
        },
      }),
      validator("json", z.object({ run_id: z.string().optional() }).strict()),
      async (c) => {
        const run_id = c.req.valid("json").run_id
        const a = await readactive()
        const sr = state.run && pidok(state.run.pid) ? state.run : undefined
        const ar = a && pidok(a.pid) ? a : undefined

        const target = run_id ? (sr?.run_id === run_id ? sr : ar?.run_id === run_id ? ar : undefined) : (sr ?? ar)
        if (!target) {
          await writeactive(undefined)
          state.run = undefined
          return c.json({ ok: true, message: "not running" })
        }
        if (run_id && target.run_id !== run_id) return c.json({ ok: false, message: "run_id mismatch" })

        await killpid(target.pid, "SIGTERM")
        await waitdead(target.pid, 5000)
        if (pidok(target.pid)) {
          await killpid(target.pid, "SIGKILL")
          await waitdead(target.pid, 3000)
        }

        if (sr && target.run_id === sr.run_id && sr.dir) {
          const statusFile = path.join(sr.dir, "status.json")
          await fs
            .readFile(statusFile, "utf-8")
            .then((x) => JSON.parse(x) as Record<string, unknown>)
            .then((s) => {
              s.stage = "STOPPED"
              return fs.writeFile(statusFile, JSON.stringify(s, null, 2))
            })
            .catch(() => {})
        }

        await writeactive(undefined)
        state.run = undefined
        return c.json({ ok: true, message: "stopped" })
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Pump status",
        operationId: "qlora.status",
        responses: {
          200: {
            description: "Status",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      ok: z.boolean(),
                      run_id: z.string().optional(),
                      running: z.boolean(),
                      stage: z.string().optional(),
                      status: z.record(z.string(), z.any()).optional(),
                      ready: z.record(z.string(), z.any()).optional(),
                    })
                    .strict(),
                ),
              },
            },
          },
        },
      }),
      validator("query", z.object({ run_id: z.string().optional() }).strict()),
      async (c) => {
        const run_id = c.req.valid("query").run_id
        const a = await readactive()
        const rid = run_id || a?.run_id
        if (!rid) return c.json({ ok: true, running: false })

        const dir = path.join(runs, rid)
        const status = await fs
          .readFile(path.join(dir, "status.json"), "utf-8")
          .then((x) => JSON.parse(x) as Record<string, unknown>)
          .catch(() => undefined)
        const ready = await fs
          .readFile(path.join(dir, "READY.json"), "utf-8")
          .then((x) => JSON.parse(x) as Record<string, unknown>)
          .catch(() => undefined)
        const running = a ? pidok(a.pid) : false
        const stage = typeof status?.stage === "string" ? (status.stage as string) : undefined
        return c.json({ ok: true, run_id: rid, running, stage, status, ready })
      },
    )
    .get(
      "/logs",
      describeRoute({
        summary: "Stream logs",
        operationId: "qlora.logs",
        responses: {
          200: {
            description: "Log stream",
            content: {
              "text/event-stream": {
                schema: resolver(z.any()),
              },
            },
          },
        },
      }),
      validator("query", z.object({ run_id: z.string() }).strict()),
      async (c) => {
        const run_id = c.req.valid("query").run_id
        const file = path.join(runs, run_id, "pump.log")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        let pos = 0
        let partial = ""
        const send = async (stream: { writeSSE: (x: { data: string }) => Promise<void> }) => {
          const stat = await fs.stat(file).catch(() => undefined)
          if (!stat) return
          if (stat.size <= pos) return
          const fd = await fs.open(file, "r")
          const buf = Buffer.alloc(stat.size - pos)
          await fd.read(buf, 0, buf.length, pos)
          await fd.close()
          pos = stat.size

          const text = partial + buf.toString("utf-8")
          const segments = text.split(/(\r|\n)/).filter((x) => x)
          partial = ""

          const lines: string[] = []
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]
            if (seg === "\r" || seg === "\n") continue
            const next = segments[i + 1]
            if (next === "\r" || next === "\n") {
              lines.push(seg)
            } else if (i === segments.length - 1) {
              partial = seg
            } else {
              lines.push(seg)
            }
          }

          for (const line of lines) {
            const trimmed = line.trimEnd()
            if (!trimmed) continue
            const m = trimmed.match(/\[INFO\] Generated (\d+)\/(\d+) \((\d+)%\) \| ([0-9.]+) it\/s \| ETA (\d+)s/)
            if (m) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "progress",
                  done: Number(m[1]),
                  total: Number(m[2]),
                  pct: Number(m[3]),
                  rate: Number(m[4]),
                  eta: Number(m[5]),
                }),
              })
              continue
            }
            await stream.writeSSE({ data: JSON.stringify({ type: "log", line: redact(trimmed) }) })
          }
        }

        return streamSSE(c, async (stream) => {
          await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) })
          const poll = setInterval(() => {
            void send(stream)
          }, 250)
          const heartbeat = setInterval(async () => {
            await stream.writeSSE({ data: JSON.stringify({ type: "heartbeat" }) })
          }, 2000)
          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              clearInterval(poll)
              clearInterval(heartbeat)
              resolve()
            })
          })
        })
      },
    )
    .get(
      "/pids",
      describeRoute({
        summary: "List QLoRA processes",
        operationId: "qlora.get_pids",
        responses: {
          200: {
            description: "Process list",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    processes: z.array(
                      z.object({
                        pid: z.number().int(),
                        ppid: z.number().int(),
                        cmd: z.string(),
                        cwd: z.string().optional(),
                        user: z.string(),
                        started_at: z.string(),
                        tag: z.enum(["qlora", "child"]),
                      }),
                    ),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const processes = await listQLoRAProcesses()
        return c.json({ processes })
      },
    )
    .post(
      "/kill",
      describeRoute({
        summary: "Kill a QLoRA process",
        operationId: "qlora.kill",
        responses: {
          200: {
            description: "Kill result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    ok: z.boolean(),
                    message: z.string(),
                    used_signal: z.enum(["SIGTERM", "SIGKILL"]).optional(),
                  }),
                ),
              },
            },
          },
          400: {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: resolver(z.object({ error: z.string() })),
              },
            },
          },
          403: {
            description: "Not eligible for kill",
            content: {
              "application/json": {
                schema: resolver(z.object({ error: z.string() })),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          pid: z.number().int().positive(),
          signal: z.enum(["SIGTERM", "SIGKILL"]).optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const result = await killProcess(body.pid, body.signal)
        if (!result.ok && result.code === 403) return c.json({ error: result.message }, 403)
        if (!result.ok) return c.json({ error: result.message }, 400)
        return c.json({ ok: true, message: result.message, used_signal: result.signal })
      },
    ),
)

// Process tracking registry file
const processRegistryPath = path.join(Global.Path.state, "qlora.processes.json")

// Read the process registry
const readProcessRegistry = async (): Promise<
  Array<{ pid: number; run_id?: string; started_at: string; tag: "qlora" | "child" }>
> => {
  const txt = await fs.readFile(processRegistryPath, "utf-8").catch(() => "")
  if (!txt) return []
  try {
    const parsed = JSON.parse(txt)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return []
}

// Write the process registry
const writeProcessRegistry = async (
  data: Array<{ pid: number; run_id?: string; started_at: string; tag: "qlora" | "child" }>,
) => {
  await fs.mkdir(path.dirname(processRegistryPath), { recursive: true })
  await fs.writeFile(processRegistryPath, JSON.stringify(data, null, 2) + "\n")
}

// Parse /proc/PID/stat to get process info
const readProcStat = async (pid: number): Promise<{ ppid: number; starttime: number } | undefined> => {
  try {
    const statPath = "/proc/" + pid + "/stat"
    const stat = await fs.readFile(statPath, "utf-8")
    // Format: pid (comm) state ppid ... starttime ...
    // comm can contain spaces and parentheses, so we need to parse carefully
    const match = stat.match(/^\d+\s+\([^)]+\)\s+\w+\s+(\d+)\s+(?:\S+\s+){18}(\d+)/)
    if (!match) return undefined
    return { ppid: parseInt(match[1], 10), starttime: parseInt(match[2], 10) }
  } catch {
    return undefined
  }
}

// Parse /proc/PID/cmdline to get command
const readProcCmdline = async (pid: number): Promise<string> => {
  try {
    const cmdlinePath = "/proc/" + pid + "/cmdline"
    const buf = await fs.readFile(cmdlinePath)
    // cmdline is null-separated
    return buf.toString().replace(/\0/g, " ").trim()
  } catch {
    return ""
  }
}

// Parse /proc/PID/cwd to get current working directory
const readProcCwd = async (pid: number): Promise<string | undefined> => {
  try {
    const cwdPath = "/proc/" + pid + "/cwd"
    return await fs.readlink(cwdPath)
  } catch {
    return undefined
  }
}

// Parse /proc/PID/status to get user info
const readProcUser = async (pid: number): Promise<string> => {
  try {
    const statusPath = "/proc/" + pid + "/status"
    const status = await fs.readFile(statusPath, "utf-8")
    const uidMatch = status.match(/^Uid:\s*(\d+)/m)
    if (!uidMatch) return "unknown"
    const uid = parseInt(uidMatch[1], 10)
    // Try to resolve uid to username
    try {
      const passwd = await fs.readFile("/etc/passwd", "utf-8")
      const uidColon = uid + ":"
      const colonUidColon = ":" + uid + ":"
      const line = passwd.split("\n").find((l) => l.startsWith(uidColon) || l.includes(colonUidColon))
      if (line) {
        const parts = line.split(":")
        if (parts[2] === String(uid)) return parts[0]
      }
    } catch {}
    return String(uid)
  } catch {
    return "unknown"
  }
}

// Check if a process is a QLoRA-related process by signature
const isQLoRAProcess = (cmd: string): boolean => {
  if (!cmd) return false
  const qloraSignatures = ["heidi_engine", "heidi-engine", "qlora", "python -m heidi_engine"]
  return qloraSignatures.some((sig) => cmd.toLowerCase().includes(sig.toLowerCase()))
}

// Check if PID is eligible to be killed (not PID 1, not root system daemon)
const isEligiblePID = (pid: number, user: string, cmd: string): boolean => {
  if (pid <= 1) return false
  if (pid === process.pid) return false
  // Never allow killing root-owned system daemons
  if (user === "root" && (cmd.includes("systemd") || cmd.includes("init") || cmd.includes("dbus"))) return false
  return true
}

// List all QLoRA-related processes
const listQLoRAProcesses = async (): Promise<
  Array<{
    pid: number
    ppid: number
    cmd: string
    cwd: string | undefined
    user: string
    started_at: string
    tag: "qlora" | "child"
  }>
> => {
  if (process.platform !== "linux") return []

  const results: Array<{
    pid: number
    ppid: number
    cmd: string
    cwd: string | undefined
    user: string
    started_at: string
    tag: "qlora" | "child"
  }> = []

  // First, try to use the tracked registry
  const registry = await readProcessRegistry()
  const registryPids = new Set<number>()

  for (const entry of registry) {
    if (!pidok(entry.pid)) continue
    registryPids.add(entry.pid)
    const cmd = await readProcCmdline(entry.pid)
    const stat = await readProcStat(entry.pid)
    const cwd = await readProcCwd(entry.pid)
    const user = await readProcUser(entry.pid)

    if (!isEligiblePID(entry.pid, user, cmd)) continue

    results.push({
      pid: entry.pid,
      ppid: stat?.ppid ?? 0,
      cmd,
      cwd,
      user,
      started_at: entry.started_at,
      tag: entry.tag,
    })
  }

  // Also scan /proc for QLoRA processes by signature
  try {
    const entries = await fs.readdir("/proc")
    for (const entry of entries) {
      const pid = parseInt(entry, 10)
      if (!Number.isFinite(pid)) continue
      if (registryPids.has(pid)) continue // Already included from registry

      const cmd = await readProcCmdline(pid)
      if (!isQLoRAProcess(cmd)) continue

      const stat = await readProcStat(pid)
      const cwd = await readProcCwd(pid)
      const user = await readProcUser(pid)

      if (!isEligiblePID(pid, user, cmd)) continue

      // Determine if this is a root QLoRA process or a child
      const isRoot = cmd.includes("pump") || cmd.includes("heidi_engine.pump")

      results.push({
        pid,
        ppid: stat?.ppid ?? 0,
        cmd,
        cwd,
        user,
        started_at: new Date(Date.now() - (stat?.starttime ?? 0) * 10).toISOString(), // Approximate from starttime
        tag: isRoot ? "qlora" : "child",
      })
    }
  } catch {}

  return results.sort((a, b) => a.pid - b.pid)
}

// Kill a process with safety checks
type KillResult = { ok: boolean; message: string; code?: number; signal?: "SIGTERM" | "SIGKILL" }

const killProcess = async (pid: number, requestedSignal?: "SIGTERM" | "SIGKILL"): Promise<KillResult> => {
  // Get the list of eligible processes
  const eligible = await listQLoRAProcesses()
  const eligiblePids = new Set(eligible.map((p) => p.pid))

  // Deny by default if not in eligible list
  if (!eligiblePids.has(pid)) {
    return { ok: false, message: "PID not eligible for termination", code: 403 }
  }

  // Check if PID is still alive
  if (!pidok(pid)) {
    return { ok: false, message: "Process not running" }
  }

  const proc = eligible.find((p) => p.pid === pid)
  if (!proc) {
    return { ok: false, message: "Process info not found", code: 403 }
  }

  // Validate ownership - must be current user or we must have permissions
  const currentUid = process.getuid?.() ?? 1000
  try {
    const statusPath = "/proc/" + pid + "/status"
    const status = await fs.readFile(statusPath, "utf-8")
    const uidMatch = status.match(/^Uid:\s*(\d+)/m)
    if (uidMatch) {
      const procUid = parseInt(uidMatch[1], 10)
      if (procUid !== currentUid && currentUid !== 0) {
        return { ok: false, message: "Permission denied - not process owner", code: 403 }
      }
    }
  } catch (err) {
    return { ok: false, message: "Failed to verify process ownership" }
  }

  // Determine signal to use
  let signal: "SIGTERM" | "SIGKILL" = requestedSignal ?? "SIGTERM"

  // If SIGKILL requested but SIGTERM was never attempted, deny
  if (signal === "SIGKILL") {
    // Check if we have a record of SIGTERM being attempted
    const termAttemptsPath = path.join(Global.Path.state, "qlora.term-attempts.json")
    const termAttempts = await fs.readFile(termAttemptsPath, "utf-8").catch(() => "{}")
    let attempts: Record<string, string> = {}
    try {
      attempts = JSON.parse(termAttempts)
    } catch {}

    const lastAttempt = attempts[String(pid)]
    if (!lastAttempt) {
      return { ok: false, message: "SIGTERM must be attempted before SIGKILL" }
    }

    // Check if 3 seconds have passed since SIGTERM
    const elapsed = Date.now() - new Date(lastAttempt).getTime()
    if (elapsed < 3000) {
      const waitSeconds = Math.ceil((3000 - elapsed) / 1000)
      return { ok: false, message: "Wait " + waitSeconds + "s before SIGKILL" }
    }
  }

  // Send the signal
  try {
    process.kill(pid, signal)

    // Record SIGTERM attempt
    if (signal === "SIGTERM") {
      const termAttemptsPath = path.join(Global.Path.state, "qlora.term-attempts.json")
      const termAttempts = await fs.readFile(termAttemptsPath, "utf-8").catch(() => "{}")
      let attempts: Record<string, string> = {}
      try {
        attempts = JSON.parse(termAttempts)
      } catch {}
      attempts[String(pid)] = new Date().toISOString()
      await fs.mkdir(path.dirname(termAttemptsPath), { recursive: true })
      await fs.writeFile(termAttemptsPath, JSON.stringify(attempts, null, 2) + "\n")
    }

    // Wait briefly to confirm
    const died = await waitdead(pid, 1000)

    if (signal === "SIGTERM" && !died) {
      return { ok: true, message: "SIGTERM sent - process may need SIGKILL if still alive in 3s", signal }
    }

    return { ok: true, message: died ? "Process terminated" : "Signal sent", signal }
  } catch (err: any) {
    const errMsg = err?.message ?? String(err)
    return { ok: false, message: "Failed to send signal: " + errMsg }
  }
}

const dt = () => new Date().toISOString().replaceAll(":", "").replaceAll(".", "-")
