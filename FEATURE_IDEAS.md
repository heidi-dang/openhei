# Architectural Feature Ideas for OpenHei

Based on the target areas (Web/PWA UX, Agent Reliability, and debugging) and the specific pain points (silent failures, provider flakiness, streaming UX, state recovery), here are 3 complex, architectural feature ideas for OpenHei.

These are designed to be "20% architectural" projects (larger changes, implemented behind feature flags) that fundamentally improve the resilience and debuggability of the platform.

---

## 1. Resilient Provider Fallback & Circuit Breaker System

**Target Area:** Agent Capability & Reliability
**Pain Points Addressed:** Provider flakiness, "thinking then stops", silent failures.

**The Concept:**
Currently, when a model provider (like OpenRouter, OpenAI, or a local model) experiences latency spikes, rate limits, or 500 errors, the agent might hang or fail silently, leaving the user staring at a blank screen.

This feature introduces an intelligent **Circuit Breaker and Cascading Fallback Manager** at the network layer (`packages/openhei/src/provider/`).

**How it works:**
1. **Health Tracking (Circuit Breaker):** Monitor provider error rates and latency in real-time. If a provider (e.g., OpenRouter) fails 3 times in a row, the circuit "opens" to prevent further immediate failures.
2. **Cascading Fallbacks:** Allow users to configure a prioritized list of fallback models. If the primary model fails or times out, the system automatically catches the exception and transparently retries the exact same prompt against the next model in the fallback chain.
3. **User Transparency:** During a fallback event, the Web/PWA UI displays a toast or inline terminal badge: _"OpenRouter timeout. Retrying with Claude 3.5 Sonnet..."_ preventing the illusion that the app has "stopped thinking".

**Implementation Strategy (Behind Flag `ENABLE_PROVIDER_FALLBACKS`):**
* Extract the HTTP request logic in the provider SDKs to pass through a centralized `ResilienceManager`.
* Add configuration options to `package.json` / user settings for fallback arrays.
* Expose provider health metrics to the Web App via a new WebSocket/SSE event type so the frontend can react visually.

---

## 2. Event-Sourced Session Recovery & Time-Travel Debugging

**Target Area:** State Recovery & Debuggability
**Pain Points Addressed:** Stale session recovery, hard-to-know request failures, test flakiness.

**The Concept:**
State in AI chats (especially with tool execution and multi-step agent plans) is notoriously fragile. If the backend restarts, the mobile Safari browser drops the WebSocket, or the user refreshes mid-generation, the session state is often lost or desynced.

This feature transitions the agent interaction model to an **Event-Sourced Architecture**.

**How it works:**
1. **Append-Only Event Log:** Instead of destructively updating session state in the SQLite database, every action (User Prompt, Tool Invocation, Tool Result, Provider Token Chunk, Error Received) is written to an append-only event stream table.
2. **Deterministic Rehydration:** When a user reconnects (e.g., waking up their iPhone Safari PWA), the backend replays the event log to perfectly reconstruct the exact state of the agent, even if it was mid-tool-execution.
3. **Time-Travel Debugging (Admin UX):** Because every state change is an event, developers can build a "Debug View" in the dashboard. They can scrub backwards in time to see exactly what context was sent to the provider right before a silent failure occurred, making debugging provider issues trivial.

**Implementation Strategy (Behind Flag `ENABLE_EVENT_SOURCING`):**
* Modify the `Database.use()` patterns in `packages/openhei` to write to a new `SessionEvents` table.
* Implement a state reducer that builds the current `Session` object by reducing the event log.
* Add a "Sync" endpoint that allows the frontend to request events since a specific cursor, fixing PWA reconnection desyncs.

---

## 3. Real-time Agent Telemetry & "X-Ray" Execution Dashboard

**Target Area:** Web App Dashboard & Streaming UX
**Pain Points Addressed:** No clear activity transcript, silent failures, hard to know what endpoint failed.

**The Concept:**
When the "general" or "build" agent is working on a complex multi-step task, the user often sees a spinner or generic "thinking" state. If the agent gets stuck in a loop or fails on a specific bash command, the user is blind to it until the entire operation times out.

This feature introduces an **"X-Ray" Telemetry Dashboard** overlay to the web app.

**How it works:**
1. **Granular Telemetry Stream:** The backend emits detailed, deterministic lifecycle events for every agent sub-action via WebSocket:
   * `agent:plan_created`
   * `tool:bash_started (command: npm install)`
   * `tool:bash_stdout (chunk: ...)`
   * `provider:request_started (model: gpt-4o, tokens: 4052)`
2. **X-Ray Panel (Web UX):** In the web app, users can toggle open an "X-Ray" side panel (designed to be mobile-friendly/bottom-sheet on PWA). This panel streams a real-time, terminal-like transcript of exactly what the agent is doing under the hood.
3. **Actionable Errors:** If an agent fails, the X-Ray panel highlights the exact node in the execution tree that failed (e.g., _"Failed at Tool: read_file ('src/missing.ts') - File not found"_), eliminating the mystery of "silent failures".

**Implementation Strategy (Behind Flag `ENABLE_XRAY_TELEMETRY`):**
* Instrument the centralized `SessionPrompt.invokeTool` and provider request streams to emit standardized telemetry JSON objects.
* Build a SolidJS component in `packages/app` that subscribes to this telemetry stream and renders an interactive timeline/log view.
* Ensure the layout respects mobile Safari safe-areas and uses `h-dvh` to prevent keyboard overlap issues (as noted in memory).