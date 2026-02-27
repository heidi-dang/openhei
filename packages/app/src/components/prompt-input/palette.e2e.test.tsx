import { beforeAll, beforeEach, describe, expect, test, mock } from "bun:test"
import { render } from "solid-js/web"
import { createSignal } from "solid-js"

// Integration-style tests for the composer palette using HappyDOM + Solid render.

let flags: Record<string, boolean> = {}
let promptValue: any = [{ type: "text", content: "" }]

beforeAll(() => {
  // Minimal context mocks used by PromptInput
    mock.module("@/context/sdk", () => ({ useSDK: () => ({ directory: "/repo/main", client: { session: { promptAsync: async (input: any) => { ;(globalThis as any).__e2e_prompt_async_calls = (globalThis as any).__e2e_prompt_async_calls || []; (globalThis as any).__e2e_prompt_async_calls.push(input); return { data: undefined } } } }) }))
  mock.module("@/context/sync", () => ({
    useSync: () => ({
      data: { command: [] },
      session: { optimistic: { add: () => undefined, remove: () => undefined } },
      set: () => undefined,
    }),
  }))
  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: { current: () => ({ id: "m", provider: { id: "p" } }), variant: { current: () => undefined } },
      agent: { current: () => ({ name: "agent" }) },
    }),
  }))
  mock.module("@/context/layout", () => ({ useLayout: () => ({ handoff: { setTabs: () => undefined } }) }))
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
  mock.module("@/context/platform", () => ({
    usePlatform: () => ({ platform: "desktop", storage: () => null, readClipboardImage: async () => undefined }),
  }))
  mock.module("@/context/file", () => ({ useFile: () => ({ searchFilesAndDirectories: async () => [] }) }))
  mock.module("@/context/command", () => ({ useCommand: () => ({ options: [], keybind: () => "" }) }))
  mock.module("@/context/settings", () => ({
    useSettings: () => ({ flags: { get: (k: string) => flags[k] ?? false }, current: {} as any }),
  }))

  // Mock prompt context with mutable current/set
  mock.module("@/context/prompt", () => ({
    usePrompt: () => ({
      current: () => promptValue,
      set: (parts: any) => {
        promptValue = parts
      },
      reset: () => (promptValue = [{ type: "text", content: "" }]),
      dirty: () => true,
      context: { items: () => [] },
    }),
    DEFAULT_PROMPT: [{ type: "text", content: "" }],
  }))
})

beforeEach(() => {
  flags = {}
  promptValue = [{ type: "text", content: "" }]
  document.body.innerHTML = ""
})

describe("composer palette integration", () => {
  test("flag OFF: typing '/' does not render palette", async () => {
    flags["ui.composer_palette"] = false
    const mod = await import("../prompt-input")
    const container = document.createElement("div")
    render(() => mod.PromptInput({}), container)
    const editor = document.querySelector('[data-component="prompt-input"]') as HTMLElement
    expect(editor).toBeTruthy()
    editor.textContent = "/"
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.textContent?.includes("/plan")).toBe(false)
  })

  test("flag ON: typing '/' renders palette; ESC closes it", async () => {
    flags["ui.composer_palette"] = true
    const mod = await import("../prompt-input")
    const container = document.createElement("div")
    render(() => mod.PromptInput({}), container)
    const editor = document.querySelector('[data-component="prompt-input"]') as HTMLElement
    editor.textContent = "/"
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.textContent?.includes("/plan")).toBe(true)
    // send Escape
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.textContent?.includes("/plan")).toBe(false)
  })

  test("arrow nav + Enter selects highlighted command (updates prompt text)", async () => {
    flags["ui.composer_palette"] = true
    const mod = await import("../prompt-input")
    const container = document.createElement("div")
    render(() => mod.PromptInput({}), container)
    const editor = document.querySelector('[data-component="prompt-input"]') as HTMLElement
    // simulate user typed '/plan rest'
    editor.textContent = "/plan rest of prompt"
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
    // press ArrowDown then Enter
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }))
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
    await new Promise((r) => setTimeout(r, 0))
    // promptValue should have been updated to remove leading '/plan'
    const text = promptValue.map((p: any) => ("content" in p ? p.content : "")).join("")
    expect(text.startsWith("rest of prompt")).toBe(true)
  })
})
