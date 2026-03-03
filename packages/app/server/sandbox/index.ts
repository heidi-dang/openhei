/**
 * Sandbox Manager for App Builder
 * Orchestrates between Docker sandbox and host runner modes
 */

import { dockerSandbox, type SandboxConfig as DockerSandboxConfig } from './docker-sandbox'
import { hostRunner, type HostRunnerConfig } from './host-runner'

export type SandboxMode = 'docker' | 'host'

export interface SandboxConfig {
  jobId: string
  workspacePath: string
  type: 'backend' | 'frontend'
  port: number
  mode: SandboxMode
  // Docker-specific options
  memoryLimit?: string
  cpuLimit?: string
}

export interface ProcessStatus {
  pid?: number
  containerId?: string
  status: 'creating' | 'running' | 'stopped' | 'error'
  port: number
  mode: SandboxMode
  logs: string[]
  error?: string
  resourceUsage?: {
    memory?: string
    cpu?: string
  }
}

export class SandboxManager {
  private defaultMode: SandboxMode = 'docker'
  private jobModes = new Map<string, SandboxMode>()

  // Check if Docker is available
  async isDockerAvailable(): Promise<boolean> {
    return dockerSandbox.isDockerAvailable()
  }

  // Get default mode
  getDefaultMode(): SandboxMode {
    return this.defaultMode
  }

  // Set default mode
  setDefaultMode(mode: SandboxMode): void {
    this.defaultMode = mode
  }

  // Get/set mode for specific job
  getJobMode(jobId: string): SandboxMode {
    return this.jobModes.get(jobId) || this.defaultMode
  }

  setJobMode(jobId: string, mode: SandboxMode): void {
    this.jobModes.set(jobId, mode)
  }

  // Start a process (backend or frontend)
  async start(config: SandboxConfig): Promise<ProcessStatus> {
    const mode = config.mode || this.getJobMode(config.jobId)
    
    if (mode === 'docker') {
      // Check if Docker is available, fallback to host if not
      const dockerAvailable = await this.isDockerAvailable()
      if (!dockerAvailable) {
        console.log(`Docker not available, falling back to host mode for ${config.jobId}`)
        return this.startHost(config)
      }
      return this.startDocker(config)
    } else {
      return this.startHost(config)
    }
  }

  // Stop a process
  async stop(jobId: string, type: 'backend' | 'frontend'): Promise<{
    killed: boolean
    pid?: number
    containerId?: string
    verified: boolean
    portClosed: boolean
  }> {
    const mode = this.getJobMode(jobId)
    
    if (mode === 'docker') {
      const dockerStatus = dockerSandbox.getStatus(jobId, type)
      if (dockerStatus?.containerId) {
        await dockerSandbox.stopSandbox(jobId, type)
        const portClosed = await dockerSandbox.isPortClosed(dockerStatus.port)
        return {
          killed: true,
          containerId: dockerStatus.containerId,
          verified: true,
          portClosed
        }
      }
    }
    
    // Fallback to host
    return hostRunner.stop(jobId, type)
  }

  // Restart a process
  async restart(config: SandboxConfig): Promise<ProcessStatus> {
    // Stop first
    await this.stop(config.jobId, config.type)
    await new Promise(r => setTimeout(r, 1000))
    
    // Start again
    return this.start(config)
  }

  // Get status
  getStatus(jobId: string, type: 'backend' | 'frontend'): ProcessStatus | null {
    const mode = this.getJobMode(jobId)
    
    if (mode === 'docker') {
      const dockerStatus = dockerSandbox.getStatus(jobId, type)
      if (dockerStatus) {
        return {
          containerId: dockerStatus.containerId || undefined,
          status: dockerStatus.status,
          port: dockerStatus.port,
          mode: 'docker',
          logs: dockerStatus.logs,
          error: dockerStatus.error,
          resourceUsage: dockerStatus.resourceUsage
        }
      }
    }
    
    const hostStatus = hostRunner.getStatus(jobId, type)
    if (hostStatus) {
      return {
        pid: hostStatus.pid || undefined,
        status: hostStatus.status,
        port: hostStatus.port,
        mode: 'host',
        logs: hostStatus.logs,
        error: hostStatus.error
      }
    }
    
    return null
  }

  // Get all statuses for a job
  getJobStatuses(jobId: string): { backend?: ProcessStatus; frontend?: ProcessStatus } {
    return {
      backend: this.getStatus(jobId, 'backend'),
      frontend: this.getStatus(jobId, 'frontend')
    }
  }

  // Verify PID is gone (host mode)
  async verifyPidGone(pid: number): Promise<boolean> {
    return hostRunner.verifyPidGone(pid)
  }

  // Verify port is closed
  async isPortClosed(port: number): Promise<boolean> {
    return hostRunner.isPortClosed(port)
  }

  // Set log callback
  onLog(jobId: string, type: 'backend' | 'frontend', callback: (log: string) => void): void {
    const key = `${jobId}-${type}`
    dockerSandbox.onLog(key, callback)
    hostRunner.onLog(key, callback)
  }

  // Clean up all processes for a job
  async cleanupJob(jobId: string): Promise<void> {
    await dockerSandbox.cleanupJob(jobId)
    await hostRunner.cleanupJob(jobId)
    this.jobModes.delete(jobId)
  }

  // Private: Start Docker sandbox
  private async startDocker(config: SandboxConfig): Promise<ProcessStatus> {
    const dockerConfig: DockerSandboxConfig = {
      jobId: config.jobId,
      workspacePath: config.workspacePath,
      type: config.type,
      port: config.port,
      memoryLimit: config.memoryLimit || '512m',
      cpuLimit: config.cpuLimit || '1.0'
    }
    
    const status = await dockerSandbox.createSandbox(dockerConfig)
    
    return {
      containerId: status.containerId || undefined,
      status: status.status,
      port: status.port,
      mode: 'docker',
      logs: status.logs,
      error: status.error,
      resourceUsage: status.resourceUsage
    }
  }

  // Private: Start host runner
  private async startHost(config: SandboxConfig): Promise<ProcessStatus> {
    const hostConfig: HostRunnerConfig = {
      jobId: config.jobId,
      workspacePath: config.workspacePath,
      type: config.type,
      port: config.port
    }
    
    const status = await hostRunner.start(hostConfig)
    
    return {
      pid: status.pid || undefined,
      status: status.status,
      port: status.port,
      mode: 'host',
      logs: status.logs,
      error: status.error
    }
  }
}

// Singleton instance
export const sandboxManager = new SandboxManager()

// Re-export types
export { DockerSandboxConfig, HostRunnerConfig }
