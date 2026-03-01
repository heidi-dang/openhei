Phase 2 tooling: UI-only scaffolding for tool/action cards and timeline polish.

This folder will contain components implementing:

- Collapsed tool/action cards with header (icon + name + status + duration)
- Lazy-expanded body showing inputs/outputs with truncation and "Show more"
- Timeline nodes for steps (Planner → Runner → Reviewer → Self-audit)

Files are intentionally small and behind feature flags (`ui.tool_cards`, `ui.step_timeline`, `ui.error_cards`).
