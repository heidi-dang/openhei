import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Global } from "../global"
import { Instance } from "../project/instance"

export const SwarmConfig = z.object({
  max_workers: z.number().min(1).max(8).default(6),
  lead_model: z.string().optional(),
  worker_model: z.string().optional(),
  reviewer_model: z.string().optional(),
  security_model: z.string().optional(),
  qa_model: z.string().optional(),
  mode: z.enum(["strict-hierarchy", "democracy", "parallel-only", "adversarial-duel"]).default("strict-hierarchy"),
  gates: z.array(z.string()).default(["lint", "test", "typecheck"]),
  timeout: z.number().default(600000),
  keep_worktrees: z.boolean().default(false),
})
export type SwarmConfig = z.infer<typeof SwarmConfig>

const configPaths = [
  () => path.join(Global.Path.config, "swarm.yaml"),
  () => path.join(Global.Path.config, "swarm.yml"),
  () => path.join(Global.Path.config, "swarm.json"),
  () => path.join(Instance.directory, ".openhei", "swarm", "config.yaml"),
  () => path.join(Instance.directory, ".openhei", "swarm", "config.yml"),
  () => path.join(Instance.directory, ".openhei", "swarm", "config.json"),
]

let cachedConfig: SwarmConfig | null = null

export async function getSwarmConfig(): Promise<SwarmConfig> {
  if (cachedConfig) return cachedConfig

  for (const getPath of configPaths) {
    const configPath = getPath()
    try {
      await fs.access(configPath)
      const content = await fs.readFile(configPath, "utf-8")

      if (configPath.endsWith(".json")) {
        const parsed = JSON.parse(content)
        cachedConfig = SwarmConfig.parse(parsed)
        return cachedConfig
      } else {
        // For YAML, we'd need a yaml parser
        // For now, just return defaults
        cachedConfig = SwarmConfig.parse({})
        return cachedConfig
      }
    } catch {
      // Try next path
    }
  }

  cachedConfig = SwarmConfig.parse({})
  return cachedConfig
}

export function resetSwarmConfig(): void {
  cachedConfig = null
}
