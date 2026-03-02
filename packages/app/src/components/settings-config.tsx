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

interface TranslateResult {
  proposedText: string
  warnings?: string[]
}

const fetchConfig = async (): Promise<ConfigFile> => {
  const res = await fetch("/global/config-file")
  if (!res.ok) {
    throw new Error((await res.json()).error || "Failed to load config")
  }
  return res.json()
}

const translateConfig = async (currentText: string, requestText: string): Promise<TranslateResult> => {
  const res = await fetch("/global/config-translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentText, requestText }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || "Failed to translate")
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
  const [showTranslate, setShowTranslate] = createSignal(false)
  const [translateInput, setTranslateInput] = createSignal("")
  const [translateLoading, setTranslateLoading] = createSignal(false)
  const [proposedText, setProposedText] = createSignal<string | null>(null)

  const isDirty = () => {
    const c = config()
    return c && editedText() !== c.text
  }

  const handleLoad = () => {
    refetch()
    setEditedText(config()?.text || "")
    setConflict(false)
    setError(null)
    setProposedText(null)
  }

  const handleFixJson = () => {
    const text = editedText() || config()?.text || ""
    try {
      const parsed = JSON.parse(text)
      const fixed = JSON.stringify(parsed, null, 2)
      setEditedText(fixed)
      setError(null)
      showToast({
        variant: "success",
        title: "JSON Fixed",
        description: "Valid JSON formatted",
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid JSON"
      setError(`JSON parse error: ${msg}`)
      showToast({
        variant: "error",
        title: "JSON Error",
        description: msg,
      })
    }
  }

  const handleTranslate = async () => {
    const current = editedText() || config()?.text || ""
    if (!translateInput().trim()) {
      showToast({
        variant: "error",
        title: "Empty request",
        description: "Describe the change you want",
      })
      return
    }

    setTranslateLoading(true)
    try {
      const result = await translateConfig(current, translateInput())
      setProposedText(result.proposedText)
      if (result.warnings?.length) {
        showToast({
          variant: "default",
          title: "Warning",
          description: result.warnings.join(", "),
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({
        variant: "error",
        title: "Translation failed",
        description: msg,
      })
    } finally {
      setTranslateLoading(false)
    }
  }

  const handleApplyProposal = () => {
    const proposed = proposedText()
    if (proposed) {
      setEditedText(proposed)
      setProposedText(null)
      setShowTranslate(false)
      showToast({
        variant: "success",
        title: "Applied",
        description: "Review changes and Save to persist",
      })
    }
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
                setProposedText(null)
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
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <Button size="small" variant="ghost" onClick={handleFixJson}>
                  Fix JSON
                </Button>
                <Button size="small" variant="ghost" onClick={() => setShowTranslate(true)}>
                  Human → JSON
                </Button>
              </div>
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
        </div>
      </Show>

      <Show when={showTranslate()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="bg-surface-raised-base rounded-lg p-4 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between mb-4">
              <span class="text-16-medium text-text-strong">Human → JSON</span>
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  setShowTranslate(false)
                  setProposedText(null)
                  setTranslateInput("")
                }}
              >
                Close
              </Button>
            </div>

            <Show when={!proposedText()}>
              <div class="flex-1 flex flex-col gap-3">
                <p class="text-12-regular text-text-weak">
                  Describe the change you want in plain language (e.g., "add GPT-4o as default model", "enable dark
                  mode")
                </p>
                <textarea
                  class="w-full h-24 resize-none bg-surface-base border border-border-weak-base rounded p-3 text-12-regular"
                  placeholder="Add a new model provider..."
                  value={translateInput()}
                  onInput={(e) => setTranslateInput(e.currentTarget.value)}
                />
                <Button
                  variant="secondary"
                  onClick={handleTranslate}
                  disabled={translateLoading() || !translateInput().trim()}
                >
                  {translateLoading() ? "Generating..." : "Generate"}
                </Button>
              </div>
            </Show>

            <Show when={proposedText()}>
              <div class="flex-1 flex flex-col gap-3">
                <p class="text-12-regular text-text-weak">Preview changes:</p>
                <textarea
                  class="w-full h-40 resize-none bg-surface-base border border-border-weak-base rounded p-3 text-12-regular font-mono"
                  style={{ "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                  value={proposedText()!}
                  readonly
                />
                <div class="flex gap-2">
                  <Button variant="ghost" onClick={() => setProposedText(null)} class="flex-1">
                    Cancel
                  </Button>
                  <Button variant="secondary" onClick={handleApplyProposal} class="flex-1">
                    Apply to Editor
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={config.error}>
        <div class="p-4 text-red-500">Failed to load config: {config.error?.message}</div>
      </Show>
    </div>
  )
}
