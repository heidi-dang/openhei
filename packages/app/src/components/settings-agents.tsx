import { Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"
import { Button } from "@openhei-ai/ui/button"
import { useDialog } from "@openhei-ai/ui/context/dialog"
import { DialogEditAgent } from "./dialog-edit-agent"
import { Icon } from "@openhei-ai/ui/icon"
import { IconButton } from "@openhei-ai/ui/icon-button"

const MODE_COLORS: Record<string, string> = {
  primary: "bg-[hsl(210,60%,40%)]",
  subagent: "bg-[hsl(280,50%,45%)]",
  all: "bg-[hsl(160,50%,38%)]",
}

export const SettingsAgents: Component = () => {
  const language = useLanguage()
  const globalSync = useGlobalSync()
  const dialog = useDialog()

  const agents = createMemo(() => {
    const entries = Object.entries(globalSync.data.config?.agent || {})
    return entries.sort(([a], [b]) => a.localeCompare(b))
  })

  async function handleDelete(name: string) {
    const config = JSON.parse(JSON.stringify(globalSync.data.config || {}))
    config.agent = config.agent || {}
    delete config.agent[name]
    await globalSync.updateConfig(config)
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-4 pt-6 pb-6 max-w-[720px]">
          <div class="flex justify-between items-center">
            <div class="flex flex-col gap-1">
              <h2 class="text-16-medium text-text-strong">{language.t("settings.agents.title")}</h2>
              <p class="text-13-regular text-text-weak">{language.t("settings.agents.description")}</p>
            </div>
            <Button
              variant="primary"
              size="small"
              onClick={() => dialog.show(() => <DialogEditAgent />)}
            >
              <Icon name="plus" size="small" class="mr-1.5" />
              {language.t("settings.agents.add")}
            </Button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3 max-w-[720px]">
        <Show
          when={agents().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <div class="size-12 rounded-xl bg-surface-base flex items-center justify-center mb-4">
                <Icon name="brain" class="text-icon-weak-base" />
              </div>
              <span class="text-14-medium text-text-weak">{language.t("settings.agents.empty")}</span>
              <span class="text-13-regular text-text-subtle mt-1 max-w-[300px]">{language.t("settings.agents.empty.description")}</span>
            </div>
          }
        >
          <For each={agents()}>
            {([name, agent]) => {
              const mode = () => (agent as any)?.mode || "primary"
              const color = () => (agent as any)?.color
              const description = () => (agent as any)?.description
              const disabled = () => (agent as any)?.disable

              return (
                <div
                  class="group flex items-center justify-between px-4 py-3.5 rounded-lg bg-surface-raised-base border border-border-base transition-colors hover:border-border-strong-base"
                  classList={{ "opacity-50": disabled() }}
                >
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      class="size-8 shrink-0 rounded-lg flex items-center justify-center text-white text-13-medium"
                      style={{
                        "background-color": color() || "hsl(210, 60%, 40%)",
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-14-medium text-text-strong">@{name}</span>
                        <span
                          class="text-11-medium text-white/80 px-1.5 py-0.5 rounded"
                          classList={{
                            [MODE_COLORS[mode()] || MODE_COLORS.primary]: true,
                          }}
                        >
                          {mode()}
                        </span>
                        <Show when={disabled()}>
                          <span class="text-11-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                            {language.t("settings.agents.field.disable")}
                          </span>
                        </Show>
                      </div>
                      <Show when={description()}>
                        <p class="text-12-regular text-text-weak truncate">{description()}</p>
                      </Show>
                    </div>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconButton
                      icon="edit"
                      variant="ghost"
                      size="small"
                      onClick={() => dialog.show(() => <DialogEditAgent name={name} agent={agent} />)}
                    />
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        if (confirm(language.t("settings.agents.delete.confirm", { name }))) {
                          handleDelete(name)
                        }
                      }}
                    />
                  </div>
                </div>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}
