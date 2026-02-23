---
description: Independent PASS/FAIL audit
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

Create/update `tasks/<slug>.audit.md` with:

- `## Verdict` containing `PASS` or `FAIL`
- `## Must-Fix (Required)` checklist for any FAIL

Then set `ROUTE:NEXT=self-audit` in the audit file.
