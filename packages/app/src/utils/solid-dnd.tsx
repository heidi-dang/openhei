import { useDragDropContext } from "@thisbeyond/solid-dnd"
import type { Transformer } from "@thisbeyond/solid-dnd"
import { createRoot, onCleanup, type JSXElement } from "solid-js"

type DragEvent = { draggable?: { id?: unknown } }

const isDragEvent = (event: unknown): event is DragEvent => {
  if (typeof event !== "object" || event === null) return false
  return "draggable" in event
}

export const getDraggableId = (event: unknown): string | undefined => {
  if (!isDragEvent(event)) return undefined
  const draggable = event.draggable
  if (!draggable) return undefined
  return typeof draggable.id === "string" ? draggable.id : undefined
}

const createTransformer = (id: string, axis: "x" | "y"): Transformer => ({
  id,
  order: 100,
  callback: (transform) => (axis === "x" ? { ...transform, x: 0 } : { ...transform, y: 0 }),
})

const createAxisConstraint = (axis: "x" | "y", transformerId: string) => (): JSXElement => {
  const context = useDragDropContext()
  if (!context) return null
  const [, { onDragStart, onDragEnd, addTransformer, removeTransformer }] = context
  const transformer = createTransformer(transformerId, axis)
  const dispose = createRoot((dispose) => {
    onDragStart((event) => {
      const id = getDraggableId(event)
      if (!id) return
      addTransformer("draggables", id, transformer)
    })
    onDragEnd((event) => {
      const id = getDraggableId(event)
      if (!id) return
      // The @thisbeyond/solid-dnd library may throw if removeTransformer is called 
      // for an ID that was already removed or during rapid unmount cycles.
      // We swallow these specifically to avoid console noise during normal app navigation.
      try {
        removeTransformer("draggables", id, transformer.id)
      } catch (e) {
        if (e instanceof Error && e.message.includes("Cannot remove")) {
          return
        }
        throw e
      }
    })
    return dispose
  })
  onCleanup(dispose)
  return null
}

export const ConstrainDragXAxis = createAxisConstraint("x", "constrain-x-axis")

export const ConstrainDragYAxis = createAxisConstraint("y", "constrain-y-axis")
