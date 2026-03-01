import { ActivityEvent } from "./activity-events"
import { Bus } from "@/bus"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"

export namespace RunEventBus {
  const log = Log.create({ service: "run-event-bus" })
  const MAX_EVENTS_PER_RUN = 500
  const RECENT_EVENTS_TO_REPLAY = 50

  type RunEvents = {
    seq: number
    events: Array<{
      type: string
      properties: any
      ts: number
    }>
  }

  const state = Instance.state(() => {
    const data: Record<string, RunEvents> = {}
    return data
  })

  let globalSeq = 0

  function getOrCreateRun(runId: string): RunEvents {
    const runs = state()
    if (!runs[runId]) {
      runs[runId] = {
        seq: 0,
        events: [],
      }
    }
    return runs[runId]
  }

  function trimEvents(run: RunEvents) {
    if (run.events.length > MAX_EVENTS_PER_RUN) {
      run.events = run.events.slice(-MAX_EVENTS_PER_RUN)
    }
  }

  export function publish(event: ActivityEvent.Any) {
    const run = getOrCreateRun(event.run_id)
    const seq = ++globalSeq
    const runSeq = ++run.seq

    const busEvent = {
      type: event.type,
      properties: {
        ...event,
        seq,
        run_seq: runSeq,
        ts: Date.now(),
      },
    }

    run.events.push({
      type: busEvent.type,
      properties: busEvent.properties,
      ts: busEvent.properties.ts,
    })
    trimEvents(run)

    log.debug("publishing", { run_id: event.run_id, type: event.type, seq })
    Bus.publish(busEvent.type as any, busEvent.properties)
  }

  export function getRecent(runId: string, limit: number = RECENT_EVENTS_TO_REPLAY) {
    const run = state()[runId]
    if (!run) return []
    return run.events.slice(-limit)
  }

  export function subscribe(runId: string, callback: (event: { type: string; properties: any }) => void) {
    return Bus.subscribeAll((event) => {
      if (event.type.startsWith("run.") || event.type.startsWith("term.") || event.type.startsWith("phase.")) {
        if (event.properties.run_id === runId) {
          callback(event)
        }
      }
    })
  }

  export function clear(runId: string) {
    const runs = state()
    delete runs[runId]
  }
}
