# Web UI Performance Report

Date: 2026-02-24

## Summary

This change set focuses on improving perceived responsiveness during chat streaming, reducing initial JS work for heavy features, and fixing a mobile UX regression.

Key outcomes:

- Smoother streaming: fewer UI updates per second during long generations.
- Faster initial load: heavy diff/code rendering is now lazy-loaded.
- Better mobile usability: right-edge tap targets no longer get blocked by an invisible scrollbar overlay.
- Reasoning summaries: moved into their own scroll container to avoid fighting the main chat timeline scroll.

## Changes Implemented

### Streaming Smoothness

- Coalesce `message.part.delta` SSE events per frame and merge deltas before dispatch.
  - Reduces Solid store writes and layout churn when the backend emits many small deltas.
- Adaptive throttling for markdown rendering:
  - Short text updates remain responsive.
  - Large text streams update less frequently to keep scrolling/typing smooth.

### Bundle / Load Time

- Lazy-load `@openhei-ai/ui/diff` and `@openhei-ai/ui/code`.
  - These components are heavy and not required for the first paint.
- Split `@pierre/diffs` into a dedicated chunk to improve caching behavior.

### Mobile UX Fix

- Make the scroll thumb overlay non-interactive unless visible.
  - Prevents invisible hit-testing from stealing taps near the right edge on iOS.

### Reasoning Summaries UX

- Wrap reasoning summary markdown in a dedicated scroll box.
  - Keeps the main timeline scroll independent from the reasoning content scroll.

### OAuth Login on Mobile/Remote

OpenAI “browser” OAuth login uses a fixed redirect to `http://localhost:1455/auth/callback`.

When logging in from a different device (mobile/remote), this redirects to **the device’s** localhost, causing an immediate 404.

Mitigation implemented:

- When connecting the `openai` provider from a non-localhost Web UI, selecting the “browser” method is blocked and the UI guides users to the “headless” (device code) method.

## Build Snapshot (Vite)

From a production build of `packages/app`:

- `vendor` remains the largest chunk (dominating parse/compile time).
- Lazy chunks are present:
  - `diff` (~9 KB)
  - `code` (~15 KB)
  - `diffs` (~270 KB)

Next step (not included here): further isolate syntax highlighting (Shiki) and markdown tooling to reduce the baseline `vendor` chunk.

## Risk Assessment

- Service worker caching is asset-only and explicitly avoids API/auth paths.
- OAuth headless/device-code flow is recommended for mobile/remote to avoid redirect-to-localhost failures.
