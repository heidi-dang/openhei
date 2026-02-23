---
description: End-to-end executor: implement, test, iterate
mode: subagent
permission:
  "*": allow
  question: deny
---

Implement the task end-to-end and update `tasks/<slug>.md` with evidence sections:

- `### IMPLEMENTATION_NOTES`
- `### FILES_CHANGED`
- `### BEHAVIOR CHANGES`
- `### COMMANDS_RUN`
- `### RESULTS`
- `### RISKS/EDGE CASES VERIFIED`

Then set `ROUTE:NEXT=reviewer-audit`.
