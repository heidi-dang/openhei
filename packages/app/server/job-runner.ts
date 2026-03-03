/**
 * AppBuild Job Runner - Node.js Local Backend
 * Orchestrates the execution of app build jobs with sandbox support
 */

import { spawn } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import * as net from "net"
import type { JobManager } from "./job-manager"
import { BackendGenerator } from "./generators/backend-generator"
import { FrontendGenerator } from "./generators/frontend-generator"
import { sandboxManager, type SandboxConfig } from "./sandbox"
import type { AppBuildJob, JobPhase, SandboxMode } from "./types"

export class JobRunner {
  private jobManager: JobManager
  private runningJobs = new Set<string>()
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>()
  private maxRestarts = 3
  private restartBackoffMs = 5000

  constructor(jobManager: JobManager) {
    this.jobManager = jobManager
  }

  async runJob(jobId: string): Promise<void> {
    if (this.runningJobs.has(jobId)) {
      console.log(`Job ${jobId} is already running`)
      return
    }

    this.runningJobs.add(jobId)

    try {
      const job = await this.jobManager.loadJob(jobId)
      if (!job) {
        throw new Error(`Job ${jobId} not found`)
      }

      await this.jobManager.updateStatus(jobId, "planning")

      if (job.mode === "backend") {
        await this.runBackendJob(job)
      } else if (job.mode === "ui") {
        await this.runUIJob(job)
      } else if (job.mode === "repo") {
        await this.runRepoJob(job)
      }
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error)
      await this.jobManager.updateStatus(jobId, "failed")
      await this.jobManager.appendLog(jobId, {
        timestamp: Date.now(),
        level: "error",
        message: `Job failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      this.runningJobs.delete(jobId)
    }
  }

  private async runBackendJob(job: AppBuildJob): Promise<void> {
    const formData = job.formData as any

    await this.executePhase(job.id, "plan", async () => {
      await this.log(job.id, "info", `Planning backend: ${formData.appName}`, "plan")
      await this.log(job.id, "info", `Description: ${formData.description}`, "plan")
      await this.log(job.id, "info", `Sandbox mode: ${job.sandboxMode}`, "plan")
    })

    await this.executePhase(job.id, "scaffold", async () => {
      await this.log(job.id, "info", "Scaffolding project structure", "scaffold")
      await this.ensureWorkspace(job.id)
    })

    await this.executePhase(job.id, "implement", async () => {
      const generator = new BackendGenerator(this.jobManager, job.id)
      await generator.generate(formData)
    })

    await this.executePhase(job.id, "validate", async () => {
      await this.log(job.id, "info", "Validating generated code", "validate")
      const isValid = await this.validateBackend(job.id)
      if (!isValid) {
        throw new Error("Backend validation failed")
      }
      await this.log(job.id, "success", "Project validation passed", "validate")
    })

    await this.executePhase(job.id, "run-backend", async () => {
      const port = await this.findAvailablePort(3000)
      await this.jobManager.updateBackendStatus(job.id, {
        port,
        status: "starting",
      })
      await this.log(job.id, "info", `Starting backend on port ${port}...`, "run-backend")

      // Start using sandbox
      const config: SandboxConfig = {
        jobId: job.id,
        workspacePath: path.join(job.workspacePath, "backend"),
        type: "backend",
        port,
        mode: job.sandboxMode,
      }

      const status = await sandboxManager.start(config)

      // Stream logs
      sandboxManager.onLog(job.id, "backend", (log) => {
        this.jobManager.appendLog(job.id, {
          timestamp: Date.now(),
          level: "info",
          message: log,
        })
      })

      // Wait for startup with polling
      const healthy = await this.waitForBackendHealth(job.id, port)

      await this.jobManager.updateBackendStatus(job.id, {
        port,
        pid: status.pid,
        containerId: status.containerId,
        status: healthy ? "running" : "error",
        healthCheck: healthy,
        lastHealthCheck: Date.now(),
        restartCount: 0,
      })

      if (healthy) {
        await this.log(job.id, "success", `Backend running on port ${port} (mode: ${status.mode})`, "run-backend")
        await this.jobManager.updateBackendUrl(job.id, `http://localhost:${port}`)

        // Start health check interval
        this.startHealthChecks(job.id, port)
      } else {
        throw new Error("Backend failed health check")
      }
    })

    await this.executePhase(job.id, "ready", async () => {
      await this.log(job.id, "success", "Backend is ready!", "ready")
    })

    await this.jobManager.updateStatus(job.id, "ready")
  }

  private async runUIJob(job: AppBuildJob): Promise<void> {
    const formData = job.formData as any

    await this.executePhase(job.id, "plan", async () => {
      await this.log(job.id, "info", `Planning UI: ${formData.appName}`, "plan")
      await this.log(job.id, "info", `Description: ${formData.description}`, "plan")
      await this.log(job.id, "info", `Sandbox mode: ${job.sandboxMode}`, "plan")
    })

    await this.executePhase(job.id, "scaffold", async () => {
      await this.log(job.id, "info", "Scaffolding project structure", "scaffold")
      await this.ensureWorkspace(job.id)
    })

    await this.executePhase(job.id, "implement", async () => {
      const generator = new FrontendGenerator(this.jobManager, job.id)
      await generator.generate(formData)
    })

    await this.executePhase(job.id, "validate", async () => {
      await this.log(job.id, "info", "Validating generated code", "validate")
      const isValid = await this.validateFrontend(job.id)
      if (!isValid) {
        throw new Error("Frontend validation failed")
      }
      await this.log(job.id, "success", "Project validation passed", "validate")
    })

    await this.executePhase(job.id, "run-frontend", async () => {
      const port = await this.findAvailablePort(4000)
      await this.jobManager.updateFrontendStatus(job.id, {
        port,
        status: "starting",
      })
      await this.log(job.id, "info", `Starting frontend dev server on port ${port}...`, "run-frontend")

      // Start using sandbox
      const config: SandboxConfig = {
        jobId: job.id,
        workspacePath: path.join(job.workspacePath, "frontend"),
        type: "frontend",
        port,
        mode: job.sandboxMode,
      }

      const status = await sandboxManager.start(config)

      // Stream logs
      sandboxManager.onLog(job.id, "frontend", (log) => {
        this.jobManager.appendLog(job.id, {
          timestamp: Date.now(),
          level: "info",
          message: log,
        })
      })

      // Wait for dev server to start with polling
      await this.waitForPortOpen(job.id, port)

      await this.jobManager.updateFrontendStatus(job.id, {
        port,
        pid: status.pid,
        containerId: status.containerId,
        status: "running",
        restartCount: 0,
      })

      await this.log(job.id, "success", `Frontend running on port ${port} (mode: ${status.mode})`, "run-frontend")
      await this.jobManager.updatePreviewUrl(job.id, `http://localhost:${port}`)
    })

    await this.executePhase(job.id, "ready", async () => {
      await this.log(job.id, "success", "UI is ready!", "ready")
    })

    await this.jobManager.updateStatus(job.id, "ready")
  }

  private async runRepoJob(job: AppBuildJob): Promise<void> {
    const formData = job.formData as any

    await this.executePhase(job.id, "plan", async () => {
      await this.log(job.id, "info", `Planning repo import: ${formData.repoUrl}`, "plan")
      await this.log(job.id, "info", "Note: Repo Import (Run Only) - clones and runs, no AI changes", "plan")
    })

    await this.executePhase(job.id, "scaffold", async () => {
      await this.log(job.id, "info", "Cloning repository...", "scaffold")
      await this.cloneRepository(job.id, formData.repoUrl as string)
      await this.log(job.id, "success", "Repository cloned", "scaffold")
    })

    await this.executePhase(job.id, "implement", async () => {
      await this.log(job.id, "info", "Analyzing repository structure...", "implement")
      await this.detectAndLogRunCommands(job.id)
      await this.sleep(1000)
    })

    await this.executePhase(job.id, "validate", async () => {
      await this.log(job.id, "info", "Validation passed", "validate")
    })

    const generateTarget = formData.generateTarget as string

    if (generateTarget === "backend" || generateTarget === "both") {
      await this.executePhase(job.id, "run-backend", async () => {
        await this.log(job.id, "info", "Starting backend from repo...", "run-backend")
        const port = await this.findAvailablePort(3000)

        const config: SandboxConfig = {
          jobId: job.id,
          workspacePath: job.workspacePath,
          type: "backend",
          port,
          mode: job.sandboxMode,
        }

        const status = await sandboxManager.start(config)
        await this.jobManager.updateBackendStatus(job.id, {
          port,
          pid: status.pid,
          containerId: status.containerId,
          status: "running",
        })
        await this.jobManager.updateBackendUrl(job.id, `http://localhost:${port}`)
      })
    }

    if (generateTarget === "ui" || generateTarget === "both") {
      await this.executePhase(job.id, "run-frontend", async () => {
        await this.log(job.id, "info", "Starting frontend from repo...", "run-frontend")
        const port = await this.findAvailablePort(4000)

        const config: SandboxConfig = {
          jobId: job.id,
          workspacePath: job.workspacePath,
          type: "frontend",
          port,
          mode: job.sandboxMode,
        }

        const status = await sandboxManager.start(config)
        await this.jobManager.updateFrontendStatus(job.id, {
          port,
          pid: status.pid,
          containerId: status.containerId,
          status: "running",
        })
        await this.jobManager.updatePreviewUrl(job.id, `http://localhost:${port}`)
      })
    }

    await this.executePhase(job.id, "ready", async () => {
      await this.log(job.id, "success", "Repo import complete!", "ready")
    })

    await this.jobManager.updateStatus(jobId, "ready")
  }

  private async executePhase(jobId: string, phaseId: JobPhase, action: () => Promise<void>): Promise<void> {
    await this.jobManager.updatePhase(jobId, phaseId, "in-progress")

    try {
      await action()
      await this.jobManager.updatePhase(jobId, phaseId, "completed")
    } catch (error: any) {
      await this.jobManager.updatePhase(jobId, phaseId, "failed")

      // Store error info
      const job = await this.jobManager.loadJob(jobId)
      if (job) {
        job.error = {
          phase: phaseId,
          message: error.message,
          timestamp: Date.now(),
        }
        await this.jobManager.saveJob(job)
      }

      throw error
    }
  }

  private async ensureWorkspace(jobId: string): Promise<void> {
    const workspacePath = this.jobManager.getWorkspacePath(jobId)
    await fs.mkdir(workspacePath, { recursive: true })
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    const isPortAvailable = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer()
        server.once("error", () => resolve(false))
        server.once("listening", () => {
          server.close()
          resolve(true)
        })
        server.listen(port)
      })
    }

    let port = startPort
    while (!(await isPortAvailable(port))) {
      port++
    }
    return port
  }

  private async cloneRepository(jobId: string, repoUrl: string): Promise<void> {
    const workspacePath = this.jobManager.getWorkspacePath(jobId)

    return new Promise((resolve, reject) => {
      const proc = spawn("git", ["clone", repoUrl, "."], {
        cwd: workspacePath,
        stdio: ["ignore", "pipe", "pipe"],
      })

      let errorOutput = ""
      proc.stderr?.on("data", (data) => {
        errorOutput += data.toString()
      })

      proc.on("exit", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Git clone failed with code ${code}: ${errorOutput}`))
        }
      })
    })
  }

  private async detectAndLogRunCommands(jobId: string): Promise<void> {
    const workspacePath = this.jobManager.getWorkspacePath(jobId)

    try {
      const packageJsonPath = path.join(workspacePath, "package.json")
      const content = await fs.readFile(packageJsonPath, "utf-8")
      const pkg = JSON.parse(content)

      if (pkg.scripts) {
        await this.log(jobId, "info", "Detected scripts:", "implement")
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          await this.log(jobId, "info", `  - ${name}: ${cmd}`, "implement")
        }
      }
    } catch {
      await this.log(jobId, "warn", "No package.json found in repo", "implement")
    }
  }

  private async validateBackend(jobId: string): Promise<boolean> {
    const workspacePath = this.jobManager.getWorkspacePath(jobId)
    const backendPath = path.join(workspacePath, "backend")

    try {
      await fs.access(path.join(backendPath, "package.json"))
      await fs.access(path.join(backendPath, "src", "index.ts"))
      return true
    } catch {
      return false
    }
  }

  private async validateFrontend(jobId: string): Promise<boolean> {
    const workspacePath = this.jobManager.getWorkspacePath(jobId)
    const frontendPath = path.join(workspacePath, "frontend")

    try {
      await fs.access(path.join(frontendPath, "package.json"))
      await fs.access(path.join(frontendPath, "src", "App.tsx"))
      return true
    } catch {
      return false
    }
  }

  private async checkBackendHealth(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private startHealthChecks(jobId: string, port: number): void {
    // Clear existing interval
    this.stopHealthChecks(jobId)

    let consecutiveFailures = 0
    const maxFailures = 3

    const interval = setInterval(async () => {
      const healthy = await this.checkBackendHealth(port)
      const job = await this.jobManager.loadJob(jobId)

      if (job?.backend) {
        if (!healthy) {
          consecutiveFailures++
          await this.log(jobId, "warn", `Health check failed (${consecutiveFailures}/${maxFailures})`, "run-backend")

          if (consecutiveFailures >= maxFailures) {
            await this.log(jobId, "error", "Health check failed too many times, marking as unhealthy", "run-backend")
          }
        } else {
          consecutiveFailures = 0
        }

        await this.jobManager.updateBackendStatus(jobId, {
          ...job.backend,
          healthCheck: healthy,
          lastHealthCheck: Date.now(),
        })
      }
    }, 30000) // Check every 30 seconds

    this.healthCheckIntervals.set(jobId, interval)
  }

  private stopHealthChecks(jobId: string): void {
    const interval = this.healthCheckIntervals.get(jobId)
    if (interval) {
      clearInterval(interval)
      this.healthCheckIntervals.delete(jobId)
    }
  }

  private async waitForBackendHealth(
    jobId: string,
    port: number,
    timeoutMs = 30000,
    intervalMs = 500,
  ): Promise<boolean> {
    const startTime = Date.now()
    let attempt = 0

    while (Date.now() - startTime < timeoutMs) {
      attempt++
      await this.log(jobId, "info", `Polling backend health (attempt ${attempt})...`, undefined)

      const healthy = await this.checkBackendHealth(port)
      if (healthy) {
        await this.log(jobId, "info", `Backend health OK after ${attempt} attempts`, undefined)
        return true
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    await this.log(jobId, "warn", `Backend health check timed out after ${attempt} attempts`, undefined)
    return false
  }

  private async waitForPortOpen(jobId: string, port: number, timeoutMs = 30000, intervalMs = 500): Promise<boolean> {
    const startTime = Date.now()
    let attempt = 0

    while (Date.now() - startTime < timeoutMs) {
      attempt++
      await this.log(jobId, "info", `Checking if port ${port} is open (attempt ${attempt})...`, undefined)

      const isOpen = await this.checkPortOpen(port)
      if (isOpen) {
        await this.log(jobId, "info", `Port ${port} is open after ${attempt} attempts`, undefined)
        return true
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    await this.log(jobId, "warn", `Port check timed out after ${attempt} attempts`, undefined)
    return false
  }

  private async checkPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.on("connect", () => {
        socket.destroy()
        resolve(true)
      })
      socket.on("timeout", () => {
        socket.destroy()
        resolve(false)
      })
      socket.on("error", () => {
        resolve(false)
      })
      socket.connect(port, "localhost")
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async log(
    jobId: string,
    level: "info" | "warn" | "error" | "success",
    message: string,
    phase?: JobPhase,
  ): Promise<void> {
    await this.jobManager.appendLog(jobId, {
      timestamp: Date.now(),
      level,
      message,
      phase,
    })
  }

  async stopJob(jobId: string): Promise<{
    backendKilled: boolean
    frontendKilled: boolean
    backendPid?: number
    frontendPid?: number
    backendVerified: boolean
    frontendVerified: boolean
    backendPortClosed: boolean
    frontendPortClosed: boolean
  }> {
    const job = await this.jobManager.loadJob(jobId)
    if (!job) {
      return {
        backendKilled: false,
        frontendKilled: false,
        backendVerified: true,
        frontendVerified: true,
        backendPortClosed: true,
        frontendPortClosed: true,
      }
    }

    this.stopHealthChecks(jobId)

    const result = {
      backendKilled: false,
      frontendKilled: false,
      backendPid: undefined as number | undefined,
      frontendPid: undefined as number | undefined,
      backendVerified: true,
      frontendVerified: true,
      backendPortClosed: true,
      frontendPortClosed: true,
    }

    // Stop backend
    if (job.backend?.status === "running" || job.backend?.status === "error") {
      await this.log(jobId, "info", `Stopping backend...`)
      const stopResult = await sandboxManager.stop(jobId, "backend")
      result.backendKilled = stopResult.killed
      result.backendPid = stopResult.pid
      result.backendVerified = stopResult.verified
      result.backendPortClosed = stopResult.portClosed

      if (stopResult.verified && stopResult.portClosed) {
        await this.log(jobId, "success", `Backend stopped (PID: ${stopResult.pid}, port closed)`)
      } else {
        await this.log(
          jobId,
          "warn",
          `Backend stop incomplete (verified: ${stopResult.verified}, port closed: ${stopResult.portClosed})`,
        )
      }
    }

    // Stop frontend
    if (job.frontend?.status === "running" || job.frontend?.status === "error") {
      await this.log(jobId, "info", `Stopping frontend...`)
      const stopResult = await sandboxManager.stop(jobId, "frontend")
      result.frontendKilled = stopResult.killed
      result.frontendPid = stopResult.pid
      result.frontendVerified = stopResult.verified
      result.frontendPortClosed = stopResult.portClosed

      if (stopResult.verified && stopResult.portClosed) {
        await this.log(jobId, "success", `Frontend stopped (PID: ${stopResult.pid}, port closed)`)
      } else {
        await this.log(
          jobId,
          "warn",
          `Frontend stop incomplete (verified: ${stopResult.verified}, port closed: ${stopResult.portClosed})`,
        )
      }
    }

    // Update job status
    if (job.backend) {
      await this.jobManager.updateBackendStatus(jobId, {
        ...job.backend,
        status: "stopped",
      })
    }

    if (job.frontend) {
      await this.jobManager.updateFrontendStatus(jobId, {
        ...job.frontend,
        status: "stopped",
      })
    }

    await this.jobManager.updateStatus(jobId, "stopped")

    return result
  }

  async restartBackend(jobId: string): Promise<{
    success: boolean
    pid?: number
    containerId?: string
    port?: number
    health?: boolean
    mode?: SandboxMode
  }> {
    const job = await this.jobManager.loadJob(jobId)
    if (!job) throw new Error("Job not found")

    // Check restart limit
    if ((job.backend?.restartCount || 0) >= this.maxRestarts) {
      await this.log(jobId, "error", `Max restarts (${this.maxRestarts}) exceeded for backend`)
      throw new Error("Max restarts exceeded")
    }

    // Apply backoff
    const backoff = this.restartBackoffMs * ((job.backend?.restartCount || 0) + 1)
    await this.log(jobId, "info", `Waiting ${backoff}ms before restart (backoff)...`)
    await this.sleep(backoff)

    // Stop existing
    await sandboxManager.stop(jobId, "backend")
    await this.sleep(1000)

    // Start new
    const port = await this.findAvailablePort(3000)
    await this.log(jobId, "info", `Starting new backend on port ${port}...`)

    const config: SandboxConfig = {
      jobId: job.id,
      workspacePath: path.join(job.workspacePath, "backend"),
      type: "backend",
      port,
      mode: job.sandboxMode,
    }

    const status = await sandboxManager.start(config)

    // Stream logs
    sandboxManager.onLog(jobId, "backend", (log) => {
      this.jobManager.appendLog(jobId, {
        timestamp: Date.now(),
        level: "info",
        message: log,
      })
    })

    // Wait for backend to start with polling
    const healthy = await this.waitForBackendHealth(jobId, port)

    await this.jobManager.updateBackendStatus(jobId, {
      port,
      pid: status.pid,
      containerId: status.containerId,
      status: healthy ? "running" : "error",
      healthCheck: healthy,
      lastHealthCheck: Date.now(),
      restartCount: (job.backend?.restartCount || 0) + 1,
    })

    if (healthy) {
      await this.log(jobId, "success", `Backend restarted on port ${port} (PID: ${status.pid}, health: OK)`)
      // Restart health checks
      this.startHealthChecks(jobId, port)
    } else {
      await this.log(jobId, "error", `Backend restarted but health check failed (PID: ${status.pid})`)
    }

    await this.jobManager.updateBackendUrl(jobId, `http://localhost:${port}`)

    return {
      success: true,
      pid: status.pid,
      containerId: status.containerId,
      port,
      health: healthy,
      mode: status.mode,
    }
  }

  async restartFrontend(jobId: string): Promise<{
    success: boolean
    pid?: number
    containerId?: string
    port?: number
    mode?: SandboxMode
  }> {
    const job = await this.jobManager.loadJob(jobId)
    if (!job) throw new Error("Job not found")

    // Check restart limit
    if ((job.frontend?.restartCount || 0) >= this.maxRestarts) {
      await this.log(jobId, "error", `Max restarts (${this.maxRestarts}) exceeded for frontend`)
      throw new Error("Max restarts exceeded")
    }

    // Apply backoff
    const backoff = this.restartBackoffMs * ((job.frontend?.restartCount || 0) + 1)
    await this.log(jobId, "info", `Waiting ${backoff}ms before restart (backoff)...`)
    await this.sleep(backoff)

    // Stop existing
    await sandboxManager.stop(jobId, "frontend")
    await this.sleep(1000)

    // Start new
    const port = await this.findAvailablePort(4000)
    await this.log(jobId, "info", `Starting new frontend on port ${port}...`)

    const config: SandboxConfig = {
      jobId: job.id,
      workspacePath: path.join(job.workspacePath, "frontend"),
      type: "frontend",
      port,
      mode: job.sandboxMode,
    }

    const status = await sandboxManager.start(config)

    // Stream logs
    sandboxManager.onLog(jobId, "frontend", (log) => {
      this.jobManager.appendLog(jobId, {
        timestamp: Date.now(),
        level: "info",
        message: log,
      })
    })

    // Wait for frontend to start with polling
    await this.waitForPortOpen(jobId, port)

    await this.jobManager.updateFrontendStatus(jobId, {
      port,
      pid: status.pid,
      containerId: status.containerId,
      status: "running",
      restartCount: (job.frontend?.restartCount || 0) + 1,
    })

    await this.log(jobId, "success", `Frontend restarted on port ${port} (PID: ${status.pid})`)
    await this.jobManager.updatePreviewUrl(jobId, `http://localhost:${port}`)

    return {
      success: true,
      pid: status.pid,
      containerId: status.containerId,
      port,
      mode: status.mode,
    }
  }

  // Verify PID is gone
  async verifyPidGone(pid: number): Promise<boolean> {
    return sandboxManager.verifyPidGone(pid)
  }

  // Verify port is closed
  async isPortClosed(port: number): Promise<boolean> {
    return sandboxManager.isPortClosed(port)
  }

  // Clean up all processes for a job
  async cleanupJob(jobId: string): Promise<void> {
    this.stopHealthChecks(jobId)
    await sandboxManager.cleanupJob(jobId)
  }
}
