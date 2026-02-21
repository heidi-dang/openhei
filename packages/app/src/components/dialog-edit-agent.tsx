import { Button } from "@openhei-ai/ui/button"
import { useDialog } from "@openhei-ai/ui/context/dialog"
import { Dialog } from "@openhei-ai/ui/dialog"
import { TextField } from "@openhei-ai/ui/text-field"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"
import { type Agent } from "@openhei-ai/sdk/v2/client"

export function DialogEditAgent(props: { agent?: any; name?: string }) {
    const dialog = useDialog()
    const language = useLanguage()
    const globalSync = useGlobalSync()

    const [store, setStore] = createStore({
        name: props.name || "",
        description: props.agent?.description || "",
        prompt: props.agent?.prompt || "",
        saving: false,
    })

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault()
        setStore("saving", true)

        try {
            const config = JSON.parse(JSON.stringify(globalSync.data.config))
            config.agent = config.agent || {}

            const agentData = {
                ...props.agent,
                description: store.description,
                prompt: store.prompt,
                mode: props.agent?.mode || "primary",
            }

            config.agent[store.name] = agentData

            await globalSync.updateConfig(config)
            dialog.close()
        } catch (err) {
            console.error("Failed to save agent:", err)
        } finally {
            setStore("saving", false)
        }
    }

    return (
        <Dialog
            title={props.agent ? language.t("common.edit") + " " + store.name : language.t("command.category.agent")}
            class="w-full max-w-[500px] mx-auto"
        >
            <form onSubmit={handleSubmit} class="flex flex-col gap-6 p-6 pt-0">
                <div class="flex flex-col gap-4">
                    <TextField
                        autofocus
                        label={language.t("dialog.project.edit.name")}
                        value={store.name}
                        onChange={(v) => setStore("name", v)}
                        disabled={!!props.agent}
                    />
                    <TextField
                        label={language.t("palette.group.commands")}
                        placeholder="Agent description..."
                        value={store.description}
                        onChange={(v) => setStore("description", v)}
                    />
                    <TextField
                        multiline
                        label="System Prompt"
                        value={store.prompt}
                        onChange={(v) => setStore("prompt", v)}
                        class="min-h-[200px] font-mono text-xs"
                    />
                </div>

                <div class="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
                        {language.t("common.cancel")}
                    </Button>
                    <Button type="submit" variant="primary" size="large" disabled={store.saving}>
                        {store.saving ? language.t("common.saving") : language.t("common.save")}
                    </Button>
                </div>
            </form>
        </Dialog>
    )
}
