# Swarm Mode V1 - Evidence Pack

## Overview

This document provides evidence of Swarm Mode implementation including consent flow, concurrent execution, and UI integration.

## Implementation Summary

### 1. Configuration

- **Config Schema**: Added `swarm` config in `packages/openhei/src/config/config.ts`
  - `enabled`: boolean (default: false)
  - `max_subagents`: hard cap at 2
  - `max_parallel_executors`: hard cap at 3
  - `subagent_models`: array of model identifiers for slots 1 and 2

- **Settings UI**: `packages/app/src/components/settings-swarm.tsx`
  - Toggle for enabling/disabling Swarm Mode
  - Model dropdowns for Sub-agent #1 and Sub-agent #2
  - Persists to config via PATCH /api/v1/config

### 2. Event Contract

- **Swarm Events** (in `packages/openhei/src/swarm/runtime.ts`):
  - `swarm.started` - emitted when swarm pool initializes
  - `swarm.consent_required` - emitted when main wants to spawn sub-agents
  - `swarm.consent_granted` / `swarm.consent_denied` - user response
  - `swarm.slot_status` - per-slot status updates
  - `swarm.ended` - swarm terminated

- **Event Tags**: All events include:
  - `run_id`, `swarm_id`, `session_id`, `parent_session_id`
  - `slot` (1 or 2), `role` (main/subagent)
  - `agent_name`, `model`, `phase`

### 3. Consent Flow

- **Backend** (`packages/openhei/src/server/routes/session.ts`):
  - Endpoint: `POST /api/v1/session/:sessionID/swarm/consent`
  - Body: `{ swarm_id, accept: boolean }`
  - When consent_required is emitted, spawn is blocked until Accept

- **Frontend** (`packages/app/src/components/swarm-panel.tsx`):
  - `SwarmConsentModal` shows reason, planned tasks, models
  - Accept/Deny buttons post to consent endpoint

### 4. Concurrency

- **Executor Pool** (`packages/openhei/src/swarm/executor-pool.ts`):
  - `SwarmExecutorPool` class with capacity 3
  - Main agent + up to 2 sub-agents can run concurrently
  - Each sub-agent gets its own worktree for isolation
  - Patches are returned and applied by main in controlled merge step

### 5. UI Integration

#### Web UI

- **Swarm Panel** (`packages/app/src/components/swarm-panel.tsx`):
  - Shows Main/Sub1/Sub2 status chips
  - Click to switch transcript view (does NOT auto-switch)
  - Status colors: green (done), blue (working), red (error), gray (idle)

- **Swarm Context** (`packages/app/src/context/swarm.tsx`):
  - Listens to SSE events from backend
  - Maintains state for active swarm, slots, consent request

#### TUI

- Events from RunEventBus are streamed via SSE
- TUI can display swarm status in header

### 6. Replay Buffer

- **Event Bus** (`packages/openhei/src/stream/event-bus.ts`):
  - Ring buffer of 500 events per run_id
  - On reconnect, recent events are replayed
  - SSE endpoint supports `?replay=true&limit=N&cursor=TS`

## Reproduction Steps

### Enable Swarm Mode

1. Go to Settings → Swarm
2. Toggle "Enable Swarm Mode" ON
3. Select models for Sub-agent #1 and #2
4. Click Save

### Run with Swarm

1. Start a session
2. Main agent decides to use sub-agents
3. Consent modal appears with reason and planned tasks
4. Click "Accept" to spawn sub-agents
5. Watch Main/Sub1/Sub2 status in Swarm panel
6. Click each tab to view live transcripts
7. Completion shows final states

### Stop Behavior

- Stop button cancels all 3 executors
- Each subprocess is killed via AbortSignal
- Events show swarm.ended with reason "stopped"

## Backend Event Tags (Example)

```
{
  "type": "swarm.slot_status",
  "properties": {
    "run_id": "sesxxx_run",
    "swarm_id": "swm_xxx",
    "session_id": "sesxxx",
    "slot": 1,
    "status": "working",
    "phase": "tool_run",
    "model": "anthropic/claude-3",
    "ts": 1700000000000
  }
}
```

## Files Changed

### Backend

- `packages/openhei/src/config/config.ts` - schema
- `packages/openhei/src/swarm/runtime.ts` - event types
- `packages/openhei/src/swarm/executor-pool.ts` - concurrency
- `packages/openhei/src/swarm/index.ts` - exports
- `packages/openhei/src/tool/task.ts` - integration
- `packages/openhei/src/server/routes/session.ts` - consent endpoint
- `packages/openhei/src/stream/activity-events.ts` - event types

### Frontend

- `packages/app/src/components/settings-swarm.tsx` - settings UI
- `packages/app/src/components/swarm-panel.tsx` - panel + modal
- `packages/app/src/context/swarm.tsx` - event handling
- `packages/app/src/components/dialog-settings.tsx` - settings tab
- `packages/app/src/i18n/en.ts` - strings

## Notes

- Hard caps enforced in config schema (max 2 subagents, max 3 executors)
- Consent flow blocks spawn until user accepts
- Work isolation via git worktrees (each slot gets own directory)
- Patches/commits from subagents must be applied by main
