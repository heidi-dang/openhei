/**
 * App Builder Page
 * Main page for the OpenHei App Builder feature
 */

import { createSignal, For, Show, onMount } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Button } from "@openhei-ai/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@openhei-ai/ui/card"
import { Tag } from "@openhei-ai/ui/tag"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@openhei-ai/ui/tabs"
import { Icon } from "@openhei-ai/ui/icon"
import { ScrollView } from "@openhei-ai/ui/scroll-view"
import { BackendForm } from "@/components/app-builder/backend-form"
import { UIForm } from "@/components/app-builder/ui-form"
import { RepoImportForm } from "@/components/app-builder/repo-import-form"
import { BuildSessionDetail } from "@/components/app-builder/build-session-detail"
import { sampleTasksApp } from "@/types/app-builder"
import type { BackendFormData, UIFormData, RepoImportFormData, CreationMode, BuildSession } from "@/types/app-builder"

const API_BASE = "/appbuild"

export default function AppBuilder() {
  const navigate = useNavigate()
  const params = useParams()

  const [activeTab, setActiveTab] = createSignal<CreationMode>("backend")
  const [sessions, setSessions] = createSignal<BuildSession[]>([])
  const [activeSessionId, setActiveSessionId] = createSignal<string | null>(null)
  const [isLoading, setIsLoading] = createSignal(true)
  const [showMobileSidebar, setShowMobileSidebar] = createSignal(false)

  // Fetch sessions on mount
  onMount(() => {
    fetchSessions()

    if (params.sessionId) {
      setActiveSessionId(params.sessionId)
    }

    // Poll for updates
    const interval = setInterval(fetchSessions, 2000)
    return () => clearInterval(interval)
  })

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/jobs`)
      if (response.ok) {
        const data = (await response.json()) as { jobs?: BuildSession[] }
        setSessions(data.jobs || [])
      } else {
        console.error("Failed to fetch sessions:", response.status, response.statusText)
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createSession = async (
    name: string,
    mode: CreationMode,
    formData: BackendFormData | UIFormData | RepoImportFormData,
  ) => {
    try {
      const response = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mode,
          formData: formData as unknown as Record<string, unknown>,
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as { job?: BuildSession }
        if (data.job?.id) {
          setActiveSessionId(data.job.id)
          setShowMobileSidebar(false)
          navigate(`/app-builder/${data.job.id}`)
          await fetchSessions()
        } else {
          console.error("Invalid response from server:", data)
        }
      } else {
        const errorText = await response.text()
        console.error("Failed to create session:", response.status, errorText)
      }
    } catch (error) {
      console.error("Failed to create session:", error)
    }
  }

  const handleCreateBackend = (data: BackendFormData) => {
    createSession(data.appName, "backend", data)
  }

  const handleCreateUI = (data: UIFormData) => {
    createSession(data.appName, "ui", data)
  }

  const handleImportRepo = (data: RepoImportFormData) => {
    const name = data.repoUrl.split("/").pop()?.replace(".git", "") || "Imported Repo"
    createSession(name, "repo", data)
  }

  const handleUseSample = () => {
    const backendData = sampleTasksApp.backend()
    createSession("Sample Tasks App", "backend", backendData)
  }

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setShowMobileSidebar(false)
    navigate(`/app-builder/${sessionId}`)
  }

  const handleBackToList = () => {
    setActiveSessionId(null)
    setShowMobileSidebar(false)
    navigate("/app-builder")
  }

  const activeSession = () => sessions().find((s) => s.id === activeSessionId())

  const getStatusColor = (status: string): "success" | "destructive" | "secondary" | "outline" | "warning" => {
    switch (status) {
      case "ready":
        return "success"
      case "failed":
        return "destructive"
      case "queued":
        return "secondary"
      case "stopped":
        return "outline"
      default:
        return "warning"
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div class="h-full flex flex-col md:flex-row">
      {/* Mobile Header - Only visible on mobile */}
      <div class="md:hidden border-b p-3 flex items-center justify-between bg-surface">
        <div class="flex items-center gap-2">
          <Icon name="prompt" class="w-5 h-5" />
          <span class="font-semibold">App Builder</span>
        </div>
        <Button variant="ghost" size="small" onClick={() => setShowMobileSidebar(!showMobileSidebar())}>
          <Icon name={showMobileSidebar() ? "close" : "menu"} class="w-5 h-5" />
        </Button>
      </div>

      {/* Sidebar */}
      <div
        class={`
          border-r flex flex-col bg-surface
          ${activeSessionId() && !showMobileSidebar() ? "hidden md:flex" : "flex"}
          ${showMobileSidebar() ? "fixed inset-0 z-50 md:static md:inset-auto" : ""}
          w-full md:w-72
        `}
      >
        {/* Mobile Close Button */}
        <Show when={showMobileSidebar()}>
          <div class="md:hidden p-3 border-b flex items-center justify-between">
            <span class="font-semibold">Menu</span>
            <Button variant="ghost" size="small" onClick={() => setShowMobileSidebar(false)}>
              <Icon name="close" class="w-5 h-5" />
            </Button>
          </div>
        </Show>

        <div class="p-4 border-b hidden md:block">
          <h1 class="text-lg font-semibold flex items-center gap-2">
            <Icon name="prompt" class="w-5 h-5" />
            App Builder
          </h1>
          <p class="text-sm text-text-weak mt-1">Build apps with AI assistance</p>
        </div>

        <ScrollView class="flex-1">
          <div class="p-4 space-y-4">
            {/* New Build Buttons */}
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-text-weak">Create New</h3>
              <Button
                variant="secondary"
                class="w-full justify-start"
                onClick={() => {
                  handleBackToList()
                  setActiveTab("backend")
                }}
              >
                <Icon name="server" class="w-4 h-4 mr-2" />
                Backend Service
              </Button>
              <Button
                variant="secondary"
                class="w-full justify-start"
                onClick={() => {
                  handleBackToList()
                  setActiveTab("ui")
                }}
              >
                <Icon name="layout-right" class="w-4 h-4 mr-2" />
                Frontend UI
              </Button>
              <Button
                variant="secondary"
                class="w-full justify-start"
                onClick={() => {
                  handleBackToList()
                  setActiveTab("repo")
                }}
              >
                <Icon name="github" class="w-4 h-4 mr-2" />
                Import Repository
              </Button>
            </div>

            {/* Sample App */}
            <Card class="bg-surface-2">
              <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                  <Icon name="brain" class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div class="flex-1">
                    <p class="text-sm font-medium">Try Sample App</p>
                    <p class="text-xs text-text-weak mt-1">Quick demo with a Tasks API</p>
                    <Button size="small" variant="secondary" class="mt-2" onClick={handleUseSample}>
                      Create Sample
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div class="h-px bg-border my-4" />

            {/* Build Sessions List */}
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-text-weak">Build Sessions ({sessions().length})</h3>
              <Show when={sessions().length === 0 && !isLoading()}>
                <p class="text-sm text-text-weak text-center py-4">No build sessions yet</p>
              </Show>
              <div class="space-y-2">
                <For each={sessions().sort((a, b) => b.updatedAt - a.updatedAt)}>
                  {(session) => (
                    <button
                      class={`
                        w-full text-left p-3 rounded-lg border transition-colors
                        ${activeSessionId() === session.id ? "border-primary bg-primary/5" : "hover:bg-surface-2"}
                      `}
                      onClick={() => handleSelectSession(session.id)}
                    >
                      <div class="flex items-center justify-between">
                        <span class="font-medium truncate">{session.name}</span>
                        <Tag class="text-xs flex-shrink-0">{session.status}</Tag>
                      </div>
                      <div class="flex items-center justify-between mt-1 text-xs text-text-weak">
                        <span class="capitalize">{session.mode}</span>
                        <span>{formatDate(session.updatedAt)}</span>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </ScrollView>
      </div>

      {/* Main Content */}
      <div class="flex-1 overflow-hidden bg-surface">
        <Show when={activeSession()}>
          {(session) => <BuildSessionDetail session={session()} onBack={handleBackToList} onRefresh={fetchSessions} />}
        </Show>

        <Show when={!activeSession()}>
          <div class="h-full overflow-auto p-4 sm:p-8">
            <div class="max-w-4xl mx-auto">
              {/* Header */}
              <div class="text-center mb-6 sm:mb-8">
                <h1 class="text-2xl sm:text-3xl font-bold">App Builder</h1>
                <p class="text-base sm:text-lg text-text-weak mt-2">
                  Describe what you want. We generate backend + UI and run it locally.
                </p>
              </div>

              {/* Creation Options */}
              <Tabs value={activeTab()} onValueChange={(v: string) => setActiveTab(v as CreationMode)}>
                <TabsList class="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="backend" class="text-xs sm:text-sm py-2">
                    <Icon name="server" class="w-4 h-4 mr-1 sm:mr-2" />
                    <span class="hidden sm:inline">Backend</span>
                    <span class="sm:hidden">API</span>
                  </TabsTrigger>
                  <TabsTrigger value="ui" class="text-xs sm:text-sm py-2">
                    <Icon name="layout-right" class="w-4 h-4 mr-1 sm:mr-2" />
                    <span class="hidden sm:inline">Frontend</span>
                    <span class="sm:hidden">UI</span>
                  </TabsTrigger>
                  <TabsTrigger value="repo" class="text-xs sm:text-sm py-2">
                    <Icon name="github" class="w-4 h-4 mr-1 sm:mr-2" />
                    <span class="hidden sm:inline">Import</span>
                    <span class="sm:hidden">Repo</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="backend" class="mt-4 sm:mt-6">
                  <Card>
                    <CardHeader class="p-4 sm:p-6">
                      <CardTitle class="text-lg sm:text-xl">Create Backend Service</CardTitle>
                      <CardDescription class="text-sm">
                        Define your API endpoints, data models, and requirements. We'll generate a working backend
                        service.
                      </CardDescription>
                    </CardHeader>
                    <CardContent class="p-4 sm:p-6 pt-0">
                      <BackendForm onSubmit={handleCreateBackend} onCancel={() => {}} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ui" class="mt-4 sm:mt-6">
                  <Card>
                    <CardHeader class="p-4 sm:p-6">
                      <CardTitle class="text-lg sm:text-xl">Create Frontend UI</CardTitle>
                      <CardDescription class="text-sm">
                        Design your user interface with pages, components, and flows.
                      </CardDescription>
                    </CardHeader>
                    <CardContent class="p-4 sm:p-6 pt-0">
                      <UIForm onSubmit={handleCreateUI} onCancel={() => {}} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="repo" class="mt-4 sm:mt-6">
                  <Card>
                    <CardHeader class="p-4 sm:p-6">
                      <CardTitle class="text-lg sm:text-xl">Import from GitHub (Run Only)</CardTitle>
                      <CardDescription class="text-sm">
                        Clone and run an existing repository. No AI modifications will be made.
                      </CardDescription>
                    </CardHeader>
                    <CardContent class="p-4 sm:p-6 pt-0">
                      <RepoImportForm onSubmit={handleImportRepo} onCancel={() => {}} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
