# Swarm Mode

Swarm Mode is a multi-agent coordination system for OpenHei that enables parallel task execution across multiple specialized agents. It orchestrates a team of AI agents, each working in isolated git worktrees, to accomplish complex goals.

## Overview

Swarm Mode transforms a single prompt into a coordinated team effort:

1. **Lead Agent** - Plans and coordinates the overall effort
2. **Worker Agents** - Implement assigned tasks in parallel
3. **Reviewer Agent** - Reviews and critiques work
4. **Security Agent** - Performs security hardening pass
5. **QA Agent** - Tests and validates functionality

## Usage

### Basic Command

```bash
openhei swarm "Build user onboarding flow with auth"
```

### Options

| Flag               | Alias | Description                     | Default            |
| ------------------ | ----- | ------------------------------- | ------------------ |
| `--mode`           | `-m`  | Orchestration mode              | `strict-hierarchy` |
| `--workers`        | `-w`  | Max workers (1-8)               | `6`                |
| `--keep-worktrees` |       | Keep worktrees after completion | `false`            |

### Orchestration Modes

- **strict-hierarchy** (default): Lead assigns tasks, Reviewer blocks merges
- **democracy**: Workers vote on approach
- **parallel-only**: Split work then merge, no debate
- **adversarial-duel**: Two workers implement same task, Reviewer picks

## Swarm Commands

### List

List all swarm runs:

```bash
openhei swarm list
```

Shows all runs with their goal, status, mode, and creation time. Most recent runs are shown first.

### Status

Check the status of a swarm run:

```bash
openhei swarm status [runId]
```

If no runId is provided, shows the latest run.

### Tail Logs

View logs from swarm agents:

```bash
openhei swarm tail <runId> [agentId]
```

### Stop

Stop a running swarm and cleanup:

```bash
openhei swarm stop <runId>
```

## Directory Layout

Swarm creates the following directory structure:

```
.openhei/swarm/runs/<run_id>/
├── SWARM_STATE.json      # Machine-readable state
├── SWARM_TASKS.md        # Human-readable task board
├── PR_DRAFT.md           # Generated PR draft
├── journal.jsonl         # Event journal
├── logs/
│   ├── lead-0.log
│   ├── worker-0.log
│   ├── worker-1.log
│   └── ...
├── worktrees/
│   ├── worker-0/         # Isolated worktree
│   ├── worker-1/
│   └── ...
└── integration/          # Integration worktree
```

## Safety Rails

Swarm enforces hard gates before merging:

1. **Per-task gates**: Each worker must pass lint/test/typecheck before their work can be merged
2. **Integration gates**: After merging, full gates run again on the integration worktree
3. **Fail-closed**: If gates fail, the task is marked blocked and escalated

### Gate Configuration

Configure which gates to run:

```yaml
gates:
  - lint
  - test
  - typecheck
```

## Configuration

Create `.openhei/swarm/config.yaml` in your project or `~/.config/openhei/swarm.yaml`:

```yaml
max_workers: 6
mode: strict-hierarchy
lead_model: anthropic/claude-sonnet
worker_model: anthropic/claude-haiku
gates:
  - lint
  - test
  - typecheck
timeout: 600000 # 10 minutes per task
keep_worktrees: false
```

### Config Precedence (highest to lowest)

1. CLI flags
2. Project config (`.openhei/swarm/config.yaml`)
3. Global config (`~/.config/openhei/swarm.yaml`)

## How It Works

### Execution Flow

1. **Initialization**: Create run directory and worktrees
2. **Planning Phase**: Lead agent breaks down goal into tasks
3. **Assignment**: Tasks assigned to workers based on mode
4. **Execution**: Workers implement in isolated worktrees
5. **Gates**: Each worker must pass gates before merge
6. **Merge**: Coordinator cherry-picks into integration worktree
7. **Debate**: Conflicts trigger debate rounds (max 2)
8. **Final Gates**: Full gates on integration result
9. **Artifacts**: Generate PR_DRAFT.md

### Worktree Isolation

Each worker operates in its own git worktree:

- Prevents file conflicts
- Enables parallel execution
- Allows safe experimentation

### Single-Writer State

Only the coordinator writes canonical state files:

- `SWARM_STATE.json` - Machine state
- `SWARM_TASKS.md` - Human task board
- Workers communicate via events

## Troubleshooting

### Swarm Stuck

Check status:

```bash
openhei swarm status <runId>
```

View logs:

```bash
openhei swarm tail <runId>
```

Stop if needed:

```bash
openhei swarm stop <runId>
```

### Gates Failing

Check gate output in worktree logs. Common issues:

- Lint errors in code
- Test failures
- TypeScript errors

### Worktree Issues

If worktrees get corrupted:

```bash
openhei swarm stop <runId>
```

This will clean up worktrees.

## Examples

### Simple Feature

```bash
openhei swarm "Add a login button to the header"
```

### Complex Task

```bash
openhei swarm "Implement user authentication with OAuth2" --workers 8
```

### Specific Mode

```bash
openhei swarm "Refactor the API" --mode democracy
```

## Security Notes

- Workers can only write in their assigned worktree
- API keys are never logged (redacted patterns: `*_TOKEN`, `*_KEY`)
- Credential files use `0600` permissions
