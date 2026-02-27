import { createSignal, createMemo, createEffect } from "solid-js"
import { Tooltip } from "@openhei-ai/ui/tooltip"

type Command = { id: string; title: string }

export function createPalette() {
  const commands: Command[] = [
    { id: "plan", title: "/plan" },
    { id: "act", title: "/act" },
    { id: "explain", title: "/explain" },
    { id: "search", title: "/search" },
  ]

  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const filtered = createMemo(() => {
    const q = query().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.title.startsWith("/" + q))
  })
  const [activeIndex, setActiveIndex] = createSignal(0)

  createEffect(() => {
    if (!open()) setActiveIndex(0)
  })

  return {
    open,
    setOpen,
    query,
    setQuery,
    filtered,
    activeIndex,
    setActiveIndex,
  }
}

export default function Palette(props: { palette: ReturnType<typeof createPalette>; onSelect: (cmd: string) => void }) {
  const p = props.palette
  return (
    <div class="absolute z-50 w-[260px] bg-surface-1 border border-divider rounded shadow-md mt-1">
      <div class="p-2">
        {p.filtered().map((cmd, idx) => (
          <div
            classList={{ "px-2 py-1 rounded": true, "bg-surface-2": idx === p.activeIndex() }}
            onMouseEnter={() => p.setActiveIndex(idx)}
            onClick={() => props.onSelect(cmd.id)}
          >
            <span class="text-13-regular">{cmd.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
