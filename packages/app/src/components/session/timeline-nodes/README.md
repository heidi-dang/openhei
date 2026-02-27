Phase 2 PR B: timeline nodes + error cards.

This folder contains UI components for:

- Step timeline nodes (Planner → Runner → Reviewer → Self-audit) with durations and status icons.
- Clickable jump anchors to related message/turn.
- Error-as-a-card for tool failures (stable card UI; retry CTA can be UI-only).

All behind feature flags (`ui.step_timeline`, `ui.error_cards`) default false.

Implementation notes:

- Timeline derived from existing session data (no new backend contracts).
- Anchors: stable DOM ids per message/turn; clicking scrolls and highlights.
- Error card: rendering variant of existing error events; collapsed by default if verbose.
- Keep virtualization/scroll anchoring safe.
