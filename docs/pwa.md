# PWA (Installable Web App)

OpenHei's web UI (`packages/app`) includes a minimal Progressive Web App setup:

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

## Troubleshooting

### UI stuck / half screen

If the UI becomes stuck, displays incorrectly, or shows only half the screen:

1. **Unregister the Service Worker:**
   - Open DevTools (F12) → Application → Service Workers
   - Click "Unregister" for `service-worker.js`

2. **Clear caches:**
   - DevTools → Application → Storage → Check all boxes → "Clear site data"
   - Or manually: `localStorage.clear()` and `sessionStorage.clear()` in console

3. **Remove and re-add the app (A2HS):**
   - iOS: Tap Share → "Remove from Home Screen", then visit again and "Add to Home Screen"
   - Android: Tap menu → "Install App" (or "Add to Home Screen"), then uninstall via system settings and reinstall

4. **Hard refresh:**
   - iOS: Long-press refresh → "Empty Cache and Hard Reload" (requires devtools enabled)
   - Android: Chrome menu → "Empty cache" + "Hard reload"

### Verify build ID

To verify you're running the correct build version:

1. **In the UI:**
   - Click the status indicator in the sidebar (shows server connection status)
   - Look for the "Debug" tab to see Build ID, Git SHA, and Build Time

2. **Via API endpoint:**
   ```bash
   curl http://localhost:4096/global/debug
   ```
   Returns JSON with:
   - `buildId`: Version string
   - `gitSha`: Git commit SHA (if available)
   - `buildTime`: ISO timestamp (if available)
   - `version`: Same as buildId
   - `channel`: "latest", "dev", or "local"
