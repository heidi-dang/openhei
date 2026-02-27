import { type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { Icon } from "@openhei-ai/ui/icon"
import { Button } from "@openhei-ai/ui/button"

export const DialogHealthCheck: Component = () => {
    const language = useLanguage()

    return (
        <div class="flex flex-col gap-6 p-6 min-w-[320px] max-w-[480px]">
            <div class="flex flex-col items-center gap-4 text-center">
                <div class="size-16 rounded-full bg-surface-base flex items-center justify-center text-text-strong">
                    <Icon name="circle-check" class="size-10 text-success-base" />
                </div>
                <div class="flex flex-col gap-1">
                    <h2 class="text-18-semibold text-text-strong">{language.t("sidebar.health.title")}</h2>
                    <p class="text-14-medium text-success-base uppercase tracking-wider">{language.t("sidebar.health.status.active")}</p>
                </div>
            </div>

            <div class="flex flex-col gap-4 bg-surface-base p-4 rounded-lg border border-border-weak-base">
                <div class="flex items-start gap-3">
                    <Icon name="check-small" class="size-5 text-success-base shrink-0 mt-0.5" />
                    <div class="flex flex-col gap-0.5">
                        <span class="text-14-medium text-text-strong">{language.t("sidebar.health.status.verified")}</span>
                        <span class="text-13-regular text-text-weak">{language.t("sidebar.health.description")}</span>
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <div class="flex justify-between items-center px-2 py-1 border-b border-border-weak-base">
                    <span class="text-13-regular text-text-weak">OpenHei Bypass</span>
                    <span class="text-13-medium text-success-base">CONNECTED</span>
                </div>
                <div class="flex justify-between items-center px-2 py-1 border-b border-border-weak-base">
                    <span class="text-13-regular text-text-weak">OpenCode Bypass</span>
                    <span class="text-13-medium text-success-base">CONNECTED</span>
                </div>
                <div class="flex justify-between items-center px-2 py-1 border-b border-border-weak-base">
                    <span class="text-13-regular text-text-weak">ZenMux Bypass</span>
                    <span class="text-13-medium text-success-base">CONNECTED</span>
                </div>
            </div>

            <Button size="large" onClick="dismiss" class="w-full">
                {language.t("common.close")}
            </Button>
        </div>
    )
}
