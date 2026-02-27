import "@/index.css"
import { I18nProvider } from "@openhei-ai/ui/context"
import { CodeComponentProvider } from "@openhei-ai/ui/context/code"
import { DialogProvider } from "@openhei-ai/ui/context/dialog"
import { DiffComponentProvider } from "@openhei-ai/ui/context/diff"
import { MarkedProvider } from "@openhei-ai/ui/context/marked"
import { Font } from "@openhei-ai/ui/font"
import { ThemeProvider } from "@openhei-ai/ui/theme"
import { MetaProvider } from "@solidjs/meta"
import { Navigate, Route, Router, useNavigate } from "@solidjs/router"
import { ErrorBoundary, type JSX, lazy, type ParentProps, Show, Suspense, onCleanup, onMount } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { CommandProvider } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { HighlightsProvider } from "@/context/highlights"
import { LanguageProvider, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { PromptProvider } from "@/context/prompt"
import { type ServerConnection, ServerProvider, useServer } from "@/context/server"
import { SettingsProvider, useSettings } from "@/context/settings"
import "./styles/density.css"
import { TerminalProvider } from "@/context/terminal"
import DirectoryLayout from "@/pages/directory-layout"
import Layout from "@/pages/layout"
import { ErrorPage } from "./pages/error"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"

const Home = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))
const QLoRA = lazy(() => import("@/pages/qlora"))
const Updating = lazy(() => import("@/pages/updating"))
const Diff = lazy(() => import("@openhei-ai/ui/diff").then((m) => ({ default: m.Diff })))
const Code = lazy(() => import("@openhei-ai/ui/code").then((m) => ({ default: m.Code })))

const Loading = () => <div class="size-full" />

const HomeRoute = () => (
  <Suspense fallback={<Loading />}>
    <Home />
  </Suspense>
)

const SessionRoute = () => (
  <SessionProviders>
    <Suspense fallback={<Loading />}>
      <Session />
    </Suspense>
  </SessionProviders>
)

const QLoRARoute = () => (
  <Suspense fallback={<Loading />}>
    <QLoRA />
  </Suspense>
)

const SessionIndexRoute = () => <Navigate href="session" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENHEI__?: {
      updaterEnabled?: boolean
      deepLinks?: string[]
      wsl?: boolean
    }
  }
}

function MarkedProviderWithNativeParser(props: ParentProps) {
  const platform = usePlatform()
  return <MarkedProvider nativeParser={platform.parseMarkdown}>{props.children}</MarkedProvider>
}

function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          <NotificationProvider>
            <ModelsProvider>
              <CommandProvider>
                <HighlightsProvider>
                  <Layout>
                    <DensityRootWrapper>{props.children}</DensityRootWrapper>
                  </Layout>
                </HighlightsProvider>
              </CommandProvider>
            </ModelsProvider>
          </NotificationProvider>
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}

function DensityRootWrapper(props: ParentProps) {
  const settings = useSettings()

  const density = settings && settings.flags.get("ui.density_modes") ? settings.general.density() : undefined

  return (
    <div class="density-root" data-density={density}>
      <Show when={settings && !settings.general.dismissedWhatsNewPhase5()}>
        <WhatsNewPhase5Banner onDismiss={() => settings!.general.setDismissedWhatsNewPhase5(true)} />
      </Show>
      {props.children}
    </div>
  )
}

function WhatsNewPhase5Banner(props: { onDismiss: () => void }) {
  const language = useLanguage()
  const navigate = useNavigate()

  const openSettings = () => {
    navigate("/settings")
  }

  return (
    <div class="fixed top-0 left-0 right-0 z-50 bg-surface-3 border-b border-border-weak-base px-4 py-3 flex items-center gap-3 shadow-md">
      <div class="flex-1 min-w-0">
        <div class="text-13-medium text-text-strong">{language.t("whatsNew.phase5.title")}</div>
        <div class="text-12-regular text-text-weak truncate">{language.t("whatsNew.phase5.description")}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <Button size="small" variant="primary" onClick={openSettings}>
          {language.t("whatsNew.phase5.openSettings")}
        </Button>
        <Button size="small" variant="ghost" onClick={props.onDismiss}>
          {language.t("whatsNew.phase5.dismiss")}
        </Button>
      </div>
    </div>
  )
}

function SessionProviders(props: ParentProps) {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>{props.children}</CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}

function RouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
  return (
    <AppShellProviders>
      {props.appChildren}
      {props.children}
    </AppShellProviders>
  )
}

export function AppBaseProviders(props: ParentProps) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider>
        <LanguageProvider>
          <UiI18nBridge>
            <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
              <DialogProvider>
                <MarkedProviderWithNativeParser>
                  <DiffComponentProvider component={Diff}>
                    <CodeComponentProvider component={Code}>{props.children}</CodeComponentProvider>
                  </DiffComponentProvider>
                </MarkedProviderWithNativeParser>
              </DialogProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.key} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
}) {
  function ResumeHandler() {
    const sdk = useGlobalSDK()
    const sync = useGlobalSync()

    const THRESHOLD_MS = 30_000
    const DEDUPE_MS = 1200 // 1.2s dedupe for bursts
    const REFRESH_THROTTLE_MS = 5_000 // don't refresh snapshot more than once per 5s

    let lastHandlerAt = 0
    let lastRefreshAt = 0

    const onResume = () => {
      try {
        const now = Date.now()
        if (now - lastHandlerAt < DEDUPE_MS) return
        lastHandlerAt = now

        if (typeof navigator !== "undefined" && !navigator.onLine) return

        // If we have a recent realtime event, skip reconnect/refresh
        if (sdk && typeof sdk.lastRealtimeAt === "function") {
          const last = sdk.lastRealtimeAt()
          if (now - last < THRESHOLD_MS) return
        }

        // Force reconnect of the event stream (idempotent)
        try {
          sdk?.forceReconnectIfStale?.(THRESHOLD_MS)
        } catch {
          // best-effort
        }

        // Refresh a lightweight snapshot only if we haven't refreshed recently
        if (now - lastRefreshAt > REFRESH_THROTTLE_MS) {
          lastRefreshAt = now
          // Use bootstrap() which is a safe refresh path; if you prefer a lighter
          // endpoint we can replace this with a /status call.
          void sync.bootstrap()
        }

        // Ask service worker to update (if present)
        try {
          void navigator.serviceWorker?.ready.then((r) => r.update?.()).catch(() => undefined)
        } catch {
          /* noop */
        }
      } catch {
        /* noop */
      }
    }

    onMount(() => {
      document.addEventListener("visibilitychange", onResume)
      window.addEventListener("focus", onResume)
      window.addEventListener("pageshow", onResume)
      window.addEventListener("online", onResume)
    })

    onCleanup(() => {
      document.removeEventListener("visibilitychange", onResume)
      window.removeEventListener("focus", onResume)
      window.removeEventListener("pageshow", onResume)
      window.removeEventListener("online", onResume)
    })

    return null
  }
  return (
    <ServerProvider defaultServer={props.defaultServer} servers={props.servers}>
      <ServerKey>
        <GlobalSDKProvider>
          <GlobalSyncProvider>
            <ResumeHandler />
            <Router
              root={(routerProps) => <RouterRoot appChildren={props.children}>{routerProps.children}</RouterRoot>}
            >
              <Route path="/" component={HomeRoute} />
              <Route path="/qlora" component={QLoRARoute} />
              <Route
                path="/updating"
                component={() => (
                  <Suspense fallback={<Loading />}>
                    <Updating />
                  </Suspense>
                )}
              />
              <Route path="/:dir" component={DirectoryLayout}>
                <Route path="/" component={SessionIndexRoute} />
                <Route path="/session/:id?" component={SessionRoute} />
              </Route>
            </Router>
          </GlobalSyncProvider>
        </GlobalSDKProvider>
      </ServerKey>
    </ServerProvider>
  )
}
