import { createSignal, For, Show, onMount, createEffect, onCleanup } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@openhei-ai/ui/card"
import { Icon } from "@openhei-ai/ui/icon"
import { ScrollView } from "@openhei-ai/ui/scroll-view"
import { TextField } from "@openhei-ai/ui/text-field"
import { useSDK } from "@/context/sdk"
import { useModels } from "@/context/models"
import { useSync } from "@/context/sync"
import type { BackendFormData, UIFormData } from "@/types/app-builder"

// Adding a simple tailwind animation keyframe style block in a component for quick win
const animationStyles = `
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.animate-slide-up {
  animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
`

interface Message {
  id?: string
  role: "user" | "assistant" | "system"
  content: string
  tools?: any[]
}

interface GeminiSpec {
  name: string
  mode: "backend" | "ui"
  data: BackendFormData | UIFormData
}

interface GeminiBuilderProps {
  onApply: (name: string, mode: "backend" | "ui", data: BackendFormData | UIFormData) => void
}

export function GeminiBuilder(props: GeminiBuilderProps) {
  const sdk = useSDK()
  const models = useModels()
  const sync = useSync()

  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal("")
  const [isTyping, setIsTyping] = createSignal(false)
  const [agentActivity, setAgentActivity] = createSignal<string | null>(null)
  const [detectedSpec, setDetectedSpec] = createSignal<{
    name: string
    mode: "backend" | "ui"
    data: BackendFormData | UIFormData
  } | null>(null)

  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 1024)
  const [showLeftPanel, setShowLeftPanel] = createSignal(window.innerWidth >= 1024)
  const [showRightPanel, setShowRightPanel] = createSignal(window.innerWidth >= 1024)

  onMount(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) {
        setShowLeftPanel(true)
        setShowRightPanel(true)
      }
    }
    window.addEventListener("resize", handleResize)
    onCleanup(() => window.removeEventListener("resize", handleResize))
  })

  let scrollRef: HTMLDivElement | undefined

  const [systemInstructions, setSystemInstructions] = createSignal(`You are Gemini, an expert App Architect.
Your goal is to guide the user step-by-step through the process of defining an application.
Ask clarifying questions to understand their needs (e.g., "What is the purpose of the app?", "What data do we need to store?", "What screens should it have?").

Keep your responses conversational but professional. Ask ONE or TWO questions at a time to not overwhelm the user.

Once you have enough information, you should output a final specification in a JSON block like this:
\`\`\`json
{
  "type": "app-spec",
  "name": "App Name",
  "mode": "backend",
  "data": { ... }
}
\`\`\`
For "backend" mode, the data should follow this structure:
{
  "appName": string,
  "description": string,
  "port": number,
  "requirements": string
}
For "ui" mode, the data should follow this structure:
{
  "appName": string,
  "description": string,
  "features": string,
  "theme": "light" | "dark" | "system"
}`)

  const [selectedModel, setSelectedModel] = createSignal<string>("")
  const [temperature, setTemperature] = createSignal(0.7)
  const [topK, setTopK] = createSignal(40)
  const [topP, setTopP] = createSignal(0.95)

  // Agentic Settings
  const [isGroundingEnabled, setIsGroundingEnabled] = createSignal(false)
  const [isDropshippingMode, setIsDropshippingMode] = createSignal(false)
  const [isVibeCodingEnabled, setIsVibeCodingEnabled] = createSignal(true)

  onMount(() => {
    setMessages([
      {
        role: "assistant",
        content: "Hi! I'm Gemini, your App Builder assistant. What kind of app would you like to build today?",
      },
    ])
    // Auto-select first gemini model
    const gemini = models.list().find((m) => m.id.includes("gemini"))
    if (gemini) setSelectedModel(gemini.id)
  })

  const scrollToBottom = () => {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight
    }
  }

  createEffect(() => {
    messages()
    requestAnimationFrame(scrollToBottom)
  })

  const handleSend = async () => {
    const text = input().trim()
    if (!text || isTyping()) return

    const userMessage: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsTyping(true)

    try {
      // Find selected model or fallback
      const modelId = selectedModel() || models.list().find((m) => m.id.includes("gemini"))?.id || models.list()[0]?.id
      const geminiModel = models.list().find((m) => m.id === modelId)

      if (!geminiModel) {
        throw new Error("No models available")
      }

      const sessionResponse = await sdk.client.session.create()
      const sessionId = sessionResponse.data?.id

      if (!sessionId) throw new Error("Failed to create AI session")

      // Get initial sync to have a baseline
      await sync.session.sync(sessionId)
      const initialMsgs = sync.data.message[sessionId] || []
      const lastUserMsgId = initialMsgs[initialMsgs.length - 1]?.id || ""

      // Send messages with system instructions
      const system = `<system>${systemInstructions()}</system>`
      const history = `<history>${messages()
        .map((m) => `<${m.role}>${m.content}</${m.role}>`)
        .join("")}</history>`
      const finalPrompt = `${system}${history}<user>${text}</user><assistant></assistant>`

      // We'll use promptAsync and then wait for the message to appear in sync.data.message
      const activeTools: Record<string, boolean> = {
        calculator: true,
        task: true,
        bash: isVibeCodingEnabled(),
        marketplace: isDropshippingMode(),
        websearch: isGroundingEnabled() || isDropshippingMode(),
        webfetch: isGroundingEnabled() || isDropshippingMode(),
      }

      const currentSystemInstructions = isDropshippingMode()
        ? `${systemInstructions()}\n\nDROPSHIPPING MODE ENABLED: Focus on market analysis, product sourcing (using websearch), and autonomous setup. Use 'websearch' to find actual trending products and suppliers.`
        : systemInstructions()

      await sdk.client.session.promptAsync({
        sessionID: sessionId,
        model: {
          modelID: geminiModel.id,
          providerID: geminiModel.provider.id,
        },
        system: currentSystemInstructions,
        tools: activeTools,
        parts: [{ type: "text", text: text }],
      })

      // Poll for response
      let found = false
      let attempts = 0
      let isMounted = true
      onCleanup(() => (isMounted = false))

      while (!found && attempts < 60 && isMounted) {
        await new Promise((r) => setTimeout(r, 1000))
        await sync.session.sync(sessionId)
        const sessionMessages = sync.data.message[sessionId] || []

        // Find all assistant messages for this session
        const assistantMsgs = sessionMessages.filter((m) => m.role === "assistant")
        const lastMsg = assistantMsgs[assistantMsgs.length - 1]

        if (lastMsg && (lastMsg as any).id > lastUserMsgId) {
          const parts = (lastMsg as any).parts || []
          const content = parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("")
          const toolCalls = parts.filter((p: any) => p.type === "tool")

          // Update activity status based on tools
          if (toolCalls.length > 0) {
            const activeTool = toolCalls.find((tool: any) => tool.state?.status === "running")
            if (activeTool) {
              setAgentActivity(`Agent using ${activeTool.tool}...`)
            } else {
              setAgentActivity(null)
            }
          } else {
            setAgentActivity(null)
          }

          if (
            content ||
            toolCalls.every(
              (tool: any) => (tool as any).state?.status === "completed" || (tool as any).state?.status === "error",
            )
          ) {
            setMessages((prev) => {
              // Check if we already have this message ID to avoid duplicates
              if (prev.some((m) => (m as any).id === lastMsg.id)) return prev
              return [
                ...prev,
                {
                  id: lastMsg.id,
                  role: "assistant",
                  content,
                  tools: toolCalls,
                } as Message,
              ]
            })

            if (content) parseSpec(content)

            // If it's finished and not waiting for tools, we found it
            if ((lastMsg as any).finish && (lastMsg as any).finish !== "tool-calls") {
              found = true
            }
          }
        }
        attempts++
      }
    } catch (error) {
      console.error("AI Error:", error)
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const parseSpec = (content: string) => {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1])
        if (data.type === "app-spec") {
          setDetectedSpec({
            name: data.name,
            mode: data.mode,
            data: data.data,
          })
        }
      } catch (e: any) {
        console.error("Failed to parse spec JSON", e)
      }
    }
  }

  return (
    <>
      <style>{animationStyles}</style>
      <div class="flex flex-col h-[750px] lg:h-[85vh] border border-white/20 rounded-[2rem] overflow-hidden bg-white/40 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] transition-all duration-700 ease-in-out">
        {/* Header */}
        <header class="h-20 border-b border-white/20 bg-gradient-to-r from-blue-600/80 via-indigo-600/80 to-purple-600/80 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 z-30 shadow-lg">
          <div class="flex items-center gap-4">
            <Button
              variant="ghost"
              class="lg:hidden text-white hover:bg-white/20 p-2 rounded-full"
              onClick={() => setShowLeftPanel(!showLeftPanel())}
            >
              <Icon name="dash" class="w-5 h-5" />
            </Button>
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
                <Icon name="brain" class="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 class="text-sm font-bold text-white tracking-tight">Gemini Agentic Builder</h2>
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <p class="text-[10px] text-blue-50/80 font-medium uppercase tracking-widest">Active Forge</p>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <Show when={detectedSpec()}>
              <Button
                variant="primary"
                size="small"
                class="bg-white text-blue-600 hover:bg-blue-50 border-none rounded-full px-5 h-9 text-xs font-bold transition-all shadow-lg hover:scale-105 active:scale-95"
                onClick={() => props.onApply(detectedSpec()!.name, detectedSpec()!.mode, detectedSpec()!.data)}
              >
                Apply Spec
              </Button>
            </Show>
            <Button
              variant="ghost"
              class="lg:hidden text-white hover:bg-white/20 p-2 rounded-full"
              onClick={() => setShowRightPanel(!showRightPanel())}
            >
              <Icon name="prompt" class="w-5 h-5" />
            </Button>
          </div>
        </header>

        <div class="flex flex-1 overflow-hidden bg-gradient-to-br from-[#f8f9ff] to-[#f0f4ff] relative">
          {/* Left Panel: System Instructions */}
          <aside
            class={`absolute inset-y-0 left-0 w-[300px] lg:relative lg:translate-x-0 transition-transform duration-300 ease-out z-10 border-r border-white/40 bg-white/70 backdrop-blur-xl p-6 flex flex-col gap-5 shrink-0 shadow-2xl lg:shadow-none ${
              showLeftPanel() ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div class="flex items-center justify-between">
              <h3 class="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600/60">Architect Rules</h3>
              <Button variant="ghost" class="lg:hidden p-1" onClick={() => setShowLeftPanel(false)}>
                <Icon name="dash" class="w-4 h-4 text-text-weak" />
              </Button>
            </div>
            <div class="flex-1 flex flex-col min-h-0">
              <textarea
                class="flex-1 w-full p-4 text-sm bg-white/50 border border-white/60 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none shadow-sm font-sans leading-relaxed"
                value={systemInstructions()}
                onInput={(e) => setSystemInstructions(e.currentTarget.value)}
                placeholder="Define your agent's soul..."
              />
            </div>
            <div class="p-4 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg shadow-blue-500/20">
              <p class="text-[11px] text-white/90 font-medium leading-relaxed">
                These commands forge the agent's behavior for every interaction.
              </p>
            </div>
          </aside>

          {/* Main Content: Chat Area */}
          <main class="flex-1 flex flex-col min-w-0 bg-transparent relative z-0">
            <ScrollView class="flex-1 p-4 lg:p-8" ref={scrollRef}>
              <div class="max-w-3xl mx-auto space-y-10 py-4">
                <For each={messages()}>
                  {(msg) => (
                    <div
                      class={`flex gap-4 group transition-all duration-500 ease-out animate-in slide-in-from-bottom-4 fill-mode-both ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        class={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
                          msg.role === "user"
                            ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20"
                            : "bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/20"
                        }`}
                      >
                        <Icon name={msg.role === "user" ? "prompt" : "brain"} class="w-5 h-5 text-white" />
                      </div>
                      <div class={`flex-1 min-w-0 max-w-[85%] ${msg.role === "user" ? "text-right" : ""}`}>
                        <div class="text-[10px] font-black text-blue-600/40 uppercase tracking-[0.2em] mb-2">
                          {msg.role === "user" ? "User Explorer" : "Gemini Architect"}
                        </div>
                        <div
                          class={`p-5 rounded-2xl text-[15px] leading-relaxed shadow-sm border transition-colors ${
                            msg.role === "user"
                              ? "bg-amber-50/80 border-amber-100 text-amber-900 rounded-tr-none marker:text-amber-500"
                              : "bg-white/90 border-white text-slate-800 rounded-tl-none"
                          }`}
                        >
                          <div class="whitespace-pre-wrap">{msg.content}</div>

                          <Show when={msg.tools && msg.tools.length > 0}>
                            <div class="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                              <For each={msg.tools}>
                                {(tool: any) => (
                                  <div
                                    class={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border shadow-sm transition-all ${
                                      tool.state?.status === "completed"
                                        ? "bg-green-50 border-green-100 text-green-700"
                                        : tool.state?.status === "error"
                                          ? "bg-red-50 border-red-100 text-red-700"
                                          : "bg-blue-50 border-blue-100 text-blue-700 animate-pulse"
                                    }`}
                                  >
                                    <Icon
                                      name={tool.state?.status === "completed" ? "brain" : "dash"}
                                      class="w-3 h-3"
                                    />
                                    <span>{tool.tool}</span>
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>
                  )}
                </For>

                <Show when={agentActivity() || isTyping()}>
                  <div class="flex gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
                    <div class="w-10 h-10 rounded-2xl bg-white border border-blue-100 shrink-0 flex items-center justify-center shadow-sm">
                      <Icon name="brain" class="w-5 h-5 text-blue-400 animate-pulse" />
                    </div>
                    <div class="flex-1 space-y-3">
                      <div class="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Processing</div>
                      <div class="inline-flex items-center gap-3 px-5 py-3 bg-white/60 backdrop-blur-sm border border-white rounded-2xl shadow-sm">
                        <Show
                          when={agentActivity()}
                          fallback={
                            <div class="flex gap-1.5">
                              <div class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                              <div class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          }
                        >
                          <div class="flex items-center gap-2 font-bold text-blue-600 text-xs">
                            <div class="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                            {agentActivity()}
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>
                </Show>
              </div>
            </ScrollView>

            {/* Chat Input */}
            <div class="p-6 border-t border-white/40 bg-white/30 backdrop-blur-xl">
              <div class="max-w-3xl mx-auto">
                <div class="group relative flex items-end gap-3 bg-white border border-white/60 rounded-[24px] p-2.5 shadow-2xl shadow-blue-500/5 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all">
                  <textarea
                    id="ai-input"
                    class="flex-1 bg-transparent border-none outline-none py-3 px-4 text-[15px] text-slate-800 placeholder:text-slate-400 resize-none max-h-48 min-h-[56px] leading-relaxed"
                    value={input()}
                    onInput={(e: any) => setInput(e.currentTarget.value)}
                    placeholder="Collaborate with your Agentic Architect..."
                    onKeyDown={(e: any) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    class="mb-1 mr-1 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 shrink-0 flex items-center justify-center p-0 shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:shadow-inner active:translate-y-0.5 disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:shadow-none"
                    onClick={handleSend}
                    disabled={isTyping() || !input().trim()}
                  >
                    <Icon name="prompt" class="w-6 h-6 text-white" />
                  </Button>
                </div>
                <div class="mt-4 flex items-center justify-center gap-4">
                  <div class="h-px flex-1 bg-gradient-to-r from-transparent via-blue-100 to-transparent" />
                  <div class="text-[10px] font-black text-blue-600/30 uppercase tracking-[0.2em] whitespace-nowrap">
                    Forging Next-Gen Applications
                  </div>
                  <div class="h-px flex-1 bg-gradient-to-r from-transparent via-blue-100 to-transparent" />
                </div>
              </div>
            </div>
          </main>

          {/* Right Panel: Settings */}
          <aside
            class={`absolute inset-y-0 right-0 w-[300px] lg:relative lg:translate-x-0 transition-transform duration-300 ease-out z-10 border-l border-white/40 bg-white/70 backdrop-blur-xl p-6 flex flex-col gap-8 shrink-0 overflow-y-auto shadow-2xl lg:shadow-none ${
              showRightPanel() ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div class="flex items-center justify-between lg:hidden">
              <h3 class="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600/60">Forge Settings</h3>
              <Button variant="ghost" class="p-1" onClick={() => setShowRightPanel(false)}>
                <Icon name="dash" class="w-4 h-4 text-text-weak" />
              </Button>
            </div>
            <div>
              <h3 class="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600/60 mb-5">
                Model Intelligence
              </h3>
              <div class="relative">
                <select
                  class="w-full h-10 px-3 bg-[#f8f9fa] border border-surface-subtle rounded-lg text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                  value={selectedModel()}
                  onChange={(e) => setSelectedModel(e.currentTarget.value)}
                >
                  <For each={models.list().filter((m) => m.id.includes("gemini"))}>
                    {(model) => <option value={model.id}>{model.id.split("/").pop()}</option>}
                  </For>
                  <Show when={models.list().filter((m) => m.id.includes("gemini")).length === 0}>
                    <For each={models.list().slice(0, 5)}>
                      {(model) => <option value={model.id}>{model.id}</option>}
                    </For>
                  </Show>
                </select>
                <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-weak font-bold">
                  ▾
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <h3 class="text-[12px] font-bold uppercase tracking-wider text-text-weak">Parameters</h3>

              <div class="space-y-3">
                <div class="flex justify-between items-center px-0.5">
                  <label class="text-[13px] font-medium text-text-base">Temperature</label>
                  <span class="text-[12px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded leading-none">
                    {temperature()}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  class="w-full accent-blue-600"
                  value={temperature()}
                  onInput={(e) => setTemperature(parseFloat(e.currentTarget.value))}
                />
              </div>

              <div class="space-y-3">
                <div class="flex justify-between items-center px-0.5">
                  <label class="text-[13px] font-medium text-text-base">Top K</label>
                  <span class="text-[12px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded leading-none">
                    {topK()}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  class="w-full accent-blue-600"
                  value={topK()}
                  onInput={(e) => setTopK(parseInt(e.currentTarget.value))}
                />
              </div>

              <div class="space-y-3">
                <div class="flex justify-between items-center px-0.5">
                  <label class="text-[13px] font-medium text-text-base">Top P</label>
                  <span class="text-[12px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded leading-none">
                    {topP()}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="w-full accent-blue-600"
                  value={topP()}
                  onInput={(e) => setTopP(parseFloat(e.currentTarget.value))}
                />
              </div>

              <div class="pt-4 space-y-4">
                <h3 class="text-[12px] font-bold uppercase tracking-wider text-text-weak">Agent Capabilities</h3>

                <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-surface-subtle">
                  <div class="flex items-center gap-3">
                    <Icon name="dash" class="w-4 h-4 text-blue-600" />
                    <span class="text-[13px] font-medium">Grounding (Search)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isGroundingEnabled()}
                    onChange={(e) => setIsGroundingEnabled(e.currentTarget.checked)}
                    class="w-4 h-4 accent-blue-600"
                  />
                </div>

                <div class="flex items-center justify-between p-3 bg-green-50/50 rounded-lg border border-green-100">
                  <div class="flex items-center gap-3">
                    <Icon name="brain" class="w-4 h-4 text-green-600" />
                    <span class="text-[13px] font-medium">Dropshipping AI</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isDropshippingMode()}
                    onChange={(e) => setIsDropshippingMode(e.currentTarget.checked)}
                    class="w-4 h-4 accent-green-600"
                  />
                </div>

                <div class="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-surface-subtle">
                  <div class="flex items-center gap-3">
                    <Icon name="prompt" class="w-4 h-4 text-slate-600" />
                    <span class="text-[13px] font-medium">Build Mode (Vibe)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isVibeCodingEnabled()}
                    onChange={(e) => setIsVibeCodingEnabled(e.currentTarget.checked)}
                    class="w-4 h-4 accent-slate-600"
                  />
                </div>
              </div>
            </div>

            <div class="mt-auto pt-6 border-t border-surface-subtle">
              <div class="flex items-center gap-2 text-text-weak group cursor-help">
                <Icon name="brain" class="w-3.5 h-3.5 group-hover:text-blue-500 transition-colors opacity-50" />
                <span class="text-[11px] group-hover:text-text-base transition-colors">
                  Advanced configurations are applied to your current build session.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
