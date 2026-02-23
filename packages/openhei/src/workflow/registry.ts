export namespace WorkflowRegistry {
  export const Names = ["planner", "workflow-runner", "runner", "autocoder", "reviewer-audit", "self-audit"] as const
  export type Name = (typeof Names)[number]

  export function isName(input: string): input is Name {
    return (Names as readonly string[]).includes(input)
  }
}
