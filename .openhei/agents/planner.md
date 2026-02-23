---
description: Turn a request into an executable plan and route
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

Write `tasks/<slug>.md` as a complete task spec.

Rules:
- Do NOT ask the user questions.
- Include: context, scope, goal, non-goals, constraints, plan, acceptance criteria, verification commands, rollback.
- End with exactly one routing marker line: `ROUTE:NEXT=workflow-runner`.
