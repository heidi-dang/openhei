import {
  type Component,
  Show,
  For,
  createEffect,
  createMemo,
  createResource,
  onCleanup,
  createSignal,
  onMount,
} from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@openhei-ai/ui/button"
import { Icon } from "@openhei-ai/ui/icon"
import { Popover } from "@openhei-ai/ui/popover"
import { Select } from "@openhei-ai/ui/select"
import { Switch } from "@openhei-ai/ui/switch"
import { TextField } from "@openhei-ai/ui/text-field"
import { showToast } from "@openhei-ai/ui/toast"
import { useSettings } from "@/context/settings"

type Doctor = {
  installed: boolean
  tool_dir: string
  tool_dir_candidates?: string[]
  selected_tool_dir?: string
  checks?: {
    exists: boolean
    pump_import_ok: boolean
    venv_python_path?: string
  }
  python?: string
  version?: string
  gpu?: string
  disk?: { path: string; free_bytes: number }
  active?: { run_id: string; pid: number; started_at: string }
  diagnostics?: any
}

type Stack = {
  id: string
  label: string
  description: string
  available: boolean
  reason?: string
}

type Status = {
  ok: boolean
  run_id?: string
  running: boolean
  stage?: string
  status?: Record<string, unknown>
  ready?: Record<string, unknown>
  watchdog?: {
    run_id: string
    pid: number
    started_at: string
    last_stdout_ts: number
    last_stderr_ts: number
    last_progress_ts: number
    status: "running" | "stuck" | "stopped"
    stuck_reason?: string
  }
}

const preset = {
  safe: {
    name: "Mistral-7B safe (11GB)",
    base_model: "mistralai/Mistral-7B-Instruct-v0.2",
    seq_len: 1024,
    batch_size: 1,
    grad_accum: 8,
    lora_r: 32,
    train_steps: 1200,
    val_ratio: 0.05,
    max_repos: 50,
    rounds: 2,
    samples_per_run: 100,
    max_requests: 10_000,
  },
  smoke: {
    name: "Mistral fast smoke",
    base_model: "mistralai/Mistral-7B-Instruct-v0.2",
    seq_len: 512,
    batch_size: 1,
    grad_accum: 4,
    lora_r: 16,
    train_steps: 50,
    val_ratio: 0.05,
    max_repos: 1,
    rounds: 1,
    samples_per_run: 10,
    max_requests: 100,
  },
} as const

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as T
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as T
}

export const SettingsQLoRA: Component = () => {
  const settings = useSettings()
  const [store, setStore] = createStore<any>({
    preset: "safe" as keyof typeof preset,
    teacher_model: "openai/gpt-5.2",
    teacher_backend: "openhei" as "openhei" | "legacy",
    teacher_workers: 1,
    teacher_batch_size: 1,
    teacher_max_tokens: 256,
    openhei_attach: "http://127.0.0.1:4100",
    openhei_agent: "",
    openhei_start: true,
    openhei_attach_strict: false,
    heidi_engine_python: "",
    heidi_engine_path: "",

    stack: "python",
    max_repos: preset.safe.max_repos,
    rounds: preset.safe.rounds,
    samples_per_run: preset.safe.samples_per_run,
    max_requests: preset.safe.max_requests,

    base_model: preset.safe.base_model,
    train_steps: preset.safe.train_steps,
    save_steps: 100,
    eval_steps: 200,
    seq_len: preset.safe.seq_len,
    batch_size: preset.safe.batch_size,
    grad_accum: preset.safe.grad_accum,
    lora_r: preset.safe.lora_r,
    val_ratio: preset.safe.val_ratio,

    running: false,
    run_id: "" as string,
    stage: "" as string,
    progress: undefined as undefined | { done: number; total: number; pct: number; rate: number; eta: number },
    logs: [] as string[],
    connected: false,
    lastEventTime: 0,
    watchdog: undefined as
      | undefined
      | {
          run_id: string
          pid: number
          started_at: string
          last_stdout_ts: number
          last_stderr_ts: number
          last_progress_ts: number
          status: "running" | "stuck" | "stopped"
          stuck_reason?: string
        },
    autoScroll: true,
  })

  const [doc, docActions] = createResource(() =>
    get<Doctor>("/api/v1/qlora/doctor").catch(() => undefined as unknown as Doctor),
  )
  const [teachers] = createResource(() =>
    get<{ models: string[] }>("/api/v1/qlora/teacher-models").catch(() => ({ models: [] })),
  )
  const [bases] = createResource(() =>
    get<{ models: string[] }>("/api/v1/qlora/base-models").catch(() => ({ models: [] })),
  )
  const [stacks] = createResource(() => get<Stack[]>("/api/v1/qlora/stacks").catch(() => [] as Stack[]))

  // Saved config as returned from server (canonical). We keep it separate from the UI store
  const [saved, setSaved] = createStore<Record<string, unknown>>({})
  const [savedAt, setSavedAt] = createSignal<number | null>(null)

  const activeTabs = ["Setup", "Models", "Data", "Training", "Budget", "Monitor", "Artifacts", "Processes"] as const
  const [activeTab, setActiveTab] = createSignal<(typeof activeTabs)[number]>("Setup")

  const put = async <T,>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return (await res.json()) as T
  }

  // Build a canonical config object from the local store (exclude runtime-only fields)
  const configFromStore = () => ({
    stack: store.stack,
    max_repos: store.max_repos,
    rounds: store.rounds,
    samples_per_run: store.samples_per_run,
    max_requests: store.max_requests,
    base_model: store.base_model,
    train_steps: store.train_steps,
    save_steps: store.save_steps,
    eval_steps: store.eval_steps,
    seq_len: store.seq_len,
    batch_size: store.batch_size,
    grad_accum: store.grad_accum,
    lora_r: store.lora_r,
    val_ratio: store.val_ratio,
    preset: store.preset,
    teacher: {
      teacher_backend: store.teacher_backend,
      teacher_model: store.teacher_model,
      teacher_workers: store.teacher_workers,
      teacher_batch_size: store.teacher_batch_size,
      teacher_max_tokens: store.teacher_max_tokens,
      openhei_attach: store.openhei_attach,
      openhei_agent: store.openhei_agent,
      openhei_start: store.openhei_start,
      openhei_attach_strict: store.openhei_attach_strict,
    },
    heidi_engine_python: store.heidi_engine_python,
    heidi_engine_path: store.heidi_engine_path,
  })

  // Compare fields for dirty state. We map logical fields to tabs so we can show per-tab dirty badges.
  const tabFields: Record<string, string[]> = {
    Setup: [
      "preset",
      "stack",
      "openhei_attach",
      "openhei_agent",
      "openhei_start",
      "openhei_attach_strict",
      "teacher_backend",
    ],
    Models: ["teacher_model", "base_model"],
    Data: ["max_repos", "rounds", "samples_per_run"],
    Training: ["train_steps", "save_steps", "eval_steps", "seq_len", "batch_size", "grad_accum", "lora_r", "val_ratio"],
    Budget: ["teacher_workers", "teacher_batch_size", "teacher_max_tokens", "max_requests"],
    Monitor: [],
    Artifacts: ["save_steps"],
    Processes: [],
  }

  const isDirty = createMemo(() => {
    try {
      const a = JSON.stringify(configFromStore())
      const b = JSON.stringify(saved)
      return a !== b
    } catch {
      return false
    }
  })

  const isTabDirty = (tab: string) => {
    if (!saved || Object.keys(saved).length === 0) return false
    const cfg = configFromStore()
    for (const k of tabFields[tab] ?? []) {
      const a = (cfg as any)[k]
      const b = (saved as any)[k]
      if (JSON.stringify(a) !== JSON.stringify(b)) return true
    }
    // teacher.* fields are nested
    if (tab === "Setup") {
      const t = (cfg as any).teacher || {}
      const s = (saved as any).teacher || {}
      for (const fk of [
        "teacher_backend",
        "openhei_attach",
        "openhei_agent",
        "openhei_start",
        "openhei_attach_strict",
      ]) {
        const key = fk === "teacher_backend" ? "teacher_backend" : fk
        if (JSON.stringify(t[key]) !== JSON.stringify(s[key])) return true
      }
    }
    return false
  }

  const options = createMemo<Array<{ id: string; name: string }>>(() =>
    Object.entries(preset).map(([id, item]) => ({ id, name: item.name })),
  )

  createEffect(() => {
    const id = store.preset as keyof typeof preset
    const p = preset[id]
    setStore({
      base_model: p.base_model,
      seq_len: p.seq_len,
      batch_size: p.batch_size,
      grad_accum: p.grad_accum,
      lora_r: p.lora_r,
      train_steps: p.train_steps,
      val_ratio: p.val_ratio,
      max_repos: p.max_repos,
      rounds: p.rounds,
      samples_per_run: p.samples_per_run,
      max_requests: p.max_requests,
    })
  })

  let es: EventSource | undefined
  let esReconnectTimeout: ReturnType<typeof setTimeout> | undefined
  const close = () => {
    es?.close()
    es = undefined
    if (esReconnectTimeout) {
      clearTimeout(esReconnectTimeout)
      esReconnectTimeout = undefined
    }
  }
  onCleanup(close)

  let esReconnectBackoff = 10000

  const connect = (run_id: string) => {
    close()
    setStore("logs", [])
    setStore("progress", undefined)
    setStore("connected", false)
    setStore("lastEventTime", 0)
    setStore("autoScroll", true)
    esReconnectBackoff = 10000
    es = new EventSource(`/api/v1/qlora/logs?run_id=${encodeURIComponent(run_id)}`)
    const updateEventTime = () => {
      setStore("lastEventTime", Date.now())
      setStore("connected", true)
      esReconnectBackoff = 10000
    }
    const scheduleReconnect = () => {
      if (esReconnectTimeout) clearTimeout(esReconnectTimeout)
      esReconnectTimeout = setTimeout(() => {
        if (store.run_id && store.running && !store.connected) {
          esReconnectBackoff = Math.min(esReconnectBackoff * 1.5, 60000)
          connect(store.run_id)
        }
      }, esReconnectBackoff)
    }
    es.onmessage = (e) => {
      updateEventTime()
      const data = JSON.parse(e.data) as { type: string; [k: string]: unknown }
      if (data.type === "heartbeat" || data.type === "connected") return
      if (data.type === "progress") {
        setStore("progress", {
          done: Number(data.done),
          total: Number(data.total),
          pct: Number(data.pct),
          rate: Number(data.rate),
          eta: Number(data.eta),
        })
        return
      }
      if (data.type !== "log") return
      const line = String(data.line ?? "")
      setStore("logs", (prev: string[]) => {
        const next = [...prev, line]
        return next.length > 2000 ? next.slice(-2000) : next
      })
      // Auto-scroll to bottom if enabled
      if (store.autoScroll) {
        setTimeout(() => {
          const el = document.getElementById("qlora-logs-container")
          if (el) el.scrollTop = el.scrollHeight
        }, 10)
      }
    }
    es.onerror = () => {
      setStore("connected", false)
      scheduleReconnect()
    }
  }

  const poll = async (run_id: string) => {
    const s = await get<Status>(`/api/v1/qlora/status?run_id=${encodeURIComponent(run_id)}`).catch(() => undefined)
    if (!s) {
      setStore("connected", false)
      return
    }
    setStore("running", s.running)
    setStore("connected", true)
    setStore("stage", s.stage ?? "")
    setStore("watchdog", s.watchdog)
    if (s.watchdog?.status === "stuck") {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "Run stuck",
        description: s.watchdog.stuck_reason || "No output for 2+ minutes",
      })
    }
    if (s.ready && !s.running) {
      showToast({ variant: "success", icon: "circle-check", title: "READY", description: `Run ${run_id} complete` })
    }
  }

  let pollInterval: ReturnType<typeof setInterval> | undefined
  let pollBackoff = 1500

  createEffect(() => {
    const run_id = store.run_id
    if (!run_id) return

    onCleanup(() => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = undefined
      }
      pollBackoff = 1500
    })

    let alive = true
    const tick = async () => {
      if (!alive) return
      if (!store.running) return

      const s = await get<Status>(`/api/v1/qlora/status?run_id=${encodeURIComponent(run_id)}`).catch(() => undefined)
      if (!s) {
        pollBackoff = Math.min(pollBackoff * 1.5, 10000)
        if (pollInterval) {
          clearInterval(pollInterval)
          pollInterval = setInterval(tick, pollBackoff)
        }
        setStore("connected", false)
        return
      }

      pollBackoff = 1500
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = setInterval(tick, pollBackoff)
      }

      setStore("running", s.running)
      setStore("connected", true)
      setStore("stage", s.stage ?? "")
      if (s.ready && !s.running) {
        showToast({ variant: "success", icon: "circle-check", title: "READY", description: `Run ${run_id} complete` })
      }
    }

    tick()
    pollInterval = setInterval(tick, pollBackoff)
  })

  const install = async () => {
    const out = await post<{ ok: boolean; message: string }>("/api/v1/qlora/install", {})
    showToast({ title: out.ok ? "Installed" : "Install failed", description: out.message })
    await docActions.refetch()
  }

  const start = async () => {
    const d = doc.latest
    if (!d?.installed) {
      showToast({ title: "heidi-engine not installed", description: "Click Install first" })
      return
    }
    // Start should use the last saved config by default. If there are unsaved changes, confirm run with unsaved
    const cfg = saved && Object.keys(saved).length > 0 ? saved : configFromStore()
    if (isDirty()) {
      const ok = window.confirm(
        "You have unsaved changes — start with unsaved changes? Click OK to proceed, or Cancel to save first.",
      )
      if (!ok) return
    }

    const out = await post<{ ok: boolean; run_id?: string; message: string }>("/api/v1/qlora/start", cfg)
    if (!out.ok || !out.run_id) {
      showToast({ title: "Start failed", description: out.message })
      return
    }
    setStore("run_id", out.run_id)
    setStore("running", true)
    connect(out.run_id)
  }

  const stop = async () => {
    const run_id = store.run_id

    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = undefined
    }
    pollBackoff = 1500

    const out = await post<{ ok: boolean; message: string }>("/api/v1/qlora/stop", run_id ? { run_id } : {})
    showToast({ title: out.ok ? "Stopped" : "Stop failed", description: out.message })
    setStore("running", false)
    setStore("run_id", "")
    close()
    await docActions.refetch()
  }

  const info = createMemo(() => {
    const d = doc.latest
    if (!d) return
    const parts = [`Installed: ${d.installed ? "yes" : "no"}`, `Tool dir: ${d.tool_dir}`]
    if (d.selected_tool_dir) parts.push(`Detected: ${d.selected_tool_dir}`)
    if (d.python) parts.push(`Python: ${d.python}`)
    if (d.version) parts.push(`heidi-engine: ${d.version}`)
    if (d.gpu) parts.push(`GPU: ${d.gpu.split("\n")[0]}`)
    if (d.disk) parts.push(`Disk free: ${Math.round(d.disk.free_bytes / 1024 / 1024 / 1024)} GB`)
    // diagnostics
    const diag = (d as any).diagnostics
    if (diag?.sys_executable) parts.push(`Checked executable: ${diag.sys_executable}`)
    if (diag?.install_cmd) parts.push(`Install command: ${diag.install_cmd}`)
    if ((d as any).import_err) parts.push(`Import error: ${(d as any).import_err}`)
    return parts
  })

  const teacherOptions = createMemo(() => (teachers.latest?.models ?? []).map((id) => ({ id })))
  const baseOptions = createMemo(() => {
    const items = bases.latest?.models ?? []
    const merged = [...new Set([store.base_model, ...items])].filter((x) => x)
    return merged.map((id) => ({ id }))
  })

  // On mount: hydrate from localStorage then reconcile with server canonical config
  onMount(async () => {
    try {
      const local = localStorage.getItem("qlora.config")
      if (local) {
        const parsed = JSON.parse(local)
        // apply to store partial fields
        setStore(parsed as any)
      }
    } catch {
      // ignore parse errors
    }
    try {
      const server = await get<Record<string, unknown>>("/api/v1/qlora/config")
      setSaved(server)
      setSavedAt(Date.now())
      // merge canonical server config into UI store
      const t = server.teacher as any
      setStore((s: any) => ({
        stack: (server as any).stack ?? s.stack,
        max_repos: (server as any).max_repos ?? s.max_repos,
        rounds: (server as any).rounds ?? s.rounds,
        samples_per_run: (server as any).samples_per_run ?? s.samples_per_run,
        max_requests: (server as any).max_requests ?? s.max_requests,
        base_model: (server as any).base_model ?? s.base_model,
        train_steps: (server as any).train_steps ?? s.train_steps,
        save_steps: (server as any).save_steps ?? s.save_steps,
        eval_steps: (server as any).eval_steps ?? s.eval_steps,
        seq_len: (server as any).seq_len ?? s.seq_len,
        batch_size: (server as any).batch_size ?? s.batch_size,
        grad_accum: (server as any).grad_accum ?? s.grad_accum,
        lora_r: (server as any).lora_r ?? s.lora_r,
        val_ratio: (server as any).val_ratio ?? s.val_ratio,
        preset: (server as any).preset ?? s.preset,
        teacher_model: t?.teacher_model ?? s.teacher_model,
        teacher_backend: t?.teacher_backend ?? s.teacher_backend,
        teacher_workers: t?.teacher_workers ?? s.teacher_workers,
        teacher_batch_size: t?.teacher_batch_size ?? s.teacher_batch_size,
        teacher_max_tokens: t?.teacher_max_tokens ?? s.teacher_max_tokens,
        openhei_attach: t?.openhei_attach ?? s.openhei_attach,
        openhei_agent: t?.openhei_agent ?? s.openhei_agent,
        openhei_start: t?.openhei_start ?? s.openhei_start,
        openhei_attach_strict: t?.openhei_attach_strict ?? s.openhei_attach_strict,
        heidi_engine_python: t?.heidi_engine_python ?? s.heidi_engine_python,
        heidi_engine_path: t?.heidi_engine_path ?? s.heidi_engine_path,
      }))
    } catch (err) {
      // ignore server errors — UI can still function with local values
      console.warn("Failed to fetch qlora config", err)
    }
  })

  const save = async () => {
    try {
      const cfg = configFromStore()
      const out = await put<{ ok: boolean; message?: string; config?: Record<string, unknown> }>(
        "/api/v1/qlora/config",
        cfg,
      )
      setSaved(out.config ?? cfg)
      setSavedAt(Date.now())
      localStorage.setItem("qlora.config", JSON.stringify(out.config ?? cfg))
      showToast({ title: "Saved", description: "QLoRA config saved" })
    } catch (err: any) {
      showToast({ title: "Save failed", description: String(err?.message ?? err) })
    }
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-3 pb-10 sm:px-10 sm:pb-10 min-w-0">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-2 pt-6 pb-6 max-w-[900px]">
          <h2 class="text-16-medium text-text-strong">QLoRA</h2>
          <Show when={info()}>
            {(x) => <div class="text-12-regular text-text-weak whitespace-pre-line">{x().join("\n")}</div>}
          </Show>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[900px] min-w-0">
        <div class="bg-surface-raised-base px-4 rounded-lg">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border-weak-base last:border-none">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-14-medium text-text-strong">
                <span class="inline-flex items-center gap-2">
                  <span>Doctor</span>
                  <Help text="Checks whether heidi-engine is installed and whether basic dependencies (GPU tools, disk space) look OK." />
                </span>
              </span>
              <span class="text-12-regular text-text-weak">Detect pump + python + GPU</span>
            </div>
            <div class="flex items-center gap-2">
              <Button size="small" variant="secondary" onClick={() => docActions.refetch()}>
                Refresh
              </Button>
              <Button size="small" variant="secondary" onClick={install}>
                Install
              </Button>
            </div>
          </div>
        </div>

        <div class="bg-surface-raised-base px-4 rounded-lg">
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 py-3 border-b border-border-weak-base">
            <div class="flex items-center gap-2 flex-wrap min-w-0">
              {activeTabs.map((t) => (
                <button
                  type="button"
                  class={`px-3 py-1 rounded shrink-0 ${activeTab() === t ? "bg-surface-strong text-text-strong" : "text-text-weak hover:text-text-base"}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t}
                  <Show when={isTabDirty(t)}>
                    <span class="ml-2 inline-block w-2 h-2 rounded-full bg-red-500" />
                  </Show>
                </button>
              ))}
            </div>
            <div class="flex items-center gap-2 sm:ml-auto">
              <div class="text-12-regular text-text-weak mr-2">
                {savedAt() ? `Saved ${new Date(savedAt()!).toLocaleString()}` : "Not saved"}
              </div>
              <Button size="small" variant={isDirty() ? "primary" : "secondary"} disabled={!isDirty()} onClick={save}>
                Save
              </Button>
            </div>
          </div>

          <Show when={activeTab() === "Setup"}>
            <div>
              <Row
                title="Preset"
                desc="Applies a bundle of recommended defaults for base model + training + collection."
                help="Applies a bundle of recommended defaults for base model + training + collection."
              >
                <Select
                  options={options()}
                  value={options().find((x) => x.id === store.preset)}
                  itemValue={(x) => x.id}
                  itemLabel={(x) => x.name ?? x.id}
                  onChange={(v) => v && setStore("preset", v.id as keyof typeof preset)}
                  variant="secondary"
                  size="small"
                  triggerVariant="settings"
                />
              </Row>

              <Row
                title="Enabled"
                desc="Show QLoRA in the left sidebar"
                help="Shows a QLoRA entry in the left sidebar for quicker access."
              >
                <div data-action="settings-qlora-enabled">
                  <Switch
                    checked={settings.ml.qloraEnabled()}
                    onChange={(checked) => settings.ml.setQLoRAEnabled(checked)}
                  />
                </div>
              </Row>

              <Row
                title="Attach"
                desc="OpenHei serve attach URL"
                help="URL of the OpenHei server to attach to for Path-B teacher generation (used by heidi-engine)."
              >
                <TextField
                  value={store.openhei_attach}
                  onChange={(v) => setStore("openhei_attach", v)}
                  class="w-full sm:w-[320px] max-w-full"
                />
              </Row>

              <Row
                title="heidi_engine_python"
                desc="Interpreter used to run heidi-engine"
                help="Full path to the Python interpreter to use for heidi-engine (optional). Use the 'Check' button to validate."
              >
                <div class="flex gap-2 items-center">
                  <TextField
                    value={store.heidi_engine_python}
                    onChange={(v) => setStore("heidi_engine_python", v)}
                    class="w-full sm:w-[320px] max-w-full"
                  />
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await save()
                        await docActions.refetch()
                        showToast({ title: "Checked", description: "Doctor refreshed with configured python" })
                      } catch (e: any) {
                        showToast({ title: "Check failed", description: String(e?.message ?? e) })
                      }
                    }}
                  >
                    Check
                  </Button>
                </div>
              </Row>

              <Row
                title="heidi_engine_path"
                desc="Path to heidi-engine tool dir"
                help="Directory where heidi-engine is installed (optional). Doctor will prefer .venv under this dir when resolving python."
              >
                <div class="flex gap-2 items-center">
                  <TextField
                    value={store.heidi_engine_path}
                    onChange={(v) => setStore("heidi_engine_path", v)}
                    class="w-full sm:w-[320px] max-w-full"
                  />
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await save()
                        await docActions.refetch()
                        showToast({ title: "Checked", description: "Doctor refreshed with configured tool path" })
                      } catch (e: any) {
                        showToast({ title: "Check failed", description: String(e?.message ?? e) })
                      }
                    }}
                  >
                    Check
                  </Button>
                </div>
              </Row>

              <Row title="Stack" desc="Execution stack" help="Execution backend used to run heidi-engine pump.">
                <Select
                  options={stacks() ?? []}
                  current={
                    stacks()?.find((s) => s.id === store.stack) ?? {
                      id: store.stack,
                      label: store.stack,
                      description: "",
                      available: true,
                    }
                  }
                  value={options().find((x) => x.id === store.stack)}
                  itemValue={(x) => x.id}
                  itemLabel={(x) => x.label ?? String(x.id)}
                  onChange={(x) => x && x.available && setStore("stack", x.id)}
                  variant="secondary"
                  size="small"
                />
              </Row>
            </div>
          </Show>

          <Show when={activeTab() === "Models"}>
            <div>
              <Row
                title="Teacher model"
                desc="Path-B teacher for collection"
                help="Model used to generate training samples. Faster/cheaper models collect quicker; stronger models can generate better samples."
              >
                <Select
                  options={teacherOptions()}
                  value={teacherOptions().find((x) => x.id === store.teacher_model)}
                  itemValue={(x) => x.id}
                  itemLabel={(x) => x.id}
                  onChange={(x) => x && setStore("teacher_model", x.id)}
                  class="w-full sm:w-[320px] max-w-full"
                  variant="secondary"
                  size="small"
                  triggerVariant="settings"
                />
              </Row>

              <Row title="Stack" desc="Execution stack" help="Execution backend used to run heidi-engine pump.">
                <Select
                  options={stacks() ?? []}
                  value={
                    stacks()?.find((s) => s.id === store.stack) ?? {
                      id: store.stack,
                      label: store.stack,
                      description: "",
                      available: true,
                    }
                  }
                  itemValue={(x: Stack) => x.id}
                  itemLabel={(x: Stack) => (x.available ? x.label : `${x.label} (${x.reason ?? "unavailable"})`)}
                  onChange={(x) => x && x.available && setStore("stack", x.id)}
                  variant="secondary"
                  size="small"
                />
              </Row>
            </div>
          </Show>

          <Show when={activeTab() === "Data"}>
            <div>
              <Row title="Max repos" desc="Sources to sample from" help="Maximum repositories to pull samples from.">
                <Num value={store.max_repos} onChange={(v) => setStore("max_repos", clampInt(v, 1, 1000))} />
              </Row>
              <Row title="Rounds" desc="Collection rounds" help="Number of collection rounds per repo.">
                <Num value={store.rounds} onChange={(v) => setStore("rounds", clampInt(v, 1, 1000))} />
              </Row>
              <Row title="Samples per run" desc="Samples per run" help="Samples to collect per run.">
                <Num
                  value={store.samples_per_run}
                  onChange={(v) => setStore("samples_per_run", clampInt(v, 1, 10000))}
                />
              </Row>
            </div>
          </Show>

          <Show when={activeTab() === "Training"}>
            <div>
              <Row title="Train steps" desc="QLoRA steps" help="Total QLoRA training steps.">
                <Num value={store.train_steps} onChange={(v) => setStore("train_steps", v)} />
              </Row>
              <Row title="Save steps" desc="Checkpoint frequency" help="How often to write checkpoints.">
                <Num value={store.save_steps} onChange={(v) => setStore("save_steps", v)} />
              </Row>
              <Row title="Eval steps" desc="Evaluation frequency" help="How often to run evaluation.">
                <Num value={store.eval_steps} onChange={(v) => setStore("eval_steps", v)} />
              </Row>
              <Row
                title="Seq len"
                desc="Max tokens"
                help="Maximum sequence length used for training. Higher uses more VRAM."
              >
                <Num value={store.seq_len} onChange={(v) => setStore("seq_len", v)} />
              </Row>
              <Row
                title="Batch"
                desc="Per-device batch"
                help="Per-device batch size for training. Higher uses more VRAM."
              >
                <Num value={store.batch_size} onChange={(v) => setStore("batch_size", v)} />
              </Row>
              <Row
                title="Grad accum"
                desc="Gradient accumulation"
                help="Accumulates gradients across steps to simulate larger batches."
              >
                <Num value={store.grad_accum} onChange={(v) => setStore("grad_accum", v)} />
              </Row>
              <Row
                title="LoRA r"
                desc="Adapter rank"
                help="LoRA rank (capacity). Higher can improve quality but uses more VRAM."
              >
                <Num value={store.lora_r} onChange={(v) => setStore("lora_r", v)} />
              </Row>
            </div>
          </Show>

          <Show when={activeTab() === "Budget"}>
            <div>
              <Row
                title="Teacher workers"
                desc="Parallel teacher requests"
                help="Number of concurrent requests during dataset generation. Network-bound; try 4–12. Too high can trigger rate limits."
              >
                <Num value={store.teacher_workers} onChange={(v) => setStore("teacher_workers", clampInt(v, 1, 12))} />
              </Row>

              <Row
                title="Teacher batch"
                desc="Samples per teacher request"
                help="Asks the teacher to return multiple samples in one JSON array. Can reduce overhead; if the teacher format gets flaky, set back to 1."
              >
                <Num
                  value={store.teacher_batch_size}
                  onChange={(v) => setStore("teacher_batch_size", clampInt(v, 1, 8))}
                />
              </Row>

              <Row
                title="Teacher max tokens"
                desc="Output cap per sample"
                help="Hard cap for the teacher output length. Lower is faster/cheaper; too low can truncate answers."
              >
                <Num
                  value={store.teacher_max_tokens}
                  onChange={(v) => setStore("teacher_max_tokens", clampInt(v, 64, 2048))}
                />
              </Row>

              <Row title="Max requests" desc="Upper bound on teacher requests" help="Maximum teacher requests to make.">
                <Num value={store.max_requests} onChange={(v) => setStore("max_requests", clampInt(v, 1, 1_000_000))} />
              </Row>
            </div>
          </Show>

          <Show when={activeTab() === "Artifacts"}>
            <div class="p-3 text-12-regular text-text-weak">
              Artifacts settings and locations are stored under OpenHei data/runs. (No editable fields yet)
            </div>
          </Show>

          <Show when={activeTab() === "Monitor"}>
            <div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border-weak-base last:border-none">
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="text-14-medium text-text-strong">
                    <span class="inline-flex items-center gap-2">
                      <span>Run</span>
                      <Help text="Starts/stops the QLoRA pump and streams logs + progress. Runs are saved under OpenHei data/runs." />
                    </span>
                  </span>
                  <span class="text-12-regular text-text-weak">Start/stop pump and stream logs</span>
                </div>
                <div class="flex items-center gap-2">
                  <Button size="small" variant="primary" onClick={start} disabled={store.running}>
                    <Icon name="arrow-right" />
                    Start
                  </Button>
                  <Button size="small" variant="secondary" onClick={stop} disabled={!store.running}>
                    <Icon name="stop" />
                    Stop
                  </Button>
                </div>
              </div>

              <Show when={store.run_id}>
                <div class="py-3 text-12-regular text-text-weak">
                  <div class="flex items-center gap-2">
                    <span>run_id: {store.run_id}</span>
                    <Show when={store.watchdog?.status === "stuck"}>
                      <span class="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-12-medium">STUCK</span>
                    </Show>
                  </div>
                  <div>stage: {store.stage || "(unknown)"}</div>
                  <Show when={store.watchdog?.status === "stuck"}>
                    <div class="text-red-400">Reason: {store.watchdog?.stuck_reason || "no output for 2+ minutes"}</div>
                  </Show>
                  <div class="flex items-center gap-2">
                    <span classList={{ "text-text-success": store.connected, "text-text-weak": !store.connected }}>
                      {store.connected ? "●" : "○"}
                    </span>
                    <span>
                      {store.connected
                        ? `connected (last: ${store.lastEventTime ? `${Math.round((Date.now() - store.lastEventTime) / 1000)}s ago` : "just now"})`
                        : "disconnected"}
                    </span>
                    <Show when={!store.connected && store.running}>
                      <button
                        class="text-12-regular text-text-link hover:underline"
                        onClick={() => store.run_id && connect(store.run_id)}
                      >
                        reconnect
                      </button>
                    </Show>
                  </div>
                  <Show when={store.progress}>
                    {(p) => (
                      <div>
                        <div class="flex items-center gap-2 mt-2">
                          <div class="flex-1 h-2 bg-surface-base rounded-full overflow-hidden border border-border-weak-base">
                            <div
                              class="h-full bg-text-success transition-all duration-300"
                              style={{ width: `${Math.min(100, p().pct)}%` }}
                            />
                          </div>
                          <span class="text-12-medium text-text-success min-w-[50px] text-right">{p().pct}%</span>
                        </div>
                        <div class="mt-1">
                          {p().done}/{p().total} | {p().rate.toFixed(2)} it/s | ETA {p().eta}s
                        </div>
                      </div>
                    )}
                  </Show>
                </div>
              </Show>

              <div class="pb-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <div class="text-12-regular text-text-weak">
                      <Show when={store.logs.length > 0}>{store.logs.length} lines</Show>
                    </div>
                    <Show when={!store.autoScroll}>
                      <span class="text-12-regular text-text-warning">• Paused</span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2">
                    <Show when={!store.autoScroll}>
                      <button
                        class="text-12-regular text-text-link hover:underline"
                        onClick={() => {
                          setStore("autoScroll", true)
                          const el = document.getElementById("qlora-logs-container")
                          if (el) el.scrollTop = el.scrollHeight
                        }}
                      >
                        ↓ Resume
                      </button>
                    </Show>
                    <Show when={store.autoScroll}>
                      <button
                        class="text-12-regular text-text-link hover:underline"
                        onClick={() => {
                          const el = document.getElementById("qlora-logs-container")
                          if (el) el.scrollTop = el.scrollHeight
                        }}
                      >
                        ↓ Jump to latest
                      </button>
                    </Show>
                  </div>
                </div>
                <div class="bg-surface-base rounded-lg border border-border-weak-base p-3">
                  <pre
                    id="qlora-logs-container"
                    class="text-11-regular text-text-base whitespace-pre-wrap break-words max-h-[360px] overflow-auto"
                    onScroll={(e) => {
                      const el = e.currentTarget
                      const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50
                      if (!atBottom && store.autoScroll) {
                        setStore("autoScroll", false)
                      }
                    }}
                  >
                    <For each={store.logs}>
                      {(line) => (
                        <span
                          style={{
                            color: /\b(ERROR|FATAL)\b/i.test(line)
                              ? "var(--text-error)"
                              : /\bWARN(ING)?\b/i.test(line)
                                ? "var(--text-warning)"
                                : line.includes("stderr") || line.includes("STDERR")
                                  ? "var(--text-success)"
                                  : "inherit",
                            "font-weight": /\b(ERROR|FATAL)\b/i.test(line) ? "500" : "normal",
                          }}
                        >
                          {line + "\n"}
                        </span>
                      )}
                    </For>
                  </pre>
                </div>
              </div>
            </div>
          </Show>

          <ProcessesTab isActive={activeTab() === "Processes"} />
        </div>
      </div>
    </div>
  )
}

type ProcessInfo = {
  pid: number
  ppid: number
  cmd: string
  cwd?: string
  user: string
  started_at: string
  tag: "qlora" | "child"
}

const ProcessesTab: Component<{ isActive: boolean }> = (props) => {
  const [processes, setProcesses] = createSignal<ProcessInfo[]>([])
  const [loading, setLoading] = createSignal(false)
  const [pidInput, setPidInput] = createSignal("")
  const [confirmModal, setConfirmModal] = createSignal<ProcessInfo | null>(null)
  const [killLoading, setKillLoading] = createSignal(false)
  const [killMessage, setKillMessage] = createSignal("")

  const fetchProcesses = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/v1/qlora/pids")
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setProcesses(data.processes ?? [])
    } catch (e: any) {
      showToast({ title: "Failed to fetch processes", description: String(e?.message ?? e) })
    } finally {
      setLoading(false)
    }
  }

  const eligiblePids = () => new Set(processes().map((p) => p.pid))

  const isPidEligible = (pid: number) => eligiblePids().has(pid)

  const openKillConfirm = () => {
    const pid = parseInt(pidInput(), 10)
    if (!Number.isFinite(pid)) {
      showToast({ title: "Invalid PID", description: "Please enter a valid numeric PID" })
      return
    }
    const proc = processes().find((p) => p.pid === pid)
    if (!proc) {
      showToast({ title: "PID not eligible", description: "This PID is not in the QLoRA process list" })
      return
    }
    setConfirmModal(proc)
    setKillMessage("")
  }

  const killProcess = async (signal?: "SIGTERM" | "SIGKILL") => {
    const proc = confirmModal()
    if (!proc) return
    setKillLoading(true)
    try {
      const res = await fetch("/api/v1/qlora/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid: proc.pid, signal }),
      })
      const data = await res.json()
      if (!res.ok) {
        setKillMessage(data.error || "Failed to kill process")
        showToast({ title: "Kill failed", description: data.error || "Unknown error" })
      } else {
        setKillMessage(data.message)
        showToast({ title: "Kill signal sent", description: data.message })
        if (data.message.includes("terminated")) {
          setTimeout(() => {
            setConfirmModal(null)
            void fetchProcesses()
          }, 500)
        }
      }
    } catch (e: any) {
      setKillMessage(String(e?.message ?? e))
      showToast({ title: "Kill failed", description: String(e?.message ?? e) })
    } finally {
      setKillLoading(false)
    }
  }

  const formatUptime = (startedAt: string) => {
    const start = new Date(startedAt).getTime()
    const diff = Date.now() - start
    if (diff < 0) return "just now"
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const pidColorClass = (tag: "qlora" | "child") => {
    if (tag === "qlora") return "text-text-success"
    return "text-text-warning"
  }

  // Fetch on mount and when tab becomes visible
  onMount(() => {
    void fetchProcesses()
  })

  createEffect(() => {
    if (props.isActive) void fetchProcesses()
  })

  return (
    <Show when={props.isActive}>
      <div>
        {/* Controls */}
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border-weak-base">
          <div class="flex flex-col gap-0.5 min-w-0">
            <span class="text-14-medium text-text-strong">QLoRA Processes</span>
            <span class="text-12-regular text-text-weak">Manage running QLoRA-related processes</span>
          </div>
          <div class="flex items-center gap-2">
            <Button size="small" variant="secondary" onClick={fetchProcesses} disabled={loading()}>
              Refresh
            </Button>
          </div>
        </div>

        {/* PID Input */}
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 py-3 border-b border-border-weak-base">
          <div class="flex items-center gap-2 flex-1">
            <TextField
              type="number"
              placeholder="Enter PID"
              value={pidInput()}
              onChange={setPidInput}
              class="w-full sm:w-[150px]"
            />
            <Button
              size="small"
              variant="secondary"
              onClick={openKillConfirm}
              disabled={!pidInput() || !isPidEligible(parseInt(pidInput(), 10))}
            >
              <Icon name="trash" />
              Kill
            </Button>
          </div>
        </div>

        {/* Process Table */}
        <div class="py-3">
          <Show when={!loading()} fallback={<div class="text-14-regular text-text-weak">Loading...</div>}>
            <Show
              when={processes().length > 0}
              fallback={<div class="text-14-regular text-text-weak">No QLoRA processes found</div>}
            >
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="border-b border-border-weak-base">
                      <th class="py-2 px-2 text-12-medium text-text-weak">PID</th>
                      <th class="py-2 px-2 text-12-medium text-text-weak">Role</th>
                      <th class="py-2 px-2 text-12-medium text-text-weak">Command</th>
                      <th class="py-2 px-2 text-12-medium text-text-weak">Uptime</th>
                      <th class="py-2 px-2 text-12-medium text-text-weak">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={processes()}>
                      {(proc) => (
                        <tr class="border-b border-border-weak-base/50 hover:bg-surface-raised-base/50">
                          <td class={`py-2 px-2 text-14-medium ${pidColorClass(proc.tag)}`}>{proc.pid}</td>
                          <td class="py-2 px-2 text-14-regular text-text-base capitalize">{proc.tag}</td>
                          <td class="py-2 px-2 text-14-regular text-text-base max-w-[300px]">
                            <div class="truncate" title={proc.cmd}>
                              {proc.cmd}
                            </div>
                          </td>
                          <td class="py-2 px-2 text-14-regular text-text-weak">{formatUptime(proc.started_at)}</td>
                          <td class="py-2 px-2">
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => {
                                setPidInput(String(proc.pid))
                                openKillConfirm()
                              }}
                            >
                              <Icon name="trash" />
                            </Button>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </div>

        {/* Confirmation Modal */}
        <Show when={confirmModal()}>
          {(proc) => (
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div class="bg-surface-raised-base rounded-lg border border-border-weak-base p-6 max-w-md w-full shadow-lg">
                <h3 class="text-16-medium text-text-strong mb-4">Confirm Process Termination</h3>

                <div class="space-y-2 mb-4">
                  <div class="flex justify-between">
                    <span class="text-12-regular text-text-weak">PID:</span>
                    <span class="text-14-medium text-text-error">{proc().pid}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-12-regular text-text-weak">PPID:</span>
                    <span class="text-14-regular text-text-base">{proc().ppid}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-12-regular text-text-weak">Command:</span>
                    <span class="text-14-regular text-text-base truncate max-w-[200px]" title={proc().cmd}>
                      {proc().cmd}
                    </span>
                  </div>
                  <Show when={proc().cwd}>
                    <div class="flex justify-between">
                      <span class="text-12-regular text-text-weak">CWD:</span>
                      <span class="text-14-regular text-text-base truncate max-w-[200px]" title={proc().cwd}>
                        {proc().cwd}
                      </span>
                    </div>
                  </Show>
                  <div class="flex justify-between">
                    <span class="text-12-regular text-text-weak">User:</span>
                    <span class="text-14-regular text-text-base">{proc().user}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-12-regular text-text-weak">Uptime:</span>
                    <span class="text-14-regular text-text-base">{formatUptime(proc().started_at)}</span>
                  </div>
                </div>

                <Show when={killMessage()}>
                  <div class="bg-surface-base rounded p-3 mb-4 text-12-regular text-text-base">{killMessage()}</div>
                </Show>

                <div class="flex flex-col sm:flex-row gap-2 justify-end">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      setConfirmModal(null)
                      setKillMessage("")
                    }}
                    disabled={killLoading()}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => killProcess("SIGTERM")}
                    disabled={killLoading()}
                  >
                    SIGTERM
                  </Button>
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => killProcess("SIGKILL")}
                    disabled={killLoading()}
                  >
                    SIGKILL
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </Show>
  )
}

const clampInt = (value: number, min: number, max: number) => {
  const v = Number.isFinite(value) ? Math.trunc(value) : min
  return Math.max(min, Math.min(max, v))
}

const Row: Component<any> = (props) => (
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border-weak-base last:border-none">
    <div class="flex flex-col gap-0.5 min-w-0">
      <span class="text-14-medium text-text-strong">
        <span class="inline-flex items-center gap-2">
          <span>{props.title}</span>
          <Show when={props.help}>{(text) => <Help text={text()} />}</Show>
        </span>
      </span>
      <span class="text-12-regular text-text-weak">{props.desc}</span>
    </div>
    <div class="flex-shrink-0 w-full sm:w-auto">{props.children}</div>
  </div>
)

const Help: Component<{ text: string }> = (props) => (
  <Popover
    triggerAs="button"
    triggerProps={{
      type: "button",
      class:
        "text-12-regular text-text-weak hover:text-text-base transition-colors rounded px-1 py-0.5 border border-border-weak-base bg-surface-base",
      "aria-label": "Help",
    }}
    trigger={<span>(!)</span>}
    class="max-w-[280px] bg-background-base border border-border-weak-base rounded-lg shadow-[var(--shadow-lg-border-base)]"
    placement="top"
  >
    <div class="text-12-regular text-text-base p-3">{props.text}</div>
  </Popover>
)

const Num: Component<{ value: number; onChange: (v: number) => void }> = (props) => (
  <TextField
    type="number"
    value={String(props.value)}
    onChange={(v) => props.onChange(Number(v))}
    class="w-full sm:w-[120px]"
  />
)
