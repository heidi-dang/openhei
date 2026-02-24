// @refresh reload

import { iife } from "@openhei-ai/util/iife"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { type Platform, PlatformProvider } from "@/context/platform"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import { handleNotificationClick } from "@/utils/notification-click"
import pkg from "../package.json"
import { ServerConnection } from "./context/server"

const DEFAULT_SERVER_URL_KEY = "openhei.settings.dat:defaultServerUrl"

const getLocale = () => {
  if (typeof navigator !== "object") return "en" as const
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    if (language.toLowerCase().startsWith("zh")) return "zh" as const
  }
  return "en" as const
}

const getRootNotFoundError = () => {
  const key = "error.dev.rootNotFound" as const
  const locale = getLocale()
  return locale === "zh" ? (zh[key] ?? en[key]) : en[key]
}

const getStorage = (key: string) => {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setStorage = (key: string, value: string | null) => {
  if (typeof localStorage === "undefined") return
  try {
    if (value !== null) {
      localStorage.setItem(key, value)
      return
    }
    localStorage.removeItem(key)
  } catch {
    return
  }
}

const readDefaultServerUrl = () => getStorage(DEFAULT_SERVER_URL_KEY)
const writeDefaultServerUrl = (url: string | null) => setStorage(DEFAULT_SERVER_URL_KEY, url)

const notify: Platform["notify"] = async (title, description, href) => {
  if (!("Notification" in window)) return

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied")
      : Notification.permission

  if (permission !== "granted") return

  const inView = document.visibilityState === "visible" && document.hasFocus()
  if (inView) return

  const notification = new Notification(title, {
    body: description ?? "",
    icon: "/favicon-96x96-v3.png",
  })

  notification.onclick = () => {
    handleNotificationClick(href)
    notification.close()
  }
}

const openLink: Platform["openLink"] = (url) => {
  window.open(url, "_blank")
}

const back: Platform["back"] = () => {
  window.history.back()
}

const forward: Platform["forward"] = () => {
  window.history.forward()
}

const defaultUrl = iife(() => {
  const lsDefault = readDefaultServerUrl()
  if (lsDefault) return lsDefault
  if (location.hostname.includes("openhei.ai")) return "http://localhost:4096"
  if (import.meta.env.DEV)
    return `http://${import.meta.env.VITE_OPENHEI_SERVER_HOST ?? "localhost"}:${import.meta.env.VITE_OPENHEI_SERVER_PORT ?? "4096"}`
  return location.origin
})

const registerSw = () => {
  const enabled = import.meta.env.PROD || import.meta.env.VITE_PWA_DEV === "1"
  if (!enabled) return
  if (!("serviceWorker" in navigator)) return

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => undefined)
  })
}

if (typeof window === "object") registerSw()

const restart: Platform["restart"] = async () => {
  // Try to ping the server until it's back
  const ping = async () => {
    try {
      const res = await fetch(`${defaultUrl}/global/health`)
      return res.ok
    } catch {
      return false
    }
  }

  // Wait a bit before starting to ping
  await new Promise((resolve) => setTimeout(resolve, 2000))

  for (let i = 0; i < 30; i++) {
    if (await ping()) {
      window.location.reload()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  window.location.reload()
}

const checkUpdate: Platform["checkUpdate"] = async () => {
  try {
    const res = await fetch(`${defaultUrl}/global/update/check`)
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json()
    return {
      updateAvailable: data.version !== data.latest,
      version: data.latest,
    }
  } catch (err) {
    console.error("Failed to check for updates:", err)
    return { updateAvailable: false }
  }
}

const update: Platform["update"] = async () => {
  try {
    const res = await fetch(`${defaultUrl}/global/update`, { method: "POST" })
    if (!res.ok) throw new Error(res.statusText)
  } catch (err) {
    console.error("Failed to install update:", err)
    throw err
  }
}

const root = document.getElementById("root")
if (!(root instanceof HTMLElement) && import.meta.env.DEV) {
  throw new Error(getRootNotFoundError())
}

const platform: Platform = {
  platform: "web",
  version: pkg.version,
  openLink,
  back,
  forward,
  restart,
  notify,
  checkUpdate,
  update,
  getDefaultServerUrl: async () => readDefaultServerUrl(),
  setDefaultServerUrl: writeDefaultServerUrl,
}

if (root instanceof HTMLElement) {
  const server: ServerConnection.Http = { type: "http", http: { url: defaultUrl } }
  render(
    () => (
      <PlatformProvider value={platform}>
        <AppBaseProviders>
          <AppInterface defaultServer={ServerConnection.key(server)} servers={[server]} />
        </AppBaseProviders>
      </PlatformProvider>
    ),
    root,
  )
}
