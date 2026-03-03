/**
 * Build Session Detail Component
 * Shows detailed view of a build session with tabs for Progress, Logs, Backend, and Preview
 */

import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js"
import { Button } from "@openhei-ai/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@openhei-ai/ui/card"
import { Tag } from "@openhei-ai/ui/tag"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@openhei-ai/ui/tabs"
import { Icon } from "@openhei-ai/ui/icon"
import { ScrollView } from "@openhei-ai/ui/scroll-view"
import type { BuildSession, BuildLog } from "@/types/app-builder"

interface BuildSessionDetailProps {
  session: BuildSession
  onBack: () => void
  onRefresh: () => void
}

const API_BASE = "/appbuild"

export function BuildSessionDetail(props: BuildSessionDetailProps) {
  const [activeTab, setActiveTab] = createSignal("progress")
  const [logs, setLogs] = createSignal<BuildLog[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = createSignal(false)
  const [backendHealth, setBackendHealth] = createSignal<{ healthy: boolean; message: string } | null>(null)
  const [isRestartingBackend, setIsRestartingBackend] = createSignal(false)
  const [isRestartingFrontend, setIsRestartingFrontend] = createSignal(false)
  const [isStopping, setIsStopping] = createSignal(false)

  // Poll for logs when on logs tab
  let logsInterval: number | null = null

  createEffect(() => {
    if (activeTab() === "logs") {
      fetchLogs()
      logsInterval = window.setInterval(fetchLogs, 1000)
    } else {
      if (logsInterval) {
        clearInterval(logsInterval)
        logsInterval = null
      }
    }
  })

  onCleanup(() => {
    if (logsInterval) clearInterval(logsInterval)
  })

  const fetchLogs = async () => {
    if (isLoadingLogs()) return
    setIsLoadingLogs(true)
    try {
      const response = await fetch(`${API_BASE}/jobs/${props.session.id}/logs?limit=100`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs)
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setIsLoadingLogs(false)
    }
  }

  const checkBackendHealth = async () => {
    try {
      const response = await fetch(`${API_BASE}/jobs/${props.session.id}/health`)
      if (response.ok) {
        const data = await response.json()
        setBackendHealth(data)
      }
    } catch (error) {
      setBackendHealth({ healthy: false, message: "Health check failed" })
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    try {
      await fetch(`${API_BASE}/jobs/${props.session.id}/stop`, { method: "POST" })
      props.onRefresh()
    } catch (error) {
      console.error("Failed to stop:", error)
    } finally {
      setIsStopping(false)
    }
  }

  const handleRestartBackend = async () => {
    setIsRestartingBackend(true)
    try {
      await fetch(`${API_BASE}/jobs/${props.session.id}/restart-backend`, { method: "POST" })
      props.onRefresh()
    } catch (error) {
      console.error("Failed to restart backend:", error)
    } finally {
      setIsRestartingBackend(false)
    }
  }

  const handleRestartFrontend = async () => {
    setIsRestartingFrontend(true)
    try {
      await fetch(`${API_BASE}/jobs/${props.session.id}/restart-frontend`, { method: "POST" })
      props.onRefresh()
    } catch (error) {
      console.error("Failed to restart frontend:", error)
    } finally {
      setIsRestartingFrontend(false)
    }
  }

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

  const getPhaseStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Icon name="circle-check" class="w-5 h-5 text-green-500" />
      case "in-progress":
        return <Icon name="prompt" class="w-5 h-5 text-blue-500 animate-spin" />
      case "failed":
        return <Icon name="circle-x" class="w-5 h-5 text-red-500" />
      default:
        return <Icon name="circle-x" class="w-5 h-5 text-gray-300" />
    }
  }

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500"
      case "warn":
        return "text-yellow-500"
      case "success":
        return "text-green-500"
      default:
        return "text-gray-600"
    }
  }

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString()
  }

  const formatDuration = (start?: number, end?: number) => {
    if (!start) return ""
    const endTime = end || Date.now()
    const seconds = Math.round((endTime - start) / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds % 60
    return `${minutes}m ${remaining}s`
  }

  return (
    <div class="h-full flex flex-col">
      {/* Header */}
      <div class="border-b p-4 flex items-center justify-between bg-surface">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="small" onClick={props.onBack}>
            <Icon name="arrow-left" class="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 class="text-lg font-semibold">{props.session.name}</h2>
            <div class="flex items-center gap-2 text-sm text-text-weak">
              <span class="capitalize">{props.session.mode}</span>
              <span>•</span>
              <Tag class="text-xs">{props.session.status}</Tag>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Show when={props.session.status === "running" || props.session.status === "ready"}>
            <Button variant="ghost" size="small" onClick={handleStop} disabled={isStopping()}>
              <Icon name="stop" class="w-4 h-4 mr-2" />
              Stop
            </Button>
          </Show>
          <Button variant="ghost" size="small" onClick={props.onRefresh}>
            <Icon name="new-session" class="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab()} onValueChange={setActiveTab} class="flex-1 flex flex-col overflow-hidden">
        <TabsList class="mx-4 mt-4 w-auto justify-start">
          <TabsTrigger value="progress">
            <Icon name="console" class="w-4 h-4 mr-2" />
            Progress
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Icon name="console" class="w-4 h-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="backend">
            <Icon name="server" class="w-4 h-4 mr-2" />
            Backend
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Icon name="eye" class="w-4 h-4 mr-2" />
            Preview
          </TabsTrigger>
        </TabsList>

        {/* Progress Tab */}
        <TabsContent value="progress" class="flex-1 overflow-auto p-4 m-0">
          <div class="max-w-3xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Build Pipeline</CardTitle>
                <CardDescription>Current phase: {props.session.currentPhase || "Waiting to start"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="space-y-4">
                  <For each={props.session.phases}>
                    {(phase, index) => (
                      <div class="flex items-start gap-4">
                        <div class="flex-shrink-0 mt-0.5">{getPhaseStatusIcon(phase.status)}</div>
                        <div class="flex-1">
                          <div class="flex items-center justify-between">
                            <h4 class="font-medium">{phase.label}</h4>
                            <Show when={phase.startedAt}>
                              <span class="text-xs text-text-weak">
                                {formatDuration(phase.startedAt, phase.completedAt)}
                              </span>
                            </Show>
                          </div>
                          <p class="text-sm text-text-weak mt-1">{phase.description}</p>
                          <Show when={phase.status === "in-progress"}>
                            <div class="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div class="h-full bg-blue-500 animate-pulse w-2/3" />
                            </div>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </CardContent>
            </Card>

            {/* Workspace Info */}
            <Card>
              <CardHeader>
                <CardTitle>Workspace</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-text-weak">Path:</span>
                    <code class="bg-surface-2 px-2 py-1 rounded">{props.session.workspacePath}</code>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-text-weak">Created:</span>
                    <span>{new Date(props.session.createdAt).toLocaleString()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-text-weak">Updated:</span>
                    <span>{new Date(props.session.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" class="flex-1 overflow-hidden p-4 m-0">
          <Card class="h-full flex flex-col">
            <CardHeader class="flex-shrink-0">
              <div class="flex items-center justify-between">
                <CardTitle>Build Logs</CardTitle>
                <Button variant="ghost" size="small" onClick={fetchLogs}>
                  <Icon name="new-session" class="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent class="flex-1 overflow-hidden p-0">
              <ScrollView class="h-full">
                <div class="p-4 space-y-1 font-mono text-sm">
                  <Show when={logs().length === 0}>
                    <p class="text-text-weak text-center py-8">No logs yet...</p>
                  </Show>
                  <For each={logs()}>
                    {(log) => (
                      <div class="flex gap-2 py-1 hover:bg-surface-2">
                        <span class="text-text-weak flex-shrink-0">{formatTimestamp(log.timestamp)}</span>
                        <span class={`flex-shrink-0 uppercase text-xs ${getLogLevelColor(log.level)}`}>
                          [{log.level}]
                        </span>
                        <span class="break-all">{log.message}</span>
                      </div>
                    )}
                  </For>
                </div>
              </ScrollView>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backend Tab */}
        <TabsContent value="backend" class="flex-1 overflow-auto p-4 m-0">
          <div class="max-w-3xl mx-auto space-y-6">
            {/* Backend Status Card */}
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2">
                  <Icon name="server" class="w-5 h-5" />
                  Backend Service
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Show
                  when={props.session.backend}
                  fallback={<p class="text-text-weak text-center py-8">Backend not started yet</p>}
                >
                  {(backend) => (
                    <div class="space-y-4">
                      <div class="grid grid-cols-2 gap-4">
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">Status</p>
                          <div class="flex items-center gap-2 mt-1">
                            <div
                              class={`w-2 h-2 rounded-full ${
                                backend().status === "running"
                                  ? "bg-green-500"
                                  : backend().status === "error"
                                    ? "bg-red-500"
                                    : "bg-yellow-500"
                              }`}
                            />
                            <span class="font-medium capitalize">{backend().status}</span>
                          </div>
                        </div>
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">Port</p>
                          <p class="font-medium mt-1">{backend().port}</p>
                        </div>
                      </div>

                      <Show when={backend().pid}>
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">Process ID (PID)</p>
                          <code class="font-mono text-sm mt-1 block">{backend().pid}</code>
                        </div>
                      </Show>

                      <Show when={props.session.backendUrl}>
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">API URL</p>
                          <a
                            href={props.session.backendUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-500 hover:underline mt-1 block"
                          >
                            {props.session.backendUrl}
                          </a>
                        </div>
                      </Show>

                      <div class="flex gap-2">
                        <Button variant="secondary" onClick={handleRestartBackend} disabled={isRestartingBackend()}>
                          <Icon name="new-session" class="w-4 h-4 mr-2" />
                          Restart Backend
                        </Button>
                        <Button variant="ghost" onClick={checkBackendHealth}>
                          <Icon name="console" class="w-4 h-4 mr-2" />
                          Health Check
                        </Button>
                      </div>

                      <Show when={backendHealth()}>
                        {(health) => (
                          <div class={`p-4 rounded-lg ${health().healthy ? "bg-green-50" : "bg-red-50"}`}>
                            <div class="flex items-center gap-2">
                              <Icon
                                name={health().healthy ? "circle-check" : "circle-x"}
                                class={`w-5 h-5 ${health().healthy ? "text-green-500" : "text-red-500"}`}
                              />
                              <span class={health().healthy ? "text-green-700" : "text-red-700"}>
                                {health().message}
                              </span>
                            </div>
                          </div>
                        )}
                      </Show>
                    </div>
                  )}
                </Show>
              </CardContent>
            </Card>

            {/* Frontend Status Card */}
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2">
                  <Icon name="layout-right" class="w-5 h-5" />
                  Frontend Service
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Show
                  when={props.session.frontend}
                  fallback={<p class="text-text-weak text-center py-8">Frontend not started yet</p>}
                >
                  {(frontend) => (
                    <div class="space-y-4">
                      <div class="grid grid-cols-2 gap-4">
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">Status</p>
                          <div class="flex items-center gap-2 mt-1">
                            <div
                              class={`w-2 h-2 rounded-full ${
                                frontend().status === "running"
                                  ? "bg-green-500"
                                  : frontend().status === "error"
                                    ? "bg-red-500"
                                    : "bg-yellow-500"
                              }`}
                            />
                            <span class="font-medium capitalize">{frontend().status}</span>
                          </div>
                        </div>
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">Port</p>
                          <p class="font-medium mt-1">{frontend().port}</p>
                        </div>
                      </div>

                      <Show when={frontend().pid}>
                        <div class="p-4 bg-surface-2 rounded-lg">
                          <p class="text-sm text-text-weak">Process ID (PID)</p>
                          <code class="font-mono text-sm mt-1 block">{frontend().pid}</code>
                        </div>
                      </Show>

                      <div class="flex gap-2">
                        <Button variant="secondary" onClick={handleRestartFrontend} disabled={isRestartingFrontend()}>
                          <Icon name="new-session" class="w-4 h-4 mr-2" />
                          Restart Frontend
                        </Button>
                      </div>
                    </div>
                  )}
                </Show>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" class="flex-1 overflow-hidden p-4 m-0">
          <Show
            when={props.session.previewUrl}
            fallback={
              <div class="h-full flex items-center justify-center">
                <Card class="max-w-md">
                  <CardContent class="pt-6 text-center">
                    <Icon name="eye" class="w-12 h-12 text-text-weak mx-auto mb-4" />
                    <h3 class="text-lg font-medium">Preview Not Available</h3>
                    <p class="text-text-weak mt-2">
                      The preview will be available once the frontend is built and running.
                    </p>
                  </CardContent>
                </Card>
              </div>
            }
          >
            {(url) => (
              <div class="h-full flex flex-col">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <Icon name="square-arrow-top-right" class="w-4 h-4 text-text-weak" />
                    <span class="text-sm text-text-weak">{url()}</span>
                  </div>
                  <Button variant="ghost" size="small" asChild>
                    <a href={url()} target="_blank" rel="noopener noreferrer">
                      <Icon name="square-arrow-top-right" class="w-4 h-4 mr-2" />
                      Open in New Tab
                    </a>
                  </Button>
                </div>
                <div class="flex-1 border rounded-lg overflow-hidden bg-white">
                  <iframe
                    src={url()}
                    class="w-full h-full"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="App Preview"
                  />
                </div>
              </div>
            )}
          </Show>
        </TabsContent>
      </Tabs>
    </div>
  )
}
