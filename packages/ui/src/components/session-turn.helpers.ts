export function shouldRenderThinkingDrawer(
  flagEnabled: boolean | undefined,
  mode: "auto" | "always" | "never" | undefined,
  message: any,
) {
  if (!flagEnabled) return false
  if (mode === "never") return false
  if (mode === "always") return true
  // auto
  const summary =
    ((message as any)?.reasoning_summary as string) ||
    ((message as any)?.reasoningSummary as string) ||
    (message as any)?.metadata?.reasoning_summary
  return !!(summary && String(summary).trim())
}

export default shouldRenderThinkingDrawer
