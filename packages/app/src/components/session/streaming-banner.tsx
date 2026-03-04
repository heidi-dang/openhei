import { Show } from "solid-js"
import { useLanguage } from "@/context/language"

export type BannerType = "replaying" | "resync_required" | "retry" | "resync" | null

export interface StreamingBannerProps {
  type: BannerType | undefined
}

export function StreamingBanner(props: StreamingBannerProps) {
  const language = useLanguage()

  return (
    <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-raised-base border border-border-weak-base text-text-base">
      <div class="size-4 border-2 border-text-weak border-t-transparent rounded-full animate-spin" />
      <span class="text-12-regular">
        {props.type === "replaying" ? language.t("streaming.banner.replaying") : language.t("streaming.banner.resync")}
      </span>
    </div>
  )
}
