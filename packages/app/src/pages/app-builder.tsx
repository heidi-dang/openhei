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
        const data = await response.json()
        setSessions(data.jobs)
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
        body: JSON.stringify({ name, mode, formData: formData as unknown as Record<string, unknown> }),
      })

      if (response.ok) {
        const data = await response.json()
        setActiveSessionId(data.job.id)
        navigate(`/app-builder/${data.job.id}`)
        await fetchSessions()
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
    <div class="h-full flex">
      {/* Sidebar */}
      <div class="w-72 border-r flex flex-col bg-surface">
        <div class="p-4 border-b">
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
                  setActiveSessionId(null)
                  navigate("/app-builder")
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
                  setActiveSessionId(null)
                  navigate("/app-builder")
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
                  setActiveSessionId(null)
                  navigate("/app-builder")
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
                  <Icon name="brain" class="w-5 h-5 text-yellow-500 mt-0.5" />
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
                      onClick={() => {
                        setActiveSessionId(session.id)
                        navigate(`/app-builder/${session.id}`)
                      }}
                    >
                      <div class="flex items-center justify-between">
                        <span class="font-medium truncate">{session.name}</span>
                        <Tag class="text-xs">{session.status}</Tag>
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
          {(session) => (
            <BuildSessionDetail
              session={session()}
              onBack={() => {
                setActiveSessionId(null)
                navigate("/app-builder")
              }}
              onRefresh={fetchSessions}
            />
          )}
        </Show>

        <Show when={!activeSession()}>
          <div class="h-full overflow-auto p-8">
            <div class="max-w-4xl mx-auto">
              {/* Header */}
              <div class="text-center mb-8">
                <h1 class="text-3xl font-bold">App Builder</h1>
                <p class="text-lg text-text-weak mt-2">
                  Describe what you want. We generate backend + UI and run it locally.
                </p>
              </div>

              {/* Creation Options */}
              <Tabs value={activeTab()} onValueChange={(v: string) => setActiveTab(v as CreationMode)}>
                <TabsList class="grid w-full grid-cols-3">
                  <TabsTrigger value="backend">
                    <Icon name="server" class="w-4 h-4 mr-2" />
                    Backend Form
                  </TabsTrigger>
                  <TabsTrigger value="ui">
                    <Icon name="layout-right" class="w-4 h-4 mr-2" />
                    UI Form
                  </TabsTrigger>
                  <TabsTrigger value="repo">
                    <Icon name="github" class="w-4 h-4 mr-2" />
                    Import Repo
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="backend" class="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Create Backend Service</CardTitle>
                      <CardDescription>
                        Define your API endpoints, data models, and requirements. We'll generate a working backend
                        service.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BackendForm onSubmit={handleCreateBackend} onCancel={() => {}} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ui" class="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Create Frontend UI</CardTitle>
                      <CardDescription>Design your user interface with pages, components, and flows.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <UIForm onSubmit={handleCreateUI} onCancel={() => {}} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="repo" class="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Import from GitHub (Run Only)</CardTitle>
                      <CardDescription>
                        Clone and run an existing repository. No AI modifications will be made.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
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
