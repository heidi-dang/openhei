# Audit All Changes, Ensure No Bugs, Promote to Main (e4fdccb6)

## Context

This repo’s default branch is `dev`. The request says “push into main”, but `main` may or may not exist locally or on `origin`.

Deterministic branch resolution:

- If `refs/remotes/origin/main` exists: promotion target is `main`.
- Else: promotion target is `dev` (treat “main” as the default branch in this repo).

## Scope

- Audit the full diff between `origin/dev` and the resolved promotion target.
- Verify builds/tests/lint for the code being promoted (monorepo-safe; do not run tests from repo root if guarded).
- Promote by merging `origin/dev` into the promotion target and pushing to `origin` (no force-push).

### 1) Goal

Audit every change, ensure no bugs, then promote the audited changes into the resolved target branch and push to `origin`.

### 2) Non-Goals

- No unrelated feature work or refactors.
- No history rewrites on shared branches (no force-push).
- No dependency upgrades unless required to fix a regression in the audited change set.

### 3) Constraints

- Security: scrutinize auth/permissions/network/publish/install scripts; do not leak secrets.
- Git safety: non-destructive promotion; no force-push.
- Testing: repo root tests are guarded; run tests from package directories.

### 4) Plan

1. Resolve promotion target deterministically
   - `git fetch --all --prune --tags`
   - `git show-ref --verify --quiet refs/remotes/origin/main && TARGET=main || TARGET=dev`
2. Audit the full change set to be promoted
   - Review `git log` and `git diff` between `origin/${TARGET}` and `origin/dev`.
3. Verify builds/tests
   - Run package build/lint/test from package directories for impacted packages.
4. Promote and push
   - If `TARGET=main`: merge `origin/dev` → `main`, push `origin/main`.
   - If `TARGET=dev`: ensure `dev` contains the audited commits, push `origin/dev`.
5. Post-push verification
   - Confirm `origin/${TARGET}` points to the expected commit and CI is green (if available).

### 5) Acceptance Criteria

- Branch resolution is applied exactly:
  - If `origin/main` exists, target is `main`; otherwise target is `dev`.
- The full diff intended for promotion is reviewed and contains no unexpected/suspicious changes.
- Verification (build/lint/tests as configured per-package) passes on the promoted code.
- Promotion push is non-destructive:
  - No force-push.
  - `origin/${TARGET}` contains the audited changes and matches the expected merge result.

### 6) Verification Commands

- Determine target:
  - `git fetch --all --prune --tags`
  - `git show-ref --verify --quiet refs/remotes/origin/main && echo TARGET=main || echo TARGET=dev`
- Audit diff (replace `TARGET` accordingly):
  - `git log --oneline --decorate --graph origin/TARGET..origin/dev`
  - `git diff --stat origin/TARGET..origin/dev`
  - `git diff origin/TARGET..origin/dev`
- Package verification (run inside each relevant package dir):
  - `bun install`
  - `bun run build` (if present)
  - `bun run lint` (if present)
  - `bun run test` (if present)

### 7) Rollback

- If a merge commit was pushed and must be undone: revert the merge (no history rewrite).
- If a fast-forward must be undone: do not force-push; create a revert/fix commit.

ROUTE:NEXT=workflow-runner
