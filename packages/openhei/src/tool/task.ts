import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"
import { PermissionNext } from "@/permission/next"
import { createSwarmPool, getSwarmPoolByRunId } from "../swarm"
import { RunEventBus } from "../stream/event-bus"

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
})

async function getOrCreateSwarmPool(sessionID: string) {
  const cfg = await Config.get()
  const swarmConfig = (cfg as any).swarm

  if (!swarmConfig?.enabled) {
    return null
  }

  const run_id = `${sessionID}_run`

  let pool = getSwarmPoolByRunId(run_id)
  if (!pool) {
    pool = await createSwarmPool(run_id, sessionID)
    await pool.start()
  }

  return pool
}

async function waitForConsent(pool: ReturnType<typeof getSwarmPoolByRunId>, _sessionID: string): Promise<boolean> {
  if (!pool) return true

  const maxWaitMs = 300000
  const pollIntervalMs = 500
  const startTime = Date.now()

  while (pool.getState().waiting_consent) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error("Consent timeout - user did not respond in time")
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  return pool.getState().consent_request === null
}

type TaskMetadata = {
  sessionId?: string | undefined
  model?: { modelID: string; providerID: string } | undefined
  slot?: number | undefined
  // allow other fields (truncated, outputPath, etc.) to be present
  [key: string]: any
}

export const TaskTool = Tool.define<typeof parameters, TaskMetadata>("task", (async (initCtx?: Tool.InitContext) => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))

  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx: Tool.Context) {
      const config = await Config.get()

      if (!ctx.extra?.bypassAgentCheck) {
        await ctx.ask({
          permission: "task",
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)

      const hasTaskPermission = agent.permission.some((rule) => rule.permission === "task")

      const swarmPool = await getOrCreateSwarmPool(ctx.sessionID)

      if (swarmPool && swarmPool.isEnabled()) {
        const canSpawn = swarmPool.canSpawnSubagent()

        if (!canSpawn && swarmPool.getState().waiting_consent) {
          const consentGranted = await waitForConsent(swarmPool, ctx.sessionID)
          if (!consentGranted) {
            RunEventBus.publish({
              run_id: swarmPool.runId,
              type: "swarm.consent_denied",
              properties: {
                swarm_id: swarmPool.swarmId,
                session_id: ctx.sessionID,
                ts: Date.now(),
              },
            })
            throw new Error("Sub-agent spawn denied by user")
          }
        }

        if (!swarmPool.canSpawnSubagent()) {
          RunEventBus.publish({
            run_id: swarmPool.runId,
            type: "swarm.slot_status",
            properties: {
              swarm_id: swarmPool.swarmId,
              slot: null,
              status: "error",
              phase: "error",
              session_id: null,
              model: "",
              ts: Date.now(),
            },
          })
          throw new Error("No available sub-agent slots")
        }

        const reason = `Spawn sub-agent for: ${params.description}`
        const plannedTasks = [params.description]
        const models = swarmPool.getSubagentModels()

        await swarmPool.requestConsent(reason, plannedTasks, models)

        const consentGranted = await waitForConsent(swarmPool, ctx.sessionID)
        if (!consentGranted) {
          return {
            title: params.description,
            metadata: { sessionId: undefined as string | undefined },
            output: "Sub-agent spawn was denied by user. Continuing with main agent only.",
          }
        }

        const slot = swarmPool.getAvailableSlot()
        if (slot !== null && swarmPool.canSpawnSubagent()) {
          const subagentModels = swarmPool.getSubagentModels()
          const modelConfig = subagentModels[slot - 1]
          if (modelConfig) {
            const [providerID, modelID] = modelConfig.split("/")

            // runtime log available via console; use Log util if needed elsewhere

            const execResult = await swarmPool.executeTask({
              slot,
              agentName: agent.name,
              model: { providerID, modelID },
              prompt: params.prompt,
              parentSessionID: ctx.sessionID,
              taskDescription: params.description,
            })

            return {
              title: params.description,
              metadata: { sessionId: execResult.sessionID as string | undefined, slot },
              output: [
                `task_id: ${execResult.sessionID} (swarm slot ${slot})`,
                "",
                "<task_result>",
                execResult.result,
                "</task_result>",
              ].join("\n"),
            }
          }
        }
      }

      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      let model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      const session = await iife(async () => {
        if (params.task_id) {
          const found = await Session.get(params.task_id).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${agent.name} subagent)`,
          permission: [
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "todoread",
              pattern: "*",
              action: "deny",
            },
            ...(hasTaskPermission
              ? []
              : [
                  {
                    permission: "task" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...((config as any).experimental?.primary_tools?.map((t: string) => ({
              pattern: "*",
              action: "allow" as const,
              permission: t,
            })) ?? []),
          ],
        })
      })

      if (swarmPool && swarmPool.isEnabled()) {
        const models = swarmPool.getSubagentModels()
        const slotIndex = swarmPool.getAvailableSlot()
        if (slotIndex !== null && models[slotIndex - 1]) {
          const [providerID, modelID] = models[slotIndex - 1].split("/")
          model = { modelID, providerID }
        }
      }

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
          model,
        },
      })

      const messageID = Identifier.ascending("message")

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      // `using` requires a proper disposable; wrap removal in a disposable-like object
      const _dispose = { [Symbol.dispose]: () => ctx.abort.removeEventListener("abort", cancel) }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _using = _dispose
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          ...(hasTaskPermission ? {} : { task: false }),
          ...Object.fromEntries(((config as any).experimental?.primary_tools ?? []).map((t: string) => [t, false])),
        },
        parts: promptParts,
      })

      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = [
        `task_id: ${session.id} (for resuming to continue this task if needed)`,
        "",
        "<task_result>",
        text,
        "</task_result>",
      ].join("\n")

      return {
        title: params.description,
        metadata: {
          sessionId: session.id as string | undefined,
          model,
        },
        output,
      }
    },
  }
}) as any)
