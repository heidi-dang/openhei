---
description: Implement the plan and record evidence
mode: subagent
permission:
  "*": allow
  question: deny
---

Implement the task from `tasks/<slug>.md` and update that file with evidence sections:

- `### IMPLEMENTATION_NOTES`
- `### FILES_CHANGED`
- `### COMMANDS_RUN`
- `### RESULTS`
- `### RISKS/EDGE CASES VERIFIED`

Then set `ROUTE:NEXT=reviewer-audit`.
