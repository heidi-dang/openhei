import { Button } from "@openhei-ai/ui/button"
import { Icon } from "@openhei-ai/ui/icon"
import { Progress } from "@openhei-ai/ui/progress"
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"

const CHANGELOG_URL = "https://openhei.ai/changelog.json"

type Status = {
  state: "idle" | "running" | "complete" | "failed"
  progress: number
  message?: string
  target?: string
  error?: string
}

type Highlight = {
  title: string
  description: string
  media?: {
    type: "image" | "video"
    src: string
    alt?: string
  }
}

type ParsedRelease = {
  tag?: string
  highlights: Highlight[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const text = value.trim()
    return text.length > 0 ? text : undefined
  }
  if (typeof value === "number") return String(value)
  return
}

function normalizeVersion(value: string | undefined) {
  const text = value?.trim()
  if (!text) return
  return text.startsWith("v") || text.startsWith("V") ? text.slice(1) : text
}

function parseMedia(value: unknown, alt: string): Highlight["media"] | undefined {
  if (!isRecord(value)) return
  const type = getText(value.type)?.toLowerCase()
  const src = getText(value.src) ?? getText(value.url)
  if (!src) return
  if (type !== "image" && type !== "video") return
  return { type, src, alt }
}

function parseHighlight(value: unknown): Highlight | undefined {
  if (!isRecord(value)) return
  const title = getText(value.title)
  if (!title) return
  const description = getText(value.description) ?? getText(value.shortDescription)
  if (!description) return
  const media = parseMedia(value.media, title)
  return { title, description, media }
}

function parseRelease(value: unknown): ParsedRelease | undefined {
  if (!isRecord(value)) return
  const tag = getText(value.tag) ?? getText(value.tag_name) ?? getText(value.name)

  if (!Array.isArray(value.highlights)) {
    return { tag, highlights: [] }
  }

  const highlights = value.highlights.flatMap((group) => {
    if (!isRecord(group)) return []
    const source = getText(group.source)?.toLowerCase() ?? ""
    if (source && !(source.includes("web") || source.includes("server") || source.includes("desktop"))) return []

    if (Array.isArray(group.items)) {
      return group.items.map((item) => parseHighlight(item)).filter((item): item is Highlight => item !== undefined)
    }

    const item = parseHighlight(group)
    if (!item) return []
    return [item]
  })

  return { tag, highlights }
}

function parseChangelog(value: unknown): ParsedRelease[] {
  if (Array.isArray(value)) {
    return value.map(parseRelease).filter((release): release is ParsedRelease => release !== undefined)
  }
  if (!isRecord(value)) return []
  if (!Array.isArray(value.releases)) return []
  return value.releases.map(parseRelease).filter((release): release is ParsedRelease => release !== undefined)
}

function sliceHighlights(input: { releases: ParsedRelease[]; current?: string; target?: string }) {
  const current = normalizeVersion(input.current)
  const target = normalizeVersion(input.target)
  const releases = input.releases

  const start = (() => {
    if (!target) return 0
    const index = releases.findIndex((release) => normalizeVersion(release.tag) === target)
    return index === -1 ? 0 : index
  })()

  const end = (() => {
    if (!current) return releases.length
    const index = releases.findIndex((release, i) => i >= start && normalizeVersion(release.tag) === current)
    return index === -1 ? releases.length : index
  })()

  const highlights = releases.slice(start, end).flatMap((release) => release.highlights)
  const seen = new Set<string>()
  return highlights
    .filter((h) => {
      const key = [h.title, h.description, h.media?.type ?? "", h.media?.src ?? ""].join("\n")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

export default function UpdatingPage() {
  const platform = usePlatform()
  const server = useServer()
  const navigate = useNavigate()
  const location = useLocation()
  const language = useLanguage()
  const [params] = useSearchParams()

  const fetcher = () => platform.fetch ?? fetch
  const base = createMemo(() => server.current?.http.url ?? window.location.origin)
  const ret = createMemo(() => {
    const value = params.return
    if (typeof value !== "string" || !value) return "/"
    if (!value.startsWith("/")) return "/"
    return value
  })
  const target = createMemo(() => (typeof params.target === "string" ? params.target : undefined))

  const [status, setStatus] = createSignal<Status>({ state: "idle", progress: 0 })
  const [offline, setOffline] = createSignal(false)
  const [empty, setEmpty] = createSignal(false)

  const [highlights] = createResource(
    () => ({ target: target() }),
    async (input) => {
      const res = await fetcher()(CHANGELOG_URL, { headers: { Accept: "application/json" } }).catch(() => undefined)
      if (!res?.ok) return []
      const json = (await res.json().catch(() => undefined)) as unknown
      if (!json) return []

      const check = await fetcher()(`${base()}/global/update/check`, { headers: { Accept: "application/json" } }).catch(
        () => undefined,
      )
      const info = check?.ok
        ? ((await check.json().catch(() => undefined)) as { version?: string; latest?: string })
        : undefined

      return sliceHighlights({
        releases: parseChangelog(json),
        current: info?.version,
        target: input.target ?? info?.latest,
      })
    },
    { initialValue: [] as Highlight[] },
  )

  const refresh = async () => {
    const res = await fetcher()(`${base()}/global/update/status`, { headers: { Accept: "application/json" } }).catch(
      () => undefined,
    )
    if (!res?.ok) {
      setOffline(true)
      return
    }
    const json = (await res.json().catch(() => undefined)) as Status | undefined
    if (!json) return
    setOffline(false)
    setStatus(json)

    if (json.state === "idle") {
      const check = await fetcher()(`${base()}/global/update/check`, { headers: { Accept: "application/json" } }).catch(
        () => undefined,
      )
      const info = check?.ok
        ? ((await check.json().catch(() => undefined)) as { version?: string; latest?: string })
        : undefined
      if (info?.version && info.latest && info.version === info.latest) {
        setEmpty(true)
      }
    }
  }

  const start = async () => {
    if (!platform.update) return
    await platform.update().catch(() => undefined)
  }

  const goBack = () => {
    navigate(ret(), { replace: true })
  }

  onMount(() => {
    void start()
    void refresh()

    const timer = setInterval(() => {
      void refresh()
    }, 500)

    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    onCleanup(() => {
      clearInterval(timer)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    })
  })

  const done = createMemo(() => status().state === "complete")
  const failed = createMemo(() => status().state === "failed")
  const none = createMemo(() => empty() && status().state === "idle")

  onMount(() => {
    const timer = setInterval(() => {
      if (!done() && !none()) return
      clearInterval(timer)
      void navigator.serviceWorker
        ?.getRegistration?.()
        .then((r) => r?.update?.())
        .catch(() => undefined)
      const next = ret()
      window.location.assign(next)
    }, 250)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <div class="fixed inset-0 z-[100] bg-background-base">
      <div class="max-w-[920px] mx-auto h-full px-4 sm:px-8 py-10 flex flex-col gap-10">
        <div class="flex items-start justify-between gap-6">
          <div class="flex flex-col gap-2 min-w-0">
            <div class="text-16-medium text-text-strong">Updating OpenHei</div>
            <div class="text-12-regular text-text-weak">
              <Show when={target()} fallback={<span>{location.pathname}</span>}>
                {(v) => <span>Target version: {v()}</span>}
              </Show>
            </div>
          </div>

          <Button variant="ghost" size="small" onClick={goBack}>
            Back
          </Button>
        </div>

        <div class="flex flex-col gap-4">
          <Progress
            minValue={0}
            maxValue={100}
            value={Math.max(0, Math.min(100, status().progress ?? 0))}
            showValueLabel
          >
            <span class="text-12-regular text-text-base">{status().message ?? "Working…"}</span>
          </Progress>

          <Show when={offline()}>
            <div class="text-12-regular text-text-weak flex items-center gap-2">
              <Icon name="warning" class="size-4" />
              <span>Waiting for server…</span>
            </div>
          </Show>

          <Show when={failed()}>
            <div class="text-12-regular text-text-weak">
              <div class="text-text-strong">Update failed</div>
              <div class="mt-1">{status().error ?? language.t("common.requestFailed")}</div>
            </div>
          </Show>

          <Show when={none()}>
            <div class="text-12-regular text-text-weak">No update available.</div>
          </Show>

          <Show when={done()}>
            <div class="text-12-regular text-text-weak">Reloading…</div>
          </Show>
        </div>

        <Show when={highlights().length > 0}>
          <div class="flex flex-col gap-4">
            <div class="text-14-medium text-text-strong">What’s new</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <For each={highlights()}>
                {(h) => (
                  <div class="rounded-lg border border-border-weak-base bg-surface-raised-base p-4 flex flex-col gap-2">
                    <div class="text-14-medium text-text-strong">{h.title}</div>
                    <div class="text-12-regular text-text-weak">{h.description}</div>
                    <Show when={h.media}>
                      {(m) => (
                        <div class="mt-2 rounded-md overflow-hidden border border-border-weak-base bg-background-strong">
                          <Show
                            when={m().type === "image"}
                            fallback={
                              <video src={m().src} autoplay loop muted playsinline class="w-full h-36 object-cover" />
                            }
                          >
                            <img src={m().src} alt={m().alt ?? h.title} class="w-full h-36 object-cover" />
                          </Show>
                        </div>
                      )}
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
