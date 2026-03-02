import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Config } from "../../config/config"
import { errors } from "../error"
import { Global } from "../../global"
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "fs"
import path from "path"

declare global {
  const OPENHEI_GIT_SHA: string
  const OPENHEI_BUILD_TIME: string
}

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

export const GlobalRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Get health",
        description: "Get health information about the OpenHei server.",
        operationId: "global.health",
        responses: {
          200: {
            description: "Health information",
            content: {
              "application/json": {
                schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({ healthy: true, version: Installation.VERSION })
      },
    )
    .get(
      "/event",
      describeRoute({
        summary: "Get global events",
        description: "Subscribe to global events from the OpenHei system using server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      directory: z.string(),
                      payload: BusEvent.payloads(),
                    })
                    .meta({
                      ref: "GlobalEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global event connected")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")
        return streamSSE(c, async (stream) => {
          stream.writeSSE({
            data: JSON.stringify({
              payload: {
                type: "server.connected",
                properties: {},
              },
            }),
          })
          async function handler(event: any) {
            await stream.writeSSE({
              data: JSON.stringify(event),
            })
          }
          GlobalBus.on("event", handler)

          // Send heartbeat every 10s to prevent stalled proxy streams.
          const heartbeat = setInterval(() => {
            stream.writeSSE({
              data: JSON.stringify({
                payload: {
                  type: "server.heartbeat",
                  properties: {},
                },
              }),
            })
          }, 10_000)

          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              clearInterval(heartbeat)
              GlobalBus.off("event", handler)
              resolve()
              log.info("global event disconnected")
            })
          })
        })
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "Get global configuration",
        description: "Retrieve the current global OpenHei configuration settings and preferences.",
        operationId: "global.config.get",
        responses: {
          200: {
            description: "Get global config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.getGlobal())
      },
    )
    .patch(
      "/config",
      describeRoute({
        summary: "Update global configuration",
        description: "Update global OpenHei configuration settings and preferences.",
        operationId: "global.config.update",
        responses: {
          200: {
            description: "Successfully updated global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        const next = await Config.updateGlobal(config)
        return c.json(next)
      },
    )
    .post(
      "/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose all OpenHei instances, releasing all resources.",
        operationId: "global.dispose",
        responses: {
          200: {
            description: "Global disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.disposeAll()
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: GlobalDisposedEvent.type,
            properties: {},
          },
        })
        return c.json(true)
      },
    )
    .get(
      "/update/check",
      describeRoute({
        summary: "Check for updates",
        description: "Check if a new version of OpenHei is available.",
        operationId: "global.update.check",
        responses: {
          200: {
            description: "Update information",
            content: {
              "application/json": {
                schema: resolver(Installation.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Installation.info())
      },
    )
    .post(
      "/update",
      describeRoute({
        summary: "Install update",
        description: "Download and install the latest version of OpenHei.",
        operationId: "global.update.install",
        responses: {
          200: {
            description: "Update started",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const info = await Installation.info()
        if (info.version !== info.latest) {
          void Installation.startUpdate(info.latest)
        }
        return c.json(true)
      },
    )
    .get(
      "/update/status",
      describeRoute({
        summary: "Update status",
        description: "Get realtime update progress, if an update is running.",
        operationId: "global.update.status",
        responses: {
          200: {
            description: "Update status",
            content: {
              "application/json": {
                schema: resolver(Installation.UpdateStatus),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(Installation.status())
      },
    )
    .get(
      "/debug",
      describeRoute({
        summary: "Get debug information",
        description: "Get build debug information including build ID, git SHA, build time, and served dist SHA.",
        operationId: "global.debug",
        responses: {
          200: {
            description: "Debug information",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    buildId: z.string(),
                    gitSha: z.string().nullable(),
                    buildTime: z.string().nullable(),
                    version: z.string(),
                    channel: z.string(),
                    distSha: z.string().nullable(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const gitSha = typeof OPENHEI_GIT_SHA === "string" ? OPENHEI_GIT_SHA : null
        const buildTime = typeof OPENHEI_BUILD_TIME === "string" ? OPENHEI_BUILD_TIME : null

        // Try to read .build_sha from served dashboard directory
        let distSha: string | null = null
        try {
          const dashboardPaths = [process.env.OPENHEI_DASHBOARD_DIR, "./dashboard", "../../dashboard"]
          for (const p of dashboardPaths) {
            if (!p) continue
            try {
              const { existsSync, readFileSync } = await import("fs")
              const shaPath = require("path").join(p, ".build_sha")
              if (existsSync(shaPath)) {
                distSha = readFileSync(shaPath, "utf-8").trim()
                break
              }
            } catch {
              // continue
            }
          }
        } catch {
          // ignore
        }

        return c.json({
          buildId: Installation.VERSION,
          gitSha,
          buildTime,
          version: Installation.VERSION,
          channel: Installation.CHANNEL,
          distSha,
        })
      },
    )
    .get(
      "/config-file",
      describeRoute({
        summary: "Get openhei.conf content",
        description: "Get the global openhei.conf file content with metadata.",
        operationId: "global.config-file",
        responses: {
          200: {
            description: "Config file content and metadata",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    path: z.string(),
                    text: z.string(),
                    mtime: z.number(),
                    exists: z.boolean(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const configDir = Global.Path.config
        const candidates = ["openhei.jsonc", "openhei.json", "config.json"].map((file) => path.join(configDir, file))
        let configPath = candidates[0]
        for (const file of candidates) {
          if (existsSync(file)) {
            configPath = file
            break
          }
        }

        if (!existsSync(configPath)) {
          mkdirSync(configDir, { recursive: true })
          const defaultContent = JSON.stringify({ $schema: "https://openhei.ai/config.json" }, null, 2)
          writeFileSync(configPath, defaultContent, "utf-8")
        }

        const stats = statSync(configPath)
        const text = readFileSync(configPath, "utf-8")

        return c.json({
          path: configPath,
          text,
          mtime: Math.floor(stats.mtimeMs),
          exists: true,
        })
      },
    )
    .put(
      "/config-file",
      describeRoute({
        summary: "Update openhei.conf",
        description: "Write the global openhei.conf file atomically.",
        operationId: "global.config-file.put",
        responses: {
          200: {
            description: "Config file updated",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    success: z.boolean(),
                    mtime: z.number(),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          text: z.string().max(64 * 1024),
          expectedMtime: z.number().optional(),
        }),
      ),
      async (c) => {
        const { text, expectedMtime } = c.req.valid("json")

        if (/[\x00-\x08\x0E-\x1F]/.test(text)) {
          return c.json({ error: "Binary content not allowed" }, 400)
        }

        const configDir = Global.Path.config
        const candidates = ["openhei.jsonc", "openhei.json", "config.json"].map((file) => path.join(configDir, file))
        let configPath = candidates[0]
        for (const file of candidates) {
          if (existsSync(file)) {
            configPath = file
            break
          }
        }

        if (!existsSync(configPath)) {
          mkdirSync(configDir, { recursive: true })
        }

        if (expectedMtime !== undefined) {
          const stats = statSync(configPath)
          const currentMtime = Math.floor(stats.mtimeMs)
          if (currentMtime !== expectedMtime) {
            return c.json(
              {
                error: "mtime mismatch",
                currentMtime,
                expectedMtime,
              },
              409,
            )
          }
        }

        const tempPath = configPath + ".tmp." + Date.now()
        writeFileSync(tempPath, text, "utf-8")

        const stats = statSync(tempPath)
        const mtime = Math.floor(stats.mtimeMs)

        const { renameSync, unlinkSync } = require("fs")
        try {
          renameSync(tempPath, configPath)
        } catch (err) {
          try {
            unlinkSync(tempPath)
          } catch {}
          throw err
        }

        log.info("config saved", { path: configPath, bytes: text.length })

        return c.json({ success: true, mtime })
      },
    )
    .post(
      "/config-translate",
      describeRoute({
        summary: "Translate human language to JSON config",
        description: "Generate JSON config changes from plain language requests.",
        operationId: "global.config-translate",
        responses: {
          200: {
            description: "Proposed config text",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    proposedText: z.string(),
                    warnings: z.array(z.string()).optional(),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          currentText: z.string().max(64 * 1024),
          requestText: z.string().max(4096),
        }),
      ),
      async (c) => {
        const { currentText, requestText } = c.req.valid("json")

        const schema = `
Allowed top-level keys for openhei.conf:
- $schema (string)
- model (object)
  - provider (string)
  - model (string)
- chat_mode (string: "agent" | "chat_only")
- theme (string)
- keybinds (object)
- display_thinking (boolean)
- ui (object)
- provider (object with provider names as keys)
`

        const prompt = `You are a config translator. Given the current openhei.conf JSON and a human request, generate the new JSON config.

Current config:
${currentText}

Human request: ${requestText}

${schema}

Rules:
1. Output ONLY valid JSON
2. preserve all existing keys unless the request modifies them
3. Add new keys as needed based on the request
4. Use 2-space indentation
5. Do not add any explanation or markdown - just the JSON

New config:`

        try {
          const { generateText } = await import("ai")
          const { openai } = await import("@ai-sdk/openai")

          const result = await generateText({
            model: openai("gpt-4o-mini"),
            prompt,
            maxTokens: 4096,
          })

          let proposedText = result.text.trim()

          // Extract JSON from response if there's any markdown wrapper
          const jsonMatch = proposedText.match(/```json\n([\s\S]*?)\n```/) || proposedText.match(/```\n([\s\S]*?)\n```/)
          if (jsonMatch) {
            proposedText = jsonMatch[1]
          }

          // Validate the proposed JSON
          try {
            JSON.parse(proposedText)
          } catch (parseErr) {
            return c.json(
              { error: "Generated invalid JSON: " + (parseErr instanceof Error ? parseErr.message : "parse error") },
              400,
            )
          }

          log.info("config translated", { requestLength: requestText.length, outputLength: proposedText.length })

          return c.json({ proposedText })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error("config translate failed", { error: msg })
          return c.json({ error: "Translation failed: " + msg }, 500)
        }
      },
    ),
)
