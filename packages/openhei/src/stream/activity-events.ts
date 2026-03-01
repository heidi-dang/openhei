import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export namespace ActivityEvent {
  export const Base = z.object({
    run_id: z.string(),
    seq: z.number(),
    ts: z.number(),
    stream: z.enum(["stdout", "stderr", "system"]),
    level: z.enum(["info", "warning", "error", "debug"]),
    data: z.record(z.string(), z.any()),
  })

  export const RunStarted = BusEvent.define(
    "run.started",
    Base.extend({
      data: z.object({
        phase: z.string().optional(),
        parent_id: z.string().optional(),
      }),
    }),
  )

  export const RunHeartbeat = BusEvent.define(
    "run.heartbeat",
    Base.extend({
      data: z.object({
        elapsed_ms: z.number(),
        last_activity_ms: z.number(),
      }),
    }),
  )

  export const PhaseChanged = BusEvent.define(
    "phase.changed",
    Base.extend({
      data: z.object({
        phase: z.string(),
        previous_phase: z.string().optional(),
      }),
    }),
  )

  export const TermCommand = BusEvent.define(
    "term.command",
    Base.extend({
      data: z.object({
        cwd: z.string(),
        command: z.string(),
        display: z.string().optional(),
        typing_ms: z.number().optional(),
      }),
    }),
  )

  export const TermWrite = BusEvent.define(
    "term.write",
    Base.extend({
      data: z.object({
        chunk: z.string(),
        lines: z.number().optional(),
      }),
    }),
  )

  export const TermExit = BusEvent.define(
    "term.exit",
    Base.extend({
      data: z.object({
        code: z.number().nullable(),
        signal: z.string().nullable(),
        duration_ms: z.number(),
      }),
    }),
  )

  export const RunError = BusEvent.define(
    "run.error",
    Base.extend({
      data: z.object({
        message: z.string(),
        code: z.string().optional(),
        last_logs: z.array(z.string()).optional(),
      }),
    }),
  )

  export const RunCompleted = BusEvent.define(
    "run.completed",
    Base.extend({
      data: z.object({
        duration_ms: z.number(),
      }),
    }),
  )

  export type RunStarted = z.infer<typeof RunStarted.properties>
  export type RunHeartbeat = z.infer<typeof RunHeartbeat.properties>
  export type PhaseChanged = z.infer<typeof PhaseChanged.properties>
  export type TermCommand = z.infer<typeof TermCommand.properties>
  export type TermWrite = z.infer<typeof TermWrite.properties>
  export type TermExit = z.infer<typeof TermExit.properties>
  export type RunError = z.infer<typeof RunError.properties>
  export type RunCompleted = z.infer<typeof RunCompleted.properties>

  export type Any =
    | RunStarted
    | RunHeartbeat
    | PhaseChanged
    | TermCommand
    | TermWrite
    | TermExit
    | RunError
    | RunCompleted
}
