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
