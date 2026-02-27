import { describe, expect, test, beforeAll, mock } from "bun:test"
import { createPalette } from "./palette"
import { shouldOpenPalette, stripSlashPrefix } from "./palette-util"
import { buildRequestParts } from "./build-request-parts"
import type { Prompt } from "@/context/prompt"

beforeAll(() => {
  mock.module("@/context/sync", () => ({ useSync: () => ({ data: { command: [] } }) }))
})

describe("composer palette (unit) tests", () => {
  test("flag gating: should not open when flag is off", () => {
    const result = shouldOpenPalette(false, "/plan do this")
    expect(result.open).toBe(false)
  })

  test("flag on opens and ESC (programmatic) closes palette", () => {
    const result = shouldOpenPalette(true, "/pl rest")
    expect(result.open).toBe(true)
    const p = createPalette()
    p.setOpen(true)
    expect(p.open()).toBe(true)
    // simulate ESC by programmatic close
    p.setOpen(false)
    expect(p.open()).toBe(false)
  })

  test("arrow navigation + select (logical): active index and strip behavior", () => {
    const p = createPalette()
    p.setOpen(true)
    p.setQuery("pl")
    expect(p.filtered().length).toBeGreaterThan(0)
    p.setActiveIndex(0)
    const items = p.filtered()
    const item = items[p.activeIndex()]
    expect(item).toBeTruthy()
    const text = "/" + item.id + " remaining text"
    const remainder = stripSlashPrefix(text, item.id)
    expect(remainder).toBe("remaining text")
  })

  test("selection sets metadata.send_option via buildRequestParts", () => {
    const prompt = [{ type: "text", content: "hello", start: 0, end: 5 }] as unknown as Prompt
    const { requestParts } = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "hello",
      sessionID: "s1",
      messageID: "m1",
      sessionDirectory: "/repo",
      sendOption: "plan",
    })
    const textPart = requestParts.find((p: any) => p.type === "text") as any
    expect(textPart).toBeTruthy()
    expect(textPart.metadata?.send_option).toBe("plan")
  })
})
