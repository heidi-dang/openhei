import { Show } from "solid-js"
import { useLanguage } from "@/context/language"

export type BannerType = "replaying" | "resync_required"

export interface StreamingBannerProps {
  type: BannerType
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
