/**
 * AppBuild Job Types - Node.js Local Backend
 * Server-side types for the App Builder job system
 */

export type JobStatus = 
  | 'queued'
  | 'planning'
  | 'generating'
  | 'validating'
  | 'running'
  | 'ready'
  | 'failed'
  | 'stopped'

export type JobPhase = 
  | 'plan'
  | 'scaffold'
  | 'implement'
  | 'validate'
  | 'run-backend'
  | 'run-frontend'
  | 'ready'

export interface JobPhaseInfo {
  id: JobPhase
  label: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  startedAt?: number
  completedAt?: number
}

export type SandboxMode = 'docker' | 'host'

export interface AppBuildJob {
  id: string
  name: string
  mode: 'backend' | 'ui' | 'repo'
  status: JobStatus
  currentPhase: JobPhase | null
  phases: JobPhaseInfo[]
  formData: Record<string, unknown>
  workspacePath: string
  createdAt: number
  updatedAt: number
  
  // Sandbox mode
  sandboxMode: SandboxMode
  
  // Process info
  backend?: {
    port: number
    pid?: number
    containerId?: string
    status: 'starting' | 'running' | 'stopped' | 'error'
    healthCheck?: boolean
    lastHealthCheck?: number
    restartCount?: number
  }
  frontend?: {
    port: number
    pid?: number
    containerId?: string
    status: 'starting' | 'running' | 'stopped' | 'error'
    restartCount?: number
  }
  
  // URLs
  previewUrl?: string
  backendUrl?: string
  
  // Error info
  error?: {
    phase: JobPhase
    message: string
    command?: string
    exitCode?: number
    timestamp: number
  }
}

export interface JobLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  phase?: JobPhase
  metadata?: Record<string, unknown>
}

export interface CreateJobRequest {
  name: string
  mode: 'backend' | 'ui' | 'repo'
  formData: Record<string, unknown>
}

export interface JobListResponse {
  jobs: AppBuildJob[]
}

export interface JobDetailResponse {
  job: AppBuildJob
  logs: JobLogEntry[]
}

// Running process info
export interface RunningProcess {
  process: import('child_process').ChildProcess
  port: number
}
