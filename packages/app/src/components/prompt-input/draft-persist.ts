import { Persist } from "@/utils/persist"

const sanitize = (v: string) => v.replace(/[\s\/\\]/g, "-")

export const draftKey = (workspaceId: string, sessionId?: string) =>
  `draft.v1.${sanitize(workspaceId)}.${sanitize(sessionId ?? "root")}`

export const readDraft = (key: string) => {
  try {
    const item = localStorage.getItem(key)
    return item ?? undefined
  } catch (e) {
    return undefined
  }
}

export const writeDraft = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
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
