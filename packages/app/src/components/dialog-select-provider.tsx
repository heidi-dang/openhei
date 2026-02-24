import { Component, Show } from "solid-js"
import { useDialog } from "@openhei-ai/ui/context/dialog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { Dialog } from "@openhei-ai/ui/dialog"
import { List } from "@openhei-ai/ui/list"
import { Tag } from "@openhei-ai/ui/tag"
import { ProviderIcon } from "@openhei-ai/ui/provider-icon"
import { iconNames, type IconName } from "@openhei-ai/ui/icons/provider"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "./dialog-custom-provider"

const CUSTOM_ID = "_custom"

function icon(id: string): IconName {
  if (iconNames.includes(id as IconName)) return id as IconName
  return "synthetic"
}

export const DialogSelectProvider: Component = () => {
  const dialog = useDialog()
  const providers = useProviders()
  const language = useLanguage()

  const popularGroup = () => language.t("dialog.provider.group.popular")
  const otherGroup = () => language.t("dialog.provider.group.other")
  const subscriptionGroup = () => language.t("dialog.provider.group.subscription")
  const subscriptionIds = [
    "openai",
    "github-copilot",
    "github-copilot-enterprise",
    "microsoft-copilot",
    "alternative-auth",
    "duckduckgo",
    "perplexity",
    "mistral",
    "anthropic",
    "venice",
    "subscription-login",
    "openhei-openai-codex-auth",
  ]
  const customLabel = () => language.t("settings.providers.tag.custom")
  const note = (id: string) => {
    if (id === "anthropic") return language.t("dialog.provider.anthropic.note")
    if (id === "openai") return language.t("dialog.provider.openai.note")
    if (id === "alternative-auth") return language.t("dialog.provider.alternative.note")
    if (id === "microsoft-copilot") return language.t("dialog.provider.mcopilot.note")
    if (id.startsWith("github-copilot")) return language.t("dialog.provider.copilot.note")
  }

  return (
    <Dialog title={language.t("command.provider.connect")} transition>
      <List
        class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
        search={{ placeholder: language.t("dialog.provider.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.provider.empty")}
        activeIcon="plus-small"
        key={(x) => x?.id}
        items={() => {
          language.locale()
          return [{ id: CUSTOM_ID, name: customLabel() }, ...providers.all()]
        }}
        filterKeys={["id", "name"]}
        groupBy={(x) => {
          if (subscriptionIds.includes(x.id)) return subscriptionGroup()
          return popularProviders.includes(x.id) ? popularGroup() : otherGroup()
        }}
        sortBy={(a, b) => {
          if (a.id === CUSTOM_ID) return -1
          if (b.id === CUSTOM_ID) return 1
          if (subscriptionIds.includes(a.id) && subscriptionIds.includes(b.id)) {
            return subscriptionIds.indexOf(a.id) - subscriptionIds.indexOf(b.id)
          }
          if (popularProviders.includes(a.id) && popularProviders.includes(b.id))
            return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id)
          return a.name.localeCompare(b.name)
        }}
        sortGroupsBy={(a, b) => {
          const popular = popularGroup()
          const subscription = subscriptionGroup()
          if (a.category === popular && b.category !== popular) return -1
          if (b.category === popular && a.category !== popular) return 1
          if (a.category === subscription && b.category !== subscription) return 1
          if (b.category === subscription && a.category !== subscription) return -1
          return 0
        }}
        onSelect={(x) => {
          if (!x) return
          if (x.id === CUSTOM_ID) {
            dialog.show(() => <DialogCustomProvider back="providers" />)
            return
          }
          dialog.show(() => <DialogConnectProvider provider={x.id} />)
        }}
      >
        {(i) => (
          <div class="px-1.25 w-full flex items-center gap-x-3">
            <ProviderIcon data-slot="list-item-extra-icon" id={icon(i.id)} />
            <span>{i.name}</span>
            <Show when={i.id === CUSTOM_ID}>
              <Tag>{language.t("settings.providers.tag.custom")}</Tag>
            </Show>
            <Show when={["openhei", "openai", "github-copilot", "microsoft-copilot"].includes(i.id)}>
              <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
            </Show>
            <Show when={note(i.id)}>{(value) => <div class="text-14-regular text-text-weak">{value()}</div>}</Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
