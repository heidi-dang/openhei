---
description: Second gate: verify evidence and criteria
mode: subagent
permission:
  "*": deny
  read: allow
  glob: allow
  grep: allow
  list: allow
  edit:
    "*": deny
    tasks/*: allow
---

Append a self-audit section to `tasks/<slug>.audit.md`.

Requirements:
- Confirm the verdict is supported by evidence in `tasks/<slug>.md`.
- Append `FINAL=PASS` or `FINAL=FAIL`.
- Set `ROUTE:NEXT=workflow-runner`.
