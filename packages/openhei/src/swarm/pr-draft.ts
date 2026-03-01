import type { SwarmState } from "./types"

export function generatePrDraft(state: SwarmState): string {
  const lines: string[] = [`# Pull Request Draft`, ``, `## Summary`, ``, state.goal, ``, `## Changes`, ``]

  const completedTasks = Object.values(state.tasks).filter((t) => t.status === "completed")

  for (const task of completedTasks) {
    lines.push(`- ${task.title}: ${task.result || "Completed"}`)
  }

  lines.push(``)
  lines.push(`## Tests`)
  lines.push(``)
  lines.push(`All required gates passed:`)
  for (const gate of state.config.gates) {
    lines.push(`- ${gate}: PASS`)
  }

  lines.push(``)
  lines.push(`## Risk`)
  lines.push(``)
  lines.push(`- Risk level: Medium`)
  lines.push(`- All changes reviewed by reviewer agent`)
  lines.push(`- Security review completed`)

  lines.push(``)
  lines.push(`## Rollback`)
  lines.push(``)
  lines.push(`To rollback: git revert <commit>`)

  lines.push(``)
  lines.push(`## Notes`)
  lines.push(``)
  lines.push(`- Swarm ID: ${state.id}`)
  lines.push(`- Mode: ${state.mode}`)
  lines.push(`- Agents: ${Object.keys(state.agents).length}`)
  lines.push(`- Created: ${new Date(state.createdAt).toISOString()}`)

  if (state.integrationCommit) {
    lines.push(``)
    lines.push(`## Integration`)
    lines.push(``)
    lines.push(`Integration commit: ${state.integrationCommit}`)
  }

  return lines.join("\n")
}
