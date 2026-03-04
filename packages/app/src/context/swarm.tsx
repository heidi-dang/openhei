import { createSignal, createEffect, onCleanup, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@openhei-ai/ui/context"
import { useGlobalSDK } from "@/context/global-sdk"

export interface SwarmConsentRequest {
  swarm_id: string
  session_id: string
  reason: string
  planned_tasks: string[]
  models: string[]
}

export interface SwarmSlotInfo {
  slot: 1 | 2
  status: "idle" | "working" | "done" | "error"
  session_id: string | null
  agent_name?: string
  model?: string
  phase?: string
}

type SwarmStore = {
  active: boolean
  swarm_id: string | null
  slots: [SwarmSlotInfo | null, SwarmSlotInfo | null]
  consent_request: SwarmConsentRequest | null
}

export const { use: useSwarm, provider: SwarmProvider } = createSimpleContext({
  name: "Swarm",
  init: () => {
    const globalSDK = useGlobalSDK()

    const [store, setStore] = createStore<SwarmStore>({
      active: false,
      swarm_id: null,
      slots: [null, null],
      consent_request: null,
    })

    const [selectedSlot, setSelectedSlot] = createSignal<"main" | 1 | 2>("main")

    const unsub = globalSDK.event.listen((e) => {
      const event = e.details
      if (!event) return

      // event may be a wide union type from the global SDK; narrow via `any` for swarm-specific events
      const ev = event as any

      if (ev.type === "swarm.started") {
        setStore(
          produce((s) => {
            s.active = true
            s.swarm_id = ev.properties?.swarm_id ?? null
          }),
        )
      } else if (ev.type === "swarm.ended") {
        setStore(
          produce((s) => {
            s.active = false
            s.swarm_id = null
            s.consent_request = null
          }),
        )
      } else if (ev.type === "swarm.consent_required") {
        const p = ev.properties ?? {}
        setStore(
          produce((s) => {
            s.consent_request = {
              swarm_id: p.swarm_id,
              session_id: p.session_id,
              reason: p.reason,
              planned_tasks: p.planned_tasks,
              models: p.models,
            }
          }),
        )
      } else if (ev.type === "swarm.consent_granted" || ev.type === "swarm.consent_denied") {
        setStore(
          produce((s) => {
            s.consent_request = null
          }),
        )
      } else if (ev.type === "swarm.slot_status") {
        const slot = ev.properties?.slot
        if (slot) {
          const p = ev.properties ?? {}
          setStore(
            produce((s) => {
              s.slots[slot - 1] = {
                slot: slot as 1 | 2,
                status: p.status,
                session_id: p.session_id,
                model: p.model,
                phase: p.phase,
              }
            }),
          )
        }
      }
    })

    const respondConsent = async (swarm_id: string, session_id: string, accept: boolean) => {
      const res = await fetch(`/api/v1/session/${session_id}/swarm/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swarm_id, accept }),
      })
      return res.ok
    }

    const clearSwarm = () => {
      setStore(
        produce((s) => {
          s.active = false
          s.swarm_id = null
          s.slots = [null, null]
          s.consent_request = null
        }),
      )
    }

    return {
      store,
      selectedSlot,
      setSelectedSlot,
      respondConsent,
      clearSwarm,
    }
  },
})
