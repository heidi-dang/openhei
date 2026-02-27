import { createResource, Show } from "solid-js"
import { usePlatform } from "@/context/platform"

type DebugInfo = {
  buildId: string
  gitSha: string | null
  buildTime: string | null
  version: string
  channel: string
}

export function DebugFooter() {
  const platform = usePlatform()
  const fetcher = platform.fetch ?? globalThis.fetch

  const [debug] = createResource(async () => {
    try {
      const defaultUrl = "http://localhost:4096"
      const res = await fetcher(`${defaultUrl}/global/debug`)
      if (res.ok) {
        return (await res.json()) as DebugInfo
      }
    } catch {
      // Debug endpoint not available
    }
    return null
  })

  return (
    <Show when={debug()}>
      <div class="fixed bottom-1 right-1 text-10-regular text-text-weak opacity-50 z-50 pointer-events-none">
        <span class="font-mono">{debug()?.gitSha?.slice(0, 8) || debug()?.buildId || "?"}</span>
      </div>
    </Show>
  )
}
