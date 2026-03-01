/* eslint-disable */
// Minimal, asset-only service worker.
// - Caches only same-origin static assets + UI shell
// - Never caches API/auth responses

const version = "openhei-pwa-2026-02-24"
const cache = `${version}:assets`

const precache = [
  "/",
  "/manifest.webmanifest",
  "/icons/openhei-192.png",
  "/icons/openhei-512.png",
  "/icons/openhei-512-maskable.png",
]

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches
      .open(cache)
      .then((c) => c.addAll(precache))
      .catch(() => undefined),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith("openhei-pwa-") && key !== cache).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

const bypass = (path) =>
  path.startsWith("/api") ||
  path.startsWith("/global") ||
  path.startsWith("/auth") ||
  path.startsWith("/session") ||
  path.startsWith("/ws")

const asset = (request) => {
  if (request.mode === "navigate") return false
  const type = request.destination
  if (type === "script" || type === "style" || type === "image" || type === "font" || type === "manifest") return true
  return false
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (bypass(url.pathname)) return

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request)
          const c = await caches.open(cache)
          void c.put("/", res.clone())
          return res
        } catch {
          const cached = await caches.match("/")
          if (cached) return cached
          throw new Error("offline")
        }
      })(),
    )
    return
  }

  if (!asset(request)) return

  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      const fetcher = fetch(request)
        .then(async (res) => {
          const c = await caches.open(cache)
          void c.put(request, res.clone())
          return res
        })
        .catch(() => undefined)

      if (cached) {
        void fetcher
        return cached
      }

      const res = await fetcher
      if (res) return res
      throw new Error("offline")
    })(),
  )
})
