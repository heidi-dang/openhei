# PWA (Installable Web App)

OpenHei’s web UI (`packages/app`) includes a minimal Progressive Web App setup:

- `packages/app/public/manifest.webmanifest`
- `packages/app/public/service-worker.js`

## HTTPS requirement

Browser install prompts require a **secure context**:

- ✅ `https://...` (recommended)
- ✅ `http://localhost` (allowed)
- ❌ plain `http://<ip>` (not installable)

## What is cached

The service worker caches only static UI assets (HTML/CSS/JS/icons) using a stale-while-revalidate strategy.

- API/auth responses are not cached (`/api`, `/global`, etc.).

## Stuck / Not Updating?

If the installed app doesn't reflect the latest changes:

### 1. Test in Private Mode

Open the URL in a **Private/Incognito tab**. If it works correctly, the issue is cached state on your device.

### 2. Clear Service Worker & Caches

In the browser console:

```javascript
;(async () => {
  const regs = await navigator.serviceWorker.getRegistrations()
  for (const r of regs) await r.unregister()
  const keys = await caches.keys()
  await Promise.all(keys.map((k) => caches.delete(k)))
  location.reload()
})()
```

### 3. iOS Safari Specific

If using A2HS (Add to Home Screen):

1. **Remove from Home Screen**: Long press icon → Remove
2. **Clear Website Data**: Settings → Safari → Advanced → Website Data → Remove openhei data
3. **Re-add to Home Screen**: Visit URL → Share → Add to Home Screen

### 4. Check for Debug Tools

Disable any Safari extensions or bookmarklets that inject console tools (like Eruda), as they can cause runtime errors.
