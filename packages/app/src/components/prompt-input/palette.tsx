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

export function shouldOpenPalette(flag: boolean, text: string) {
  if (!flag) return { open: false }
  if (!text) return { open: false }
  return { open: text.startsWith("/") }
}

export function stripSlashPrefix(text: string, cmd: string) {
  const prefix = `/${cmd}`
  if (!text.startsWith(prefix)) return text
  let rest = text.slice(prefix.length)
  if (rest.startsWith(" ")) rest = rest.slice(1)
  return rest
}

export default function Palette(props: { palette: ReturnType<typeof createPalette>; onSelect: (cmd: string) => void }) {
  const p = props.palette
  let listRef: HTMLDivElement | undefined

  createEffect(() => {
    const idx = p.activeIndex()
    if (!listRef) return
    const items = listRef.querySelectorAll("[data-palette-item]")
    const el = items[idx] as HTMLElement | undefined
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "auto" })
    }
  })

  return (
    <>
      <div
        class="fixed inset-0 z-40"
        onClick={(e) => {
          e.stopPropagation()
          p.setOpen(false)
        }}
      />
      <div
        ref={listRef}
        class="absolute left-2 top-full z-50 max-h-[200px] w-[calc(100%-1rem)] sm:w-[260px] overflow-y-auto bg-surface-1 border border-divider rounded shadow-md mt-1 sm:left-0"
      >
        <div class="p-1">
          {p.filtered().map((cmd, idx) => (
            <div
              data-palette-item
              classList={{
                "px-3 py-2.5 rounded min-h-[44px] flex items-center cursor-pointer": true,
                "bg-surface-2": idx === p.activeIndex(),
              }}
              onMouseEnter={() => p.setActiveIndex(idx)}
              onClick={(e) => {
                e.stopPropagation()
                props.onSelect(cmd.id)
              }}
            >
              <span class="text-14-regular">{cmd.title}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
