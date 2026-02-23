# OpenHei Architecture (User View)

OpenHei has two main parts:

1. The Dashboard (Web UI) - what you see in the browser
2. The OpenHei Server - does the work (models, sessions, tools) and streams updates back to the UI

## High-level diagram

```text
You (Browser / Desktop)
        |
        |  1) Load UI snapshot (fast startup)
        |  2) Realtime stream (live updates)
        v
OpenHei Dashboard (Web UI)
        |
        | Typed API requests (safe + predictable)
        v
OpenHei Server (Backend)
        |
        | Calls models + tools + integrations
        v
Providers / Tools / GitHub / MCP
```

---

# What happens when you use OpenHei

## A) When you open the Dashboard

Before: the UI had to make many small requests to load everything.
Now (v2): the UI loads a single snapshot of what it needs and becomes usable faster.

What you feel:

- Faster startup
- Faster switching projects/directories
- Less "loading..." flicker

## B) When you send a prompt

OpenHei:

1. shows your message immediately
2. streams the assistant response in realtime

Before: the UI sometimes did extra sync requests even when streaming was healthy.
Now (v2): the UI only syncs if it must (connection issues or missing updates).

What you feel:

- Faster "send -> response starts"
- Fewer duplicate refreshes
- Less jitter after you press Enter

## C) While the assistant is streaming

Now (v2): the server sends batched, efficient updates and the UI applies them smoothly.

What you feel:

- Smoother streaming
- Less stutter on long answers
- Better performance on slower devices

## D) If your connection drops

Now (v2): the UI can reconnect and resume from where it left off (replays missed updates when possible).

What you feel:

- Fewer "weird states" after reconnect
- Less chance of missing message chunks
- More reliable sessions on unstable networks

---

# What's new in v2 (why it's faster)

## 1) Snapshots (fewer requests)

The UI loads data using one or two snapshot calls instead of many separate calls.

Benefit:

- Less network overhead
- Faster time-to-usable UI

## 2) Cursor-based replay (better reconnect)

The server includes a cursor with updates so the UI can request "everything since X".

Benefit:

- Smooth reconnect
- Less full refresh / reloading

## 3) Batching & coalescing (smoother streaming)

Instead of sending many tiny updates, v2 groups updates into efficient batches.

Benefit:

- Less CPU usage
- Less browser main-thread work
- Better streaming feel

## 4) Smart fallback sync (reliability without extra work)

If streaming is working, the UI avoids extra sync calls.
If streaming fails or gaps appear, it triggers a recovery sync automatically.

Benefit:

- Keeps reliability
- Avoids unnecessary overhead

---

# What users get (practical benefits)

- Faster startup / project switching
- Faster "send -> response starts"
- Smoother streaming
- Better reconnection reliability
- Lower CPU / better battery in longer sessions

---

# Backwards compatible (v1 still works)

If v2 isn't available for any reason, OpenHei can fall back to v1 behavior so the UI still works.
