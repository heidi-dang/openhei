Phase 5 - Foundations

This small doc summarizes the Phase 5 foundations work (P5-1). It is intentionally
short and non-prescriptive: the goal is hygiene and guardrails around feature
flags and docs, without behavioral changes.

Scope

- flags hygiene only (no behavior changes)
- short note for Phase 5 foundations
- small guardrails: a lightweight unit test ensuring all flags default to OFF

Acceptance

- branch created from latest main (fast-forward)
- all flags default OFF in DEFAULT_SETTINGS
- typecheck/tests/build pass

Notes

- Keep feature flags OFF by default. Tests should assert defaults rather than
  assume a stateful environment.
