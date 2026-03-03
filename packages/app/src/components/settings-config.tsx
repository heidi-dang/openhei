import { Component, createSignal, createResource, Show } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { showToast } from "@openhei-ai/ui/toast"
import { useLanguage } from "@/context/language"

interface ConfigFile {
  path: string
  text: string
  mtime: number
  exists: boolean
}

const fetchConfig = async (): Promise<ConfigFile> => {
  const res = await fetch("/global/config-file")
  if (!res.ok) {
    throw new Error((await res.json()).error || "Failed to load config")
  }
  return res.json()
}

export const SettingsConfig: Component = () => {
  const language = useLanguage()

  const [config, { refetch }] = createResource(fetchConfig)
  const [editedText, setEditedText] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [conflict, setConflict] = createSignal(false)

  const isDirty = () => {
    const c = config()
    return c && editedText() !== c.text
  }

  const handleLoad = () => {
    refetch()
    setEditedText(config()?.text || "")
    setConflict(false)
    setError(null)
  }

  const handleSave = async () => {
    const c = config()
    if (!c) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/global/config-file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editedText(),
          expectedMtime: conflict() ? undefined : c.mtime,
        }),
      })

      const data = await res.json()

      if (res.status === 409) {
        setConflict(true)
        setError(`File was modified elsewhere. Current mtime: ${data.currentMtime}`)
        showToast({
          variant: "error",
          title: "Conflict",
          description: "File was modified elsewhere. Reload to see changes or force save.",
        })
        return
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to save")
      }

      await refetch()
      setConflict(false)
      showToast({
        variant: "success",
        title: "Saved",
        description: "Config file updated successfully",
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      showToast({
        variant: "error",
        title: "Save failed",
        description: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <Show when={config.loading}>
        <div class="p-4">Loading...</div>
      </Show>

      <Show when={config()}>
        <div class="flex flex-col h-full">
          <div class="px-4 py-3 border-b border-border-weak-base">
            <div class="flex items-center justify-between">
              <div class="flex flex-col gap-1 min-w-0">
                <span class="text-14-medium text-text-strong">openhei.conf</span>
                <span class="text-11-regular text-text-weak truncate" title={config()!.path}>
                  {config()!.path}
                </span>
              </div>
              <Button size="small" variant="ghost" onClick={handleLoad} disabled={saving()}>
                Reload
              </Button>
            </div>
          </div>

          <div class="flex-1 overflow-hidden px-4 py-2">
            <textarea
              class="w-full h-full resize-none bg-surface-raised-base border border-border-weak-base rounded p-3 text-12-regular font-mono"
              style={{ "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              value={editedText() || config()!.text}
              onInput={(e) => {
                setEditedText(e.currentTarget.value)
                setConflict(false)
                setError(null)
              }}
              onFocus={() => {
                if (!editedText()) {
                  setEditedText(config()!.text)
                }
              }}
              placeholder="Loading..."
            />
          </div>

          <Show when={error()}>
            <div class="px-4 py-2 bg-surface-raised-base border-t border-border-weak-base">
              <span class="text-12-regular text-red-500">{error()}</span>
            </div>
          </Show>

          <div class="sticky bottom-0 px-4 py-3 border-t border-border-weak-base bg-surface-raised-base">
            <div class="flex items-center justify-between">
              <Show when={conflict()}>
                <span class="text-12-regular text-yellow-500">Conflict detected</span>
              </Show>
              <Show when={!conflict() && !error()}>
                <span class="text-12-regular text-text-weak">{isDirty() ? "Unsaved changes" : "No changes"}</span>
              </Show>
              <Button size="small" variant="secondary" onClick={handleSave} disabled={saving() || !isDirty()}>
                {saving() ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={config.error}>
        <div class="p-4 text-red-500">Failed to load config: {config.error?.message}</div>
      </Show>
    </div>
  )
}
