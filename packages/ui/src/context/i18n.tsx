import { createContext, useContext, type Accessor, type ParentProps } from "solid-js"
import { dict as en } from "../i18n/en"

export type UiI18nKey = keyof typeof en

export type UiI18nParams = Record<string, string | number | boolean>

export type UiI18n = {
  locale: Accessor<string>
  // Accept known keys or arbitrary strings; allow different translator shapes
  t: (key: any, params?: UiI18nParams) => string
}

function resolveTemplate(text: string, params?: UiI18nParams) {
  if (!params) return text
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const key = String(rawKey)
    const value = params[key]
    return value === undefined ? "" : String(value)
  })
}

const fallback: UiI18n = {
  locale: () => "en",
  t: (key, params) => {
    const value = (en as Record<string, string>)[key] ?? String(key)
    return resolveTemplate(value, params)
  },
}

const Context = createContext<UiI18n>(fallback)

export function I18nProvider(props: ParentProps<{ value: UiI18n }>) {
  return <Context.Provider value={props.value}>{props.children}</Context.Provider>
}

export function useI18n() {
  return useContext(Context)
}
