import { Button } from "@openhei-ai/ui/button"
import { Icon } from "@openhei-ai/ui/icon"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"

type Prompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const dismissedKey = "openhei.pwa.install.dismissed.v1"

const getDismissed = () => {
  try {
    return localStorage.getItem(dismissedKey) === "1"
  } catch {
    return false
  }
}

const setDismissed = () => {
  try {
    localStorage.setItem(dismissedKey, "1")
  } catch {
    return
  }
}

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone

const ios = () => /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())

export function Pwa() {
  const [prompt, setPrompt] = createSignal<Prompt | null>(null)
  const [dismissed, setDismissedState] = createSignal(getDismissed())
  const [offline, setOffline] = createSignal(!navigator.onLine)
  const installable = createMemo(() => !standalone() && !dismissed() && (prompt() !== null || ios()))

  onMount(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as Prompt)
    }

    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    onCleanup(() => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    })
  })

  const close = () => {
    setDismissed()
    setDismissedState(true)
  }

  const install = async () => {
    const e = prompt()
    if (!e) return
    await e.prompt()
    const result = await e.userChoice
    setPrompt(null)
    if (result.outcome === "accepted") return
    close()
  }

  return (
    <>
      <Show when={offline()}>
        <div class="fixed top-10 left-0 right-0 z-50">
          <div class="mx-auto w-fit px-3 py-1.5 rounded-full bg-background-strong text-text-strong shadow-sm-border-base flex items-center gap-2">
            <Icon name="warning" class="size-4 text-icon-critical-base" />
            <span class="text-12-medium">Offline</span>
          </div>
        </div>
      </Show>

      <Show when={installable()}>
        <div class="fixed left-3 right-3 bottom-3 z-50">
          <div class="max-w-[720px] mx-auto rounded-xl bg-background-strong shadow-lg-border-base border border-border-weak-base p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div class="flex-1 text-text-strong text-12-regular">
              <div class="text-12-medium">Install OpenHei</div>
              <div class="text-text-base">
                <Show when={prompt() !== null} fallback={<span>On iOS: Share → Add to Home Screen.</span>}>
                  <span>Install the app for faster access and full-screen mode.</span>
                </Show>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="small" onClick={close}>
                Not now
              </Button>
              <Show when={prompt() !== null}>
                <Button size="small" onClick={() => void install()}>
                  Install
                </Button>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
