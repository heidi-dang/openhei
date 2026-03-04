import { Component, createSignal, createEffect, For, Show, createMemo } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { Switch } from "@openhei-ai/ui/switch"
import { Select } from "@openhei-ai/ui/select"
import { showToast } from "@openhei-ai/ui/toast"
import { Icon } from "@openhei-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"

interface SwarmConfig {
  enabled: boolean
  max_subagents: number
  max_parallel_executors: number
  subagent_models: string[]
}

const fetchSwarmConfig = async (): Promise<SwarmConfig | null> => {
  const res = await fetch("/config")
  if (!res.ok) return null
  const config = await res.json()
  return config.swarm || null
}

const saveSwarmConfig = async (swarm: SwarmConfig): Promise<boolean> => {
  const res = await fetch("/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ swarm }),
  })
  return res.ok
}

export const SettingsSwarm: Component = () => {
  const language = useLanguage()
  const models = useModels()

  const [enabled, setEnabled] = createSignal(false)
  const [subagent1Model, setSubagent1Model] = createSignal<string>("")
  const [subagent2Model, setSubagent2Model] = createSignal<string>("")
  const [saving, setSaving] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [configLoaded, setConfigLoaded] = createSignal(false)

  // Memoized model options to prevent unnecessary recalculations
  const modelOptions = createMemo(() => {
    const list = models.list()
    if (!list || list.length === 0) return []
    return list.map((m) => ({
      value: `${m.provider.id}/${m.id}`,
      label: `${m.provider.name}/${m.name}`,
    }))
  })

  // Check if models are available
  const hasModels = createMemo(() => modelOptions().length > 0)

  // Load config effect
  createEffect(() => {
    const loadConfig = async () => {
      const config = await fetchSwarmConfig()
      if (config) {
        setEnabled(config.enabled)
        if (config.subagent_models && config.subagent_models.length > 0) {
          setSubagent1Model(config.subagent_models[0] || "")
        }
        if (config.subagent_models && config.subagent_models.length > 1) {
          setSubagent2Model(config.subagent_models[1] || "")
        }
      }
      setConfigLoaded(true)
      setLoading(false)
    }
    void loadConfig()
  })

  const handleSave = async () => {
    setSaving(true)
    const swarm: SwarmConfig = {
      enabled: enabled(),
      max_subagents: 2,
      max_parallel_executors: 3,
      subagent_models: [subagent1Model(), subagent2Model()].filter(Boolean),
    }
    const success = await saveSwarmConfig(swarm)
    setSaving(false)

    if (success) {
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.swarm.toast.saved"),
      })
    } else {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("settings.swarm.toast.error"),
      })
    }
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="flex flex-col gap-4 pt-6 pb-6 max-w-[720px]">
        <h2 class="text-16-medium text-text-strong">{language.t("settings.swarm.title")}</h2>
        <p class="text-14-regular text-text-weak">{language.t("settings.swarm.description")}</p>

        <Show when={!loading()} fallback={<div>{language.t("common.loading")}</div>}>
          <div class="flex flex-col gap-6 mt-4">
            <div class="flex items-center justify-between">
              <div class="flex flex-col gap-1">
                <span class="text-14-medium text-text-strong">{language.t("settings.swarm.enabled")}</span>
                <span class="text-12-regular text-text-weak">{language.t("settings.swarm.enabled.description")}</span>
              </div>
              <Switch checked={enabled()} onChange={setEnabled} />
            </div>

            <Show when={enabled()}>
              <div class="flex flex-col gap-4 border-t border-border-default pt-4">
                <div class="flex flex-col gap-2">
                  <span class="text-14-medium text-text-strong">{language.t("settings.swarm.subagent1")}</span>
                  <span class="text-12-regular text-text-weak">
                    {language.t("settings.swarm.subagent1.description")}
                  </span>
                  <Show
                    when={hasModels()}
                    fallback={
                      <div class="text-14-regular text-text-weak py-2">
                        {language.t("common.loading")}
                      </div>
                    }
                  >
                    <Select
                      value={modelOptions().find((o) => o.value === subagent1Model())}
                      onChange={(v) => setSubagent1Model((v as any)?.value || "")}
                      options={modelOptions()}
                      itemValue={(o) => o.value}
                      itemLabel={(o) => o.label}
                      placeholder={language.t("settings.swarm.select.model")}
                      disabled={!hasModels()}
                    />
                  </Show>
                </div>

                <div class="flex flex-col gap-2">
                  <span class="text-14-medium text-text-strong">{language.t("settings.swarm.subagent2")}</span>
                  <span class="text-12-regular text-text-weak">
                    {language.t("settings.swarm.subagent2.description")}
                  </span>
                  <Show
                    when={hasModels()}
                    fallback={
                      <div class="text-14-regular text-text-weak py-2">
                        {language.t("common.loading")}
                      </div>
                    }
                  >
                    <Select
                      value={modelOptions().find((o) => o.value === subagent2Model())}
                      onChange={(v) => setSubagent2Model((v as any)?.value || "")}
                      options={modelOptions()}
                      itemValue={(o) => o.value}
                      itemLabel={(o) => o.label}
                      placeholder={language.t("settings.swarm.select.model")}
                      disabled={!hasModels()}
                    />
                  </Show>
                </div>

                <div class="flex items-center gap-2 p-3 rounded-lg bg-surface-base">
                  <Icon name="help" class="text-icon-weak-base flex-shrink-0" />
                  <div class="flex flex-col gap-0.5">
                    <span class="text-12-medium text-text-strong">{language.t("settings.swarm.limits")}</span>
                    <span class="text-11-regular text-text-weak">
                      {language.t("settings.swarm.limits.description", {
                        maxSubagents: 2,
                        maxExecutors: 3,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </Show>

            <Button onClick={handleSave} disabled={saving()} class="w-fit">
              <Show when={saving()} fallback={language.t("common.save")}>
                {language.t("common.saving")}
              </Show>
            </Button>
          </div>
        </Show>
      </div>
    </div>
  )
}
