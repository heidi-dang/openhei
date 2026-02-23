export namespace WorkflowArtifact {
  const plan = {
    scope: /^##\s+Scope\b/m,
    goal: /^###\s+1\)\s+Goal\b/m,
    nong: /^###\s+2\)\s+Non-Goals\b/m,
    constraints: /^###\s+3\)\s+Constraints\b/m,
    steps: /^###\s+4\)\s+Plan\b/m,
    accept: /^###\s+5\)\s+Acceptance\s+Criteria\b/m,
    verify: /^###\s+6\)\s+Verification\s+Commands\b/m,
    rollback: /^###\s+7\)\s+Rollback\b/m,
  } as const

  export function missingPlan(text: string) {
    const missing: string[] = []
    if (!plan.scope.test(text)) missing.push("scope")
    if (!plan.goal.test(text)) missing.push("goal")
    if (!plan.nong.test(text)) missing.push("non-goals")
    if (!plan.constraints.test(text)) missing.push("constraints")
    if (!plan.steps.test(text)) missing.push("plan")
    if (!plan.accept.test(text)) missing.push("acceptance")
    if (!plan.verify.test(text)) missing.push("verification")
    if (!plan.rollback.test(text)) missing.push("rollback")
    return missing
  }

  const evidence = {
    impl: /^###\s+IMPLEMENTATION_NOTES\b/m,
    files: /^###\s+FILES_CHANGED\b/m,
    cmd: /^###\s+COMMANDS_RUN\b/m,
    results: /^###\s+RESULTS\b/m,
    risks: /^###\s+RISKS\/EDGE\s+CASES\s+VERIFIED\b/m,
    behavior: /^###\s+BEHAVIOR\s+CHANGES\b/m,
  } as const

  export function missingEvidence(text: string, kind: "runner" | "autocoder") {
    const missing: string[] = []
    if (!evidence.impl.test(text)) missing.push("IMPLEMENTATION_NOTES")
    if (!evidence.files.test(text)) missing.push("FILES_CHANGED")
    if (kind === "autocoder" && !evidence.behavior.test(text)) missing.push("BEHAVIOR CHANGES")
    if (!evidence.cmd.test(text)) missing.push("COMMANDS_RUN")
    if (!evidence.results.test(text)) missing.push("RESULTS")
    if (!evidence.risks.test(text)) missing.push("RISKS/EDGE CASES VERIFIED")
    return missing
  }

  export function verdict(text: string): "PASS" | "FAIL" | undefined {
    const m = text.match(/^##\s+Verdict\s*\n\s*(PASS|FAIL)\b/m)
    return m?.[1] as "PASS" | "FAIL" | undefined
  }

  export function final(text: string): "PASS" | "FAIL" | undefined {
    const m = text.match(/^FINAL=(PASS|FAIL)\b/m)
    return m?.[1] as "PASS" | "FAIL" | undefined
  }

  export function mustFix(text: string) {
    const start = text.indexOf("## Must-Fix (Required)")
    if (start == -1) return []

    const tail = text.slice(start)
    const first = tail.indexOf("\n")
    const rest = first === -1 ? "" : tail.slice(first + 1)
    const next = rest.search(/^##\s+/m)
    const body = (next === -1 ? rest : rest.slice(0, next))
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.startsWith("-"))
    return body
  }
}
