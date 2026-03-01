import { createStore, reconcile } from "solid-js/store"
import { createEffect, createMemo } from "solid-js"
import { createSimpleContext } from "@openhei-ai/ui/context"
import { persisted } from "@/utils/persist"
import { normalizeDensity } from "@/components/density.helper"

export interface NotificationSettings {
  agent: boolean
  permissions: boolean
  errors: boolean
}

export interface SoundSettings {
  agentEnabled: boolean
  agent: string
  permissionsEnabled: boolean
  permissions: string
  errorsEnabled: boolean
  errors: string
}

export interface Settings {
  general: {
    autoSave: boolean
    releaseNotes: boolean
    showReasoningSummaries: boolean
    density?: "comfortable" | "compact" | "spacious"
    // Persisted user-selected send option for the composer. Use the string
    // "default" to indicate the logical default (no metadata attached).
    sendOption?: "default" | "no_reply" | "plan" | "act" | "explain" | "search" | "priority"
    // Dismissed flag for an experimental discovery notice in Settings UI.
    dismissedExperimentalNotice?: boolean
    // Dismissed flag for the Phase 5 "What's new" banner.
    dismissedWhatsNewPhase5?: boolean
    // Controls how the thinking/summary drawer behaves when the feature is enabled.
    // This is a user preference only - the feature gate remains `flags["ui.thinking_drawer"]`.
    // Allowed values:
    //  - 'auto'  : show summaries only for messages that include a reasoning_summary
    //  - 'always': render the drawer for assistant messages even if reasoning_summary is missing
    //  - 'never' : never render (useful as a user preference independent of the feature flag)
    thinkingDrawerMode?: "auto" | "always" | "never"
    // Chat mode controls whether the UI may invoke tools/agents.
    // Allowed values: 'agent' (default) or 'chat_only' (tools disabled)
    chatMode?: "agent" | "chat_only"
  }
  ml: {
    qloraEnabled: boolean
  }
  updates: {
    startup: boolean
  }
  appearance: {
    fontSize: number
    font: string
  }
  keybinds: Record<string, string>
  permissions: {
    autoApprove: boolean
  }
  flags: {
    "ui.streaming_status": boolean
    "ui.stream_banners": boolean
    "ui.scroll_anchor": boolean
    "ui.stop_stream": boolean
    "ui.tool_cards": boolean
    "ui.step_timeline": boolean
    "ui.error_cards": boolean
    "ui.thinking_drawer": boolean
    "ui.send_options": boolean
    "ui.draft_persist": boolean
    "ui.composer_palette": boolean
    "ui.density_modes": boolean
  }
  notifications: NotificationSettings
  sounds: SoundSettings
}

const defaultSettings: Settings = {
  general: {
    autoSave: true,
    releaseNotes: true,
    dismissedExperimentalNotice: false,
    dismissedWhatsNewPhase5: false,
    sendOption: "default",
    showReasoningSummaries: false,
    density: "comfortable",
    thinkingDrawerMode: "auto",
    chatMode: "agent",
  },
  ml: {
    qloraEnabled: false,
  },
  updates: {
    startup: true,
  },
  appearance: {
    fontSize: 14,
    font: "ibm-plex-mono",
  },
  keybinds: {},
  permissions: {
    autoApprove: false,
  },
  flags: {
    "ui.streaming_status": false,
    "ui.stream_banners": false,
    "ui.scroll_anchor": false,
    "ui.stop_stream": false,
    "ui.tool_cards": false,
    "ui.step_timeline": false,
    "ui.error_cards": false,
    "ui.thinking_drawer": false,
    "ui.send_options": false,
    "ui.draft_persist": false,
    "ui.composer_palette": false,
    "ui.density_modes": false,
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false,
  },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: true,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03",
  },
}

const monoFallback =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

const monoFonts: Record<string, string> = {
  "ibm-plex-mono": `"IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "cascadia-code": `"Cascadia Code Nerd Font", "Cascadia Code NF", "Cascadia Mono NF", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "fira-code": `"Fira Code Nerd Font", "FiraMono Nerd Font", "FiraMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  hack: `"Hack Nerd Font", "Hack Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  inconsolata: `"Inconsolata Nerd Font", "Inconsolata Nerd Font Mono","IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "intel-one-mono": `"Intel One Mono Nerd Font", "IntoneMono Nerd Font", "IntoneMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  iosevka: `"Iosevka Nerd Font", "Iosevka Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "jetbrains-mono": `"JetBrains Mono Nerd Font", "JetBrainsMono Nerd Font Mono", "JetBrainsMonoNL Nerd Font", "JetBrainsMonoNL Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "meslo-lgs": `"Meslo LGS Nerd Font", "MesloLGS Nerd Font", "MesloLGM Nerd Font", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "roboto-mono": `"Roboto Mono Nerd Font", "RobotoMono Nerd Font", "RobotoMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "source-code-pro": `"Source Code Pro Nerd Font", "SauceCodePro Nerd Font", "SauceCodePro Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "ubuntu-mono": `"Ubuntu Mono Nerd Font", "UbuntuMono Nerd Font", "UbuntuMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "geist-mono": `"GeistMono Nerd Font", "GeistMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
}

export function monoFontFamily(font: string | undefined) {
  return monoFonts[font ?? defaultSettings.appearance.font] ?? monoFonts[defaultSettings.appearance.font]
}

function withFallback<T>(read: () => T | undefined, fallback: T) {
  return createMemo(() => read() ?? fallback)
}

export const { use: useSettings, provider: SettingsProvider } = createSimpleContext({
  name: "Settings",
  init: () => {
    const [store, setStore, _, ready] = persisted("settings.v3", createStore<Settings>(defaultSettings))

    createEffect(() => {
      if (typeof document === "undefined") return
      document.documentElement.style.setProperty("--font-family-mono", monoFontFamily(store.appearance?.font))
    })

    return {
      ready,
      get current() {
        return store
      },
      general: {
        autoSave: withFallback(() => store.general?.autoSave, defaultSettings.general.autoSave),
        setAutoSave(value: boolean) {
          setStore("general", "autoSave", value)
        },
        releaseNotes: withFallback(() => store.general?.releaseNotes, defaultSettings.general.releaseNotes),
        setReleaseNotes(value: boolean) {
          setStore("general", "releaseNotes", value)
        },
        showReasoningSummaries: withFallback(() => store.general?.showReasoningSummaries, true),
        setShowReasoningSummaries(value: boolean) {
          setStore("general", "showReasoningSummaries", value)
        },
        thinkingDrawerMode: withFallback(
          () => store.general?.thinkingDrawerMode as "auto" | "always" | "never" | undefined,
          defaultSettings.general.thinkingDrawerMode as "auto" | "always" | "never",
        ),
        setThinkingDrawerMode(value: "auto" | "always" | "never") {
          setStore("general", "thinkingDrawerMode", value)
        },
        chatMode: withFallback(
          () => store.general?.chatMode as "agent" | "chat_only" | undefined,
          defaultSettings.general.chatMode as "agent" | "chat_only",
        ),
        setChatMode(value: "agent" | "chat_only") {
          setStore("general", "chatMode", value)
        },
        density: withFallback(
          () => store.general?.density as "comfortable" | "compact" | "spacious" | undefined,
          defaultSettings.general.density as "comfortable" | "compact" | "spacious",
        ),
        setDensity(value: "comfortable" | "compact" | "spacious") {
          setStore("general", "density", value)
        },
        sendOption: withFallback(
          () =>
            store.general?.sendOption as
              | "default"
              | "no_reply"
              | "plan"
              | "act"
              | "explain"
              | "search"
              | "priority"
              | undefined,
          defaultSettings.general.sendOption as
            | "default"
            | "no_reply"
            | "plan"
            | "act"
            | "explain"
            | "search"
            | "priority",
        ),
        dismissedExperimentalNotice: withFallback(
          () => store.general?.dismissedExperimentalNotice as boolean | undefined,
          false,
        ),
        setDismissedExperimentalNotice(value: boolean) {
          setStore("general", "dismissedExperimentalNotice", value)
        },
        dismissedWhatsNewPhase5: withFallback(
          () => store.general?.dismissedWhatsNewPhase5 as boolean | undefined,
          false,
        ),
        setDismissedWhatsNewPhase5(value: boolean) {
          setStore("general", "dismissedWhatsNewPhase5", value)
        },
        setSendOption(value: "default" | "no_reply" | "plan" | "act" | "explain" | "search" | "priority") {
          setStore("general", "sendOption", value)
        },
      },
      ml: {
        qloraEnabled: withFallback(() => store.ml?.qloraEnabled, defaultSettings.ml.qloraEnabled),
        setQLoRAEnabled(value: boolean) {
          setStore("ml", "qloraEnabled", value)
        },
      },
      updates: {
        startup: withFallback(() => store.updates?.startup, defaultSettings.updates.startup),
        setStartup(value: boolean) {
          setStore("updates", "startup", value)
        },
      },
      appearance: {
        fontSize: withFallback(() => store.appearance?.fontSize, defaultSettings.appearance.fontSize),
        setFontSize(value: number) {
          setStore("appearance", "fontSize", value)
        },
        font: withFallback(() => store.appearance?.font, defaultSettings.appearance.font),
        setFont(value: string) {
          setStore("appearance", "font", value)
        },
      },
      keybinds: {
        get: (action: string) => store.keybinds?.[action],
        set(action: string, keybind: string) {
          setStore("keybinds", action, keybind)
        },
        reset(action: string) {
          setStore("keybinds", (current) => {
            if (!Object.prototype.hasOwnProperty.call(current, action)) return current
            const next = { ...current }
            delete next[action]
            return next
          })
        },
        resetAll() {
          setStore("keybinds", reconcile({}))
        },
      },
      permissions: {
        autoApprove: withFallback(() => store.permissions?.autoApprove, defaultSettings.permissions.autoApprove),
        setAutoApprove(value: boolean) {
          setStore("permissions", "autoApprove", value)
        },
      },
      flags: {
        get: <K extends keyof Settings["flags"]>(key: K) => {
          return withFallback(() => store.flags?.[key], defaultSettings.flags[key])()
        },
        set: <K extends keyof Settings["flags"]>(key: K, value: boolean) => {
          setStore("flags", key, value)
        },
      },
      notifications: {
        agent: withFallback(() => store.notifications?.agent, defaultSettings.notifications.agent),
        setAgent(value: boolean) {
          setStore("notifications", "agent", value)
        },
        permissions: withFallback(() => store.notifications?.permissions, defaultSettings.notifications.permissions),
        setPermissions(value: boolean) {
          setStore("notifications", "permissions", value)
        },
        errors: withFallback(() => store.notifications?.errors, defaultSettings.notifications.errors),
        setErrors(value: boolean) {
          setStore("notifications", "errors", value)
        },
      },
      sounds: {
        agentEnabled: withFallback(() => store.sounds?.agentEnabled, defaultSettings.sounds.agentEnabled),
        setAgentEnabled(value: boolean) {
          setStore("sounds", "agentEnabled", value)
        },
        agent: withFallback(() => store.sounds?.agent, defaultSettings.sounds.agent),
        setAgent(value: string) {
          setStore("sounds", "agent", value)
        },
        permissionsEnabled: withFallback(
          () => store.sounds?.permissionsEnabled,
          defaultSettings.sounds.permissionsEnabled,
        ),
        setPermissionsEnabled(value: boolean) {
          setStore("sounds", "permissionsEnabled", value)
        },
        permissions: withFallback(() => store.sounds?.permissions, defaultSettings.sounds.permissions),
        setPermissions(value: string) {
          setStore("sounds", "permissions", value)
        },
        errorsEnabled: withFallback(() => store.sounds?.errorsEnabled, defaultSettings.sounds.errorsEnabled),
        setErrorsEnabled(value: boolean) {
          setStore("sounds", "errorsEnabled", value)
        },
        errors: withFallback(() => store.sounds?.errors, defaultSettings.sounds.errors),
        setErrors(value: string) {
          setStore("sounds", "errors", value)
        },
      },
    }
  },
})

// Export the default settings so tests and docs can reason about the
// initial feature-flag state without instantiating the UI context.
// This is a non-invasive export used only for verification and docs.
export const DEFAULT_SETTINGS = defaultSettings
