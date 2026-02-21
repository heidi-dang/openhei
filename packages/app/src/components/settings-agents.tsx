import { Component, For } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"
import { Button } from "@openhei-ai/ui/button"
import { useDialog } from "@openhei-ai/ui/context/dialog"
import { DialogEditAgent } from "./dialog-edit-agent"
import { Icon } from "@openhei-ai/ui/icon"

export const SettingsAgents: Component = () => {
  const language = useLanguage()
  const globalSync = useGlobalSync()
  const dialog = useDialog()

  const agents = () => Object.entries(globalSync.data.config?.agent || {})

  return (
    <div class="flex flex-col h-full overflow-y-auto">
      <div class="flex flex-col gap-6 p-6 max-w-[800px]">
        <div class="flex justify-between items-center">
          <div class="flex flex-col gap-1">
            <h2 class="text-16-medium text-text-strong">{language.t("settings.agents.title")}</h2>
            <p class="text-14-regular text-text-weak">{language.t("settings.agents.description")}</p>
          </div>
          <Button
            variant="primary"
            onClick={() => dialog.show(() => <DialogEditAgent />)}
          >
            <Icon name="plus" size="small" class="mr-2" />
            Add Agent
          </Button>
        </div>

        <div class="flex flex-col gap-3">
          <For each={agents()}>
            {([name, agent]) => (
              <div class="flex items-center justify-between p-4 rounded-lg bg-surface-raised-base border border-border-base">
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <span class="text-14-medium text-text-strong">@{name}</span>
                    <span class="text-12-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                      {agent?.mode || "primary"}
                    </span>
                  </div>
                  <p class="text-13-regular text-text-weak line-clamp-2">
                    {agent?.description || "No description"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => dialog.show(() => <DialogEditAgent name={name} agent={agent} />)}
                >
                  {language.t("common.edit")}
                </Button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
