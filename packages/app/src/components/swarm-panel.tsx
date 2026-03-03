import { Component, Show, For, createSignal, createEffect } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { Icon } from "@openhei-ai/ui/icon"
import { useLanguage } from "@/context/language"

export interface SwarmSlotInfo {
  slot: 1 | 2
  status: "idle" | "working" | "done" | "error"
  agent_name?: string
  model?: string
}

interface SwarmPanelProps {
  active: boolean
  slots: SwarmSlotInfo[]
  onSelectSlot: (slot: "main" | 1 | 2) => void
  selectedSlot: "main" | 1 | 2
}

export const SwarmPanel: Component<SwarmPanelProps> = (props) => {
  const language = useLanguage()

  const getStatusColor = (status: string) => {
    switch (status) {
      case "working":
        return "bg-status-info"
      case "done":
        return "bg-status-success"
      case "error":
        return "bg-status-error"
      default:
        return "bg-surface-base"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "working":
        return language.t("swarm.status.working")
      case "done":
        return language.t("swarm.status.done")
      case "error":
        return language.t("swarm.status.error")
      default:
        return language.t("swarm.status.idle")
    }
  }

  return (
    <Show when={props.active}>
      <div class="flex items-center gap-2 px-4 py-2 bg-surface-base border-b border-border-default">
        <Icon name="branch" class="text-icon-weak-base" />
        <span class="text-12-medium text-text-weak">{language.t("swarm.title")}</span>

        <div class="flex items-center gap-1 ml-auto">
          <button
            class={`flex items-center gap-1.5 px-2 py-1 rounded text-11-medium transition-colors ${
              props.selectedSlot === "main"
                ? "bg-surface-stronger text-text-strong"
                : "text-text-weak hover:text-text-default hover:bg-surface-default"
            }`}
            onClick={() => props.onSelectSlot("main")}
          >
            <span class="w-1.5 h-1.5 rounded-full bg-status-success" />
            {language.t("swarm.main")}
          </button>

          <For each={props.slots}>
            {(slot) => (
              <button
                class={`flex items-center gap-1.5 px-2 py-1 rounded text-11-medium transition-colors ${
                  props.selectedSlot === slot.slot
                    ? "bg-surface-stronger text-text-strong"
                    : "text-text-weak hover:text-text-default hover:bg-surface-default"
                }`}
                onClick={() => props.onSelectSlot(slot.slot)}
              >
                <span class={`w-1.5 h-1.5 rounded-full ${getStatusColor(slot.status)}`} />
                {language.t("swarm.subagent")} {slot.slot}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

interface SwarmConsentModalProps {
  open: boolean
  reason: string
  planned_tasks: string[]
  models: string[]
  onAccept: () => void
  onDeny: () => void
}

export const SwarmConsentModal: Component<SwarmConsentModalProps> = (props) => {
  const language = useLanguage()

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-surface-stronger rounded-lg shadow-lg p-6 max-w-md w-full mx-4 border border-border-default">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-status-warning/20 flex items-center justify-center">
              <Icon name="circle-x" class="text-status-warning" />
            </div>
            <div>
              <h3 class="text-16-medium text-text-strong">{language.t("swarm.consent.title")}</h3>
              <p class="text-12-regular text-text-weak">{language.t("swarm.consent.subtitle")}</p>
            </div>
          </div>

          <div class="mb-4">
            <p class="text-14-regular text-text-default mb-2">{props.reason}</p>

            <Show when={props.planned_tasks.length > 0}>
              <div class="mt-3">
                <p class="text-12-medium text-text-weak mb-1">{language.t("swarm.consent.planned")}</p>
                <ul class="text-12-regular text-text-default list-disc list-inside">
                  <For each={props.planned_tasks.slice(0, 2)}>{(task) => <li>{task}</li>}</For>
                </ul>
              </div>
            </Show>

            <Show when={props.models.length > 0}>
              <div class="mt-3">
                <p class="text-12-medium text-text-weak mb-1">{language.t("swarm.consent.models")}</p>
                <div class="flex gap-2">
                  <For each={props.models}>
                    {(model) => (
                      <span class="text-11-regular px-2 py-0.5 bg-surface-base rounded text-text-weak">{model}</span>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>

          <div class="flex gap-3 justify-end">
            <Button variant="secondary" onClick={props.onDeny}>
              {language.t("swarm.consent.deny")}
            </Button>
            <Button variant="primary" onClick={props.onAccept}>
              {language.t("swarm.consent.accept")}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  )
}
