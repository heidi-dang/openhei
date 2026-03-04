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

    const unsub = globalSDK.event.listen((e: any) => {
      const event = e.details
      if (!event) return

      if (event.type === "swarm.started") {
        setStore(
          produce((s) => {
            s.active = true
            s.swarm_id = event.properties.swarm_id
          }),
        )
      } else if (event.type === "swarm.ended") {
        setStore(
          produce((s) => {
            s.active = false
            s.swarm_id = null
            s.consent_request = null
          }),
        )
      } else if (event.type === "swarm.consent_required") {
        setStore(
          produce((s) => {
            s.consent_request = {
              swarm_id: event.properties.swarm_id,
              session_id: event.properties.session_id,
              reason: event.properties.reason,
              planned_tasks: event.properties.planned_tasks,
              models: event.properties.models,
            }
          }),
        )
      } else if (event.type === "swarm.consent_granted" || event.type === "swarm.consent_denied") {
        setStore(
          produce((s) => {
            s.consent_request = null
          }),
        )
      } else if (event.type === "swarm.slot_status") {
        const slot = event.properties.slot
        if (slot) {
          setStore(
            produce((s) => {
              s.slots[slot - 1] = {
                slot: slot as 1 | 2,
                status: event.properties.status,
                session_id: event.properties.session_id,
                model: event.properties.model,
                phase: event.properties.phase,
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
