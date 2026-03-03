/**
 * AppBuild Job Manager - Node.js Local Backend
 * Manages the lifecycle of app build jobs with disk persistence
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { AppBuildJob, JobStatus, JobPhase, JobPhaseInfo, JobLogEntry, CreateJobRequest, RunningProcess, SandboxMode } from './types'

const APPBUILD_DIR = '.openhei/appbuild'
const JOB_FILE = 'job.json'
const LOGS_FILE = 'logs.json'
const WORKSPACE_DIR = 'workspace'

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Initialize phases
const createPhases = (mode: 'backend' | 'ui' | 'repo'): JobPhaseInfo[] => {
  const basePhases: JobPhaseInfo[] = [
    { id: 'plan', label: 'Plan', description: 'Generate build plan and architecture', status: 'pending' },
    { id: 'scaffold', label: 'Scaffold', description: 'Create project structure', status: 'pending' },
    { id: 'implement', label: 'Implement', description: 'Generate code', status: 'pending' },
    { id: 'validate', label: 'Validate', description: 'Validate generated code', status: 'pending' }
  ]
  
  if (mode === 'backend' || mode === 'repo') {
    basePhases.push({ id: 'run-backend', label: 'Run Backend', description: 'Start backend service', status: 'pending' })
  }
  
  if (mode === 'ui' || mode === 'repo') {
    basePhases.push({ id: 'run-frontend', label: 'Run Frontend', description: 'Start frontend service', status: 'pending' })
  }
  
  basePhases.push({ id: 'ready', label: 'Ready', description: 'Build complete', status: 'pending' })
  
  return basePhases
}

export class JobManager {
  private workspaceRoot: string
  private runningProcesses = new Map<string, {
    backend?: RunningProcess
    frontend?: RunningProcess
  }>()
  
  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = workspaceRoot
  }
  
  private getJobDir(jobId: string): string {
    return path.join(this.workspaceRoot, APPBUILD_DIR, jobId)
  }
  
  private getJobFilePath(jobId: string): string {
    return path.join(this.getJobDir(jobId), JOB_FILE)
  }
  
  private getLogsFilePath(jobId: string): string {
    return path.join(this.getJobDir(jobId), LOGS_FILE)
  }
  
  // Create a new job
  async createJob(request: CreateJobRequest & { sandboxMode?: SandboxMode }): Promise<AppBuildJob> {
    const id = generateId()
    const workspacePath = path.join(this.workspaceRoot, APPBUILD_DIR, id, WORKSPACE_DIR)
    
    const job: AppBuildJob = {
      id,
      name: request.name,
      mode: request.mode,
      status: 'queued',
      currentPhase: null,
      phases: createPhases(request.mode),
      formData: request.formData,
      workspacePath,
      sandboxMode: request.sandboxMode || 'docker', // Default to docker
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    // Create directories
    await fs.mkdir(this.getJobDir(id), { recursive: true })
    await fs.mkdir(workspacePath, { recursive: true })
    
    await this.saveJob(job)
    await this.appendLog(id, {
      timestamp: Date.now(),
      level: 'info',
      message: `Job created: ${request.name} (sandbox: ${job.sandboxMode})`
    })
    
    return job
  }
  
  // Save job to disk
  async saveJob(job: AppBuildJob): Promise<void> {
    job.updatedAt = Date.now()
    const jobPath = this.getJobFilePath(job.id)
    await fs.writeFile(jobPath, JSON.stringify(job, null, 2))
  }
  
  // Load job from disk
  async loadJob(jobId: string): Promise<AppBuildJob | null> {
    try {
      const jobPath = this.getJobFilePath(jobId)
      const data = await fs.readFile(jobPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      return null
    }
  }
  
  // List all jobs
  async listJobs(): Promise<AppBuildJob[]> {
    const jobs: AppBuildJob[] = []
    const appbuildPath = path.join(this.workspaceRoot, APPBUILD_DIR)
    
    try {
      const entries = await fs.readdir(appbuildPath, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const job = await this.loadJob(entry.name)
          if (job) {
            jobs.push(job)
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist yet
    }
    
    return jobs.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  
  // Append log entry
  async appendLog(jobId: string, entry: JobLogEntry): Promise<void> {
    const logsPath = this.getLogsFilePath(jobId)
    
    try {
      let logs: JobLogEntry[] = []
      try {
        const data = await fs.readFile(logsPath, 'utf-8')
        logs = JSON.parse(data)
      } catch (error) {
        // File doesn't exist yet
      }
      
      logs.push(entry)
      
      // Keep only last 1000 logs
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000)
      }
      
      await fs.writeFile(logsPath, JSON.stringify(logs, null, 2))
    } catch (error) {
      console.error('Failed to append log:', error)
    }
  }
  
  // Get logs for a job
  async getLogs(jobId: string, limit: number = 200): Promise<JobLogEntry[]> {
    try {
      const logsPath = this.getLogsFilePath(jobId)
      const data = await fs.readFile(logsPath, 'utf-8')
      const logs: JobLogEntry[] = JSON.parse(data)
      return logs.slice(-limit)
    } catch (error) {
      return []
    }
  }
  
  // Update job phase
  async updatePhase(jobId: string, phaseId: JobPhase, status: JobPhaseInfo['status']): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return
    
    const phase = job.phases.find(p => p.id === phaseId)
    if (phase) {
      phase.status = status
      if (status === 'in-progress') {
        phase.startedAt = Date.now()
        job.currentPhase = phaseId
      }
      if (status === 'completed' || status === 'failed') {
        phase.completedAt = Date.now()
      }
    }
    
    await this.saveJob(job)
  }
  
  // Update job status
  async updateStatus(jobId: string, status: JobStatus): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return
    
    job.status = status
    await this.saveJob(job)
    
    await this.appendLog(jobId, {
      timestamp: Date.now(),
      level: status === 'failed' ? 'error' : 'info',
      message: `Job status changed to: ${status}`
    })
  }
  
  // Update backend status
  async updateBackendStatus(jobId: string, backend: AppBuildJob['backend']): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return
    
    job.backend = backend
    await this.saveJob(job)
  }
  
  // Update frontend status
  async updateFrontendStatus(jobId: string, frontend: AppBuildJob['frontend']): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return
    
    job.frontend = frontend
    await this.saveJob(job)
  }
  
  // Update preview URL
  async updatePreviewUrl(jobId: string, previewUrl: string): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return
    
    job.previewUrl = previewUrl
    await this.saveJob(job)
  }
  
  // Update backend URL
  async updateBackendUrl(jobId: string, backendUrl: string): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return
    
    job.backendUrl = backendUrl
    await this.saveJob(job)
  }
  
  // Delete job
  async deleteJob(jobId: string): Promise<void> {
    const jobDir = this.getJobDir(jobId)
    try {
      await fs.rm(jobDir, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to delete job:', error)
    }
  }
  
  // Get workspace path
  getWorkspacePath(jobId: string): string {
    return path.join(this.workspaceRoot, APPBUILD_DIR, jobId, WORKSPACE_DIR)
  }
  
  // Store running process reference
  setRunningProcess(jobId: string, type: 'backend' | 'frontend', process: import('child_process').ChildProcess, port: number): void {
    const existing = this.runningProcesses.get(jobId) || {}
    existing[type] = { process, port }
    this.runningProcesses.set(jobId, existing)
  }
  
  // Get running process
  getRunningProcess(jobId: string, type: 'backend' | 'frontend'): RunningProcess | undefined {
    return this.runningProcesses.get(jobId)?.[type]
  }
  
  // Remove running process
  removeRunningProcess(jobId: string, type: 'backend' | 'frontend'): void {
    const existing = this.runningProcesses.get(jobId)
    if (existing) {
      delete existing[type]
      if (!existing.backend && !existing.frontend) {
        this.runningProcesses.delete(jobId)
      }
    }
  }
  
  // Get all running processes for a job
  getRunningProcesses(jobId: string): { backend?: RunningProcess; frontend?: RunningProcess } | undefined {
    return this.runningProcesses.get(jobId)
  }
}
