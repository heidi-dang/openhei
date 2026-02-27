import { Persist } from "@/utils/persist"

// Draft persistence v2: store JSON { text: string, ts_ms: number }
// Stale policy: ignore drafts older than 7 days
const sanitize = (v: string) => v.replace(/[\s\/\\]/g, "-")

export const STALE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const draftKey = (workspaceId: string, sessionId?: string) =>
  `draft.v2.${sanitize(workspaceId)}.${sanitize(sessionId ?? "root")}`

export const readDraft = (key: string) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    let parsed: { text?: string; ts_ms?: number } | undefined
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      // malformed payload - best-effort: do not throw, treat as no draft
      return undefined
    }
    if (!parsed || typeof parsed.text !== "string" || typeof parsed.ts_ms !== "number") return undefined
    if (Date.now() - parsed.ts_ms > STALE_MS) {
      // best-effort remove stale entry
      try {
        localStorage.removeItem(key)
      } catch (e) {
        // ignore
      }
      return undefined
    }
    return parsed.text
  } catch (e) {
    return undefined
  }
}

export const writeDraft = (key: string, value: string) => {
  try {
    const payload = JSON.stringify({ text: value, ts_ms: Date.now() })
    localStorage.setItem(key, payload)
  } catch (e) {
    // best-effort
  }
}

export const removeDraft = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    // best-effort
  }
}
