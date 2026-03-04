import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { RunEventBus } from "@/stream/event-bus"
import { Log } from "@/util/log"
import { lazy } from "@/util/lazy"
import { errors } from "../error"

const log = Log.create({ service: "server" })

export const RunsEventsRoutes = lazy(() =>
  new Hono().get(
    "/:runId/events",
    describeRoute({
      summary: "Get run activity events",
      description: "Subscribe to activity events for a specific run using server-sent events.",
      operationId: "runs.events",
      responses: {
        200: {
          description: "Event stream",
          content: {
            "text/event-stream": {
              schema: resolver(
                z.object({
                  type: z.string(),
                  properties: z.record(z.string(), z.any()),
                }),
              ),
            },
          },
        },
        ...errors(400),
        ...errors(404),
      },
    }),
    validator(
      "query",
      z.object({
        replay: z.coerce.boolean().optional().default(true),
        limit: z.coerce.number().optional().default(50),
        cursor: z.coerce.number().optional(),
      }),
    ),
    async (c) => {
      const runId = c.req.param("runId")
      const { replay, limit, cursor } = c.req.valid("query")

      log.info("run events connected", { runId, cursor })

      c.header("Content-Type", "text/event-stream")
      c.header("Cache-Control", "no-cache")
      c.header("Connection", "keep-alive")
      c.header("X-Accel-Buffering", "no")
      c.header("Content-Encoding", "identity")

      return streamSSE(c, async (stream) => {
        const connectedEvent = {
          type: "run.connected",
          properties: {
            run_id: runId,
            ts: Date.now(),
            cursor: cursor ?? 0,
          },
        }
        await stream.writeSSE({
          event: "activity",
          data: JSON.stringify(connectedEvent),
        })

        if (replay) {
          const recent = RunEventBus.getRecent(runId, limit)
          const startIdx = cursor ? recent.findIndex((e) => (e.properties?.seq ?? 0) > cursor) : 0
          const eventsToReplay = startIdx >= 0 ? recent.slice(startIdx) : []
          for (const event of eventsToReplay) {
            await stream.writeSSE({
              event: "activity",
              data: JSON.stringify(event),
            })
          }
        }

        const unsubscribe = RunEventBus.subscribe(runId, async (event) => {
          try {
            await stream.writeSSE({
              event: "activity",
              data: JSON.stringify(event),
            })
          } catch (err) {
            log.error("failed to write event", { error: err })
            unsubscribe()
          }
        })

        stream.onAbort(() => {
          log.info("run events disconnected", { runId })
          unsubscribe()
        })

        while (true) {
          await stream.sleep(10000)
          try {
            await stream.writeSSE({
              event: "activity",
              data: JSON.stringify({
                type: "run.heartbeat",
                properties: {
                  run_id: runId,
                  ts: Date.now(),
                },
              }),
            })
          } catch (err) {
            break
          }
        }
      })
    },
  ),
)
