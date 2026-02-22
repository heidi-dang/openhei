import { Button } from "@openhei-ai/ui/button"
import { useDialog } from "@openhei-ai/ui/context/dialog"
import { Dialog } from "@openhei-ai/ui/dialog"
import { TextField } from "@openhei-ai/ui/text-field"
import { Select } from "@openhei-ai/ui/select"
import { Switch } from "@openhei-ai/ui/switch"
import { Icon } from "@openhei-ai/ui/icon"
import { createStore } from "solid-js/store"
import { Show, For, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"

const MODE_OPTIONS = [
    { value: "primary", label: "Primary" },
    { value: "subagent", label: "Sub-agent" },
    { value: "all", label: "All" },
]

const STANDARD_TOOLS = [
    { id: "read", icon: "code-lines" as const, label: "settings.agents.tool.read" },
    { id: "edit", icon: "edit" as const, label: "settings.agents.tool.edit" },
    { id: "glob", icon: "folder" as const, label: "settings.agents.tool.glob" },
    { id: "grep", icon: "magnifying-glass" as const, label: "settings.agents.tool.grep" },
    { id: "list", icon: "bullet-list" as const, label: "settings.agents.tool.list" },
    { id: "bash", icon: "console" as const, label: "settings.agents.tool.bash" },
    { id: "task", icon: "task" as const, label: "settings.agents.tool.task" },
]

const PRESET_COLORS = [
    "#3B82F6", // blue
    "#8B5CF6", // violet
    "#EC4899", // pink
    "#EF4444", // red
    "#F97316", // orange
    "#EAB308", // yellow
    "#22C55E", // green
    "#14B8A6", // teal
    "#06B6D4", // cyan
    "#6366F1", // indigo
]

export function DialogEditAgent(props: { agent?: any; name?: string }) {
    const dialog = useDialog()
    const language = useLanguage()
    const globalSync = useGlobalSync()

    const isEditing = !!props.name

    const [store, setStore] = createStore({
        name: props.name || "",
        description: (props.agent as any)?.description || "",
        prompt: (props.agent as any)?.prompt || "",
        mode: (props.agent as any)?.mode || "primary",
        model: (props.agent as any)?.model || "",
        color: (props.agent as any)?.color || "#3B82F6",
        steps: (props.agent as any)?.steps?.toString() || "",
        temperature: (props.agent as any)?.temperature?.toString() || "",
        hidden: (props.agent as any)?.hidden || false,
        disable: (props.agent as any)?.disable || false,
        tools: STANDARD_TOOLS.map(t => t.id).filter(id => {
            const p = (props.agent as any)?.permission;
            // If it's a record/object, check the key
            if (p && typeof p === 'object' && !Array.isArray(p)) {
                return p[id] !== 'deny';
            }
            // If it's an array of rules (Ruleset), check for deny rules
            if (Array.isArray(p)) {
                const rule = p.findLast((r: any) => r.permission === id);
                return rule ? rule.action !== 'deny' : true;
            }
            return true;
        }),
        saving: false,
        deleting: false,
        showAdvanced: false,
    })

    const availableModels = createMemo(() => {
        const models = globalSync.data.provider.all.flatMap((p) =>
            Object.values(p.models).map((m: any) => ({
                value: `${p.id}/${m.id}`,
                label: `${p.name}: ${m.name}`,
                provider: p.name,
                name: m.name,
            }))
        )
        return [{ value: "", label: "Default model" }, ...models]
    })

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault()
        if (!store.name.trim()) return

        setStore("saving", true)

        try {
            const config = JSON.parse(JSON.stringify(globalSync.data.config || {}))
            config.agent = config.agent || {}

            const agentData: Record<string, any> = {
                ...props.agent,
                mode: store.mode,
            }

            if (store.description.trim()) agentData.description = store.description.trim()
            else delete agentData.description

            if (store.prompt.trim()) agentData.prompt = store.prompt.trim()
            else delete agentData.prompt

            if (store.model.trim()) agentData.model = store.model.trim()
            else delete agentData.model

            if (store.color) agentData.color = store.color
            else delete agentData.color

            const steps = parseInt(store.steps)
            if (!isNaN(steps) && steps > 0) agentData.steps = steps
            else delete agentData.steps

            const temp = parseFloat(store.temperature)
            if (!isNaN(temp) && temp >= 0 && temp <= 2) agentData.temperature = temp
            else delete agentData.temperature

            if (store.hidden) agentData.hidden = true
            else delete agentData.hidden

            if (store.disable) agentData.disable = true
            else delete agentData.disable

            // Handle tools/permissions
            const permission: Record<string, string> = {}
            for (const tool of STANDARD_TOOLS) {
                if (!store.tools.includes(tool.id)) {
                    permission[tool.id] = "deny"
                }
            }

            if (Object.keys(permission).length > 0) {
                agentData.permission = permission
            } else {
                delete agentData.permission
            }

            // If name changed while editing, remove old entry
            if (isEditing && props.name !== store.name.trim()) {
                delete config.agent[props.name!]
            }

            config.agent[store.name.trim()] = agentData

            await globalSync.updateConfig(config)
            dialog.close()
        } catch (err) {
            console.error("Failed to save agent:", err)
        } finally {
            setStore("saving", false)
        }
    }

    async function handleDelete() {
        if (!isEditing || !props.name) return
        setStore("deleting", true)
        try {
            const config = JSON.parse(JSON.stringify(globalSync.data.config || {}))
            config.agent = config.agent || {}
            delete config.agent[props.name]
            await globalSync.updateConfig(config)
            dialog.close()
        } catch (err) {
            console.error("Failed to delete agent:", err)
        } finally {
            setStore("deleting", false)
        }
    }

    return (
        <Dialog
            title={isEditing ? `Edit @${props.name}` : language.t("settings.agents.add")}
            class="w-full max-w-[560px] mx-auto"
        >
            <form onSubmit={handleSubmit} class="flex flex-col max-h-[85vh] overflow-hidden">
                <div class="flex-1 overflow-y-auto no-scrollbar p-6 pt-0 flex flex-col gap-5">
                    {/* Name + Mode row */}
                    <div class="flex gap-3">
                        <div class="flex-1">
                            <TextField
                                autofocus={!isEditing}
                                label={language.t("settings.agents.field.name")}
                                placeholder={language.t("settings.agents.field.name.placeholder")}
                                value={store.name}
                                onChange={(v) => setStore("name", v)}
                                disabled={isEditing}
                            />
                        </div>
                        <div class="flex flex-col gap-1.5 w-[140px]">
                            <label class="text-13-medium text-text-strong">{language.t("settings.agents.field.mode")}</label>
                            <Select
                                options={MODE_OPTIONS}
                                current={MODE_OPTIONS.find((m) => m.value === store.mode)}
                                value={(x) => x.value}
                                label={(x) => x.label}
                                onSelect={(v) => {
                                    if (v) setStore("mode", v.value)
                                }}
                                variant="outline"
                                size="medium"
                                triggerVariant="settings"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <TextField
                        label={language.t("settings.agents.field.description")}
                        placeholder={language.t("settings.agents.field.description.placeholder")}
                        value={store.description}
                        onChange={(v) => setStore("description", v)}
                    />

                    {/* System Prompt */}
                    <div class="flex flex-col gap-1.5">
                        <label class="text-13-medium text-text-strong">{language.t("settings.agents.field.prompt")}</label>
                        <textarea
                            class="w-full min-h-[200px] p-3 rounded-lg bg-surface-base border border-border-base text-13-regular text-text-strong font-mono resize-y focus:outline-none focus:border-border-strong-base transition-colors placeholder:text-text-subtle"
                            placeholder={language.t("settings.agents.field.prompt.placeholder")}
                            value={store.prompt}
                            onInput={(e) => setStore("prompt", e.currentTarget.value)}
                        />
                    </div>

                    {/* Color picker */}
                    <div class="flex flex-col gap-1.5">
                        <label class="text-13-medium text-text-strong">{language.t("settings.agents.field.color")}</label>
                        <div class="flex items-center gap-2">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    type="button"
                                    class="size-7 rounded-lg transition-all cursor-pointer border-2"
                                    classList={{
                                        "border-white scale-110 shadow-sm": store.color === c,
                                        "border-transparent opacity-80 hover:opacity-100 hover:scale-105": store.color !== c,
                                    }}
                                    style={{ "background-color": c }}
                                    onClick={() => setStore("color", c)}
                                />
                            ))}
                            <div class="size-7 rounded-lg p-0.5 border border-border-base bg-surface-base relative overflow-hidden">
                                <input
                                    type="color"
                                    class="absolute inset-[-4px] size-[40px] cursor-pointer"
                                    value={store.color}
                                    onInput={(e) => setStore("color", e.currentTarget.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Tools section */}
                    <div class="flex flex-col gap-2.5">
                        <label class="text-13-medium text-text-strong">Capabilities</label>
                        <div class="grid grid-cols-2 gap-2">
                            <For each={STANDARD_TOOLS}>
                                {(tool) => (
                                    <button
                                        type="button"
                                        class="flex items-center gap-2.5 p-2 rounded-xl border transition-all text-left"
                                        classList={{
                                            "bg-surface-raised-base border-border-strong-base text-text-strong": store.tools.includes(tool.id),
                                            "bg-surface-base border-border-base text-text-weak hover:border-border-strong-base": !store.tools.includes(tool.id),
                                        }}
                                        onClick={() => {
                                            if (store.tools.includes(tool.id)) {
                                                setStore("tools", store.tools.filter((t) => t !== tool.id))
                                            } else {
                                                setStore("tools", [...store.tools, tool.id])
                                            }
                                        }}
                                    >
                                        <div
                                            class="size-8 rounded-lg flex items-center justify-center transition-colors"
                                            classList={{
                                                "bg-primary-base/10 text-primary-base": store.tools.includes(tool.id),
                                                "bg-surface-base text-text-subtle": !store.tools.includes(tool.id),
                                            }}
                                        >
                                            <Icon name={tool.icon} size="small" />
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="text-13-medium leading-none mb-0.5">{tool.label}</span>
                                            <span class="text-11-regular opacity-60">@{tool.id}</span>
                                        </div>
                                    </button>
                                )}
                            </For>
                        </div>
                    </div>

                    {/* Advanced toggle */}
                    <button
                        type="button"
                        class="flex items-center gap-2 text-13-medium text-text-weak hover:text-text-strong transition-colors cursor-pointer py-1"
                        onClick={() => setStore("showAdvanced", !store.showAdvanced)}
                    >
                        <Icon name={store.showAdvanced ? "chevron-down" : "chevron-right"} size="small" />
                        Advanced settings
                    </button>

                    <Show when={store.showAdvanced}>
                        <div class="flex flex-col gap-4 pl-1">
                            <div class="flex flex-col gap-1.5">
                                <label class="text-13-medium text-text-strong">{language.t("settings.agents.field.model")}</label>
                                <Select
                                    options={availableModels()}
                                    current={availableModels().find((m) => m.value === store.model) || availableModels()[0]}
                                    value={(x) => x.value}
                                    label={(x) => x.label}
                                    onSelect={(v) => {
                                        if (v) setStore("model", v.value)
                                    }}
                                    variant="outline"
                                    size="medium"
                                    triggerVariant="settings"
                                />
                            </div>

                            {/* Steps + Temperature row */}
                            <div class="flex gap-3">
                                <div class="flex-1">
                                    <TextField
                                        label={language.t("settings.agents.field.steps")}
                                        placeholder={language.t("settings.agents.field.steps.placeholder")}
                                        type="number"
                                        value={store.steps}
                                        onChange={(v) => setStore("steps", v)}
                                    />
                                </div>
                                <div class="flex-1">
                                    <TextField
                                        label={language.t("settings.agents.field.temperature")}
                                        placeholder="0.0 - 2.0"
                                        type="number"
                                        value={store.temperature}
                                        onChange={(v) => setStore("temperature", v)}
                                    />
                                </div>
                            </div>

                            {/* Toggles */}
                            <div class="flex flex-col gap-3 pt-1">
                                <div class="flex items-center justify-between">
                                    <div class="flex flex-col">
                                        <span class="text-13-medium text-text-strong">{language.t("settings.agents.field.hidden")}</span>
                                        <span class="text-12-regular text-text-weak">{language.t("settings.agents.field.hidden.description")}</span>
                                    </div>
                                    <Switch
                                        checked={store.hidden}
                                        onChange={(v) => setStore("hidden", v)}
                                        hideLabel
                                    >
                                        {language.t("settings.agents.field.hidden")}
                                    </Switch>
                                </div>
                                <div class="flex items-center justify-between">
                                    <div class="flex flex-col">
                                        <span class="text-13-medium text-text-strong">{language.t("settings.agents.field.disable")}</span>
                                        <span class="text-12-regular text-text-weak">{language.t("settings.agents.field.disable.description")}</span>
                                    </div>
                                    <Switch
                                        checked={store.disable}
                                        onChange={(v) => setStore("disable", v)}
                                        hideLabel
                                    >
                                        {language.t("settings.agents.field.disable")}
                                    </Switch>
                                </div>
                            </div>
                        </div>
                    </Show>
                </div>

                {/* Footer */}
                <div class="flex items-center p-6 pt-2 border-t border-border-base bg-surface-raised-base">
                    <Show when={isEditing}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="large"
                            onClick={handleDelete}
                            disabled={store.deleting}
                            class="text-[hsl(0,72%,51%)] hover:text-[hsl(0,72%,41%)]"
                        >
                            <Icon name="trash" size="small" class="mr-1.5" />
                            {store.deleting ? language.t("common.loading") : language.t("settings.agents.delete.button")}
                        </Button>
                    </Show>
                    <div class="flex-1" />
                    <div class="flex gap-2">
                        <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
                            {language.t("common.cancel")}
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="large"
                            disabled={store.saving || !store.name.trim()}
                        >
                            {store.saving ? language.t("common.saving") : language.t("common.save")}
                        </Button>
                    </div>
                </div>
            </form>
        </Dialog>
    )
}
