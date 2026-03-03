/**
 * Docker-based Sandbox for App Builder
 * Runs generated apps in isolated containers with resource limits
 */

import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as net from 'net'

const execAsync = promisify(exec)

export interface SandboxConfig {
  jobId: string
  workspacePath: string
  type: 'backend' | 'frontend'
  port: number
  memoryLimit?: string      // e.g., '512m', '1g'
  cpuLimit?: string         // e.g., '1.0', '0.5'
  networkMode?: string      // 'bridge', 'host', 'none'
}

export interface SandboxStatus {
  containerId: string | null
  status: 'creating' | 'running' | 'stopped' | 'error'
  port: number
  logs: string[]
  error?: string
  resourceUsage?: {
    memory?: string
    cpu?: string
  }
}

export class DockerSandbox {
  private sandboxes = new Map<string, SandboxStatus>()
  private logCallbacks = new Map<string, (log: string) => void>()

  // Check if Docker is available
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version')
      return true
    } catch {
      return false
    }
  }

  // Create and start a sandbox container
  async createSandbox(config: SandboxConfig): Promise<SandboxStatus> {
    const sandboxKey = `${config.jobId}-${config.type}`
    
    if (this.sandboxes.has(sandboxKey)) {
      throw new Error(`Sandbox already exists for ${sandboxKey}`)
    }

    const status: SandboxStatus = {
      containerId: null,
      status: 'creating',
      port: config.port,
      logs: []
    }
    
    this.sandboxes.set(sandboxKey, status)
    this.log(sandboxKey, `Creating ${config.type} sandbox...`)

    try {
      // Generate Dockerfile if needed
      const dockerfilePath = await this.ensureDockerfile(config)
      
      // Build image
      this.log(sandboxKey, 'Building Docker image...')
      const imageName = `openhei-appbuild-${config.jobId}-${config.type}`
      await this.buildImage(config.workspacePath, imageName, dockerfilePath)
      
      // Run container
      this.log(sandboxKey, 'Starting container...')
      const containerId = await this.runContainer(config, imageName)
      status.containerId = containerId
      status.status = 'running'
      
      this.log(sandboxKey, `Container started: ${containerId.slice(0, 12)}`)
      
      // Start log streaming
      this.streamLogs(containerId, sandboxKey)
      
      return status
      
    } catch (error: any) {
      status.status = 'error'
      status.error = error.message
      this.log(sandboxKey, `Error: ${error.message}`)
      throw error
    }
  }

  // Stop and remove a sandbox
  async stopSandbox(jobId: string, type: 'backend' | 'frontend'): Promise<boolean> {
    const sandboxKey = `${jobId}-${type}`
    const status = this.sandboxes.get(sandboxKey)
    
    if (!status || !status.containerId) {
      this.log(sandboxKey, 'No sandbox to stop')
      return true
    }

    this.log(sandboxKey, `Stopping container ${status.containerId.slice(0, 12)}...`)

    try {
      // Stop container gracefully
      await execAsync(`docker stop ${status.containerId} --time 10`)
      
      // Remove container
      await execAsync(`docker rm ${status.containerId}`)
      
      // Remove image
      const imageName = `openhei-appbuild-${jobId}-${type}`
      await execAsync(`docker rmi ${imageName} --force`).catch(() => {
        // Image might be in use, ignore error
      })
      
      status.status = 'stopped'
      status.containerId = null
      this.log(sandboxKey, 'Sandbox stopped and removed')
      
      return true
    } catch (error: any) {
      this.log(sandboxKey, `Error stopping: ${error.message}`)
      return false
    }
  }

  // Get sandbox status
  getStatus(jobId: string, type: 'backend' | 'frontend'): SandboxStatus | null {
    return this.sandboxes.get(`${jobId}-${type}`) || null
  }

  // Get all sandboxes for a job
  getJobSandboxes(jobId: string): { backend?: SandboxStatus; frontend?: SandboxStatus } {
    return {
      backend: this.sandboxes.get(`${jobId}-backend`),
      frontend: this.sandboxes.get(`${jobId}-frontend`)
    }
  }

  // Check if container is running
  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`)
      return stdout.trim() === 'true'
    } catch {
      return false
    }
  }

  // Get container resource usage
  async getResourceUsage(containerId: string): Promise<{ memory?: string; cpu?: string }> {
    try {
      const { stdout } = await execAsync(`docker stats ${containerId} --no-stream --format "{{.MemUsage}}|{{.CPUPerc}}"`)
      const [memory, cpu] = stdout.trim().split('|')
      return { memory, cpu }
    } catch {
      return {}
    }
  }

  // Verify port is closed
  async isPortClosed(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      
      socket.on('connect', () => {
        socket.destroy()
        resolve(false) // Port is open
      })
      
      socket.on('error', () => {
        resolve(true) // Port is closed
      })
      
      socket.on('timeout', () => {
        socket.destroy()
        resolve(true) // Port is closed (timeout)
      })
      
      socket.connect(port, 'localhost')
    })
  }

  // Verify PID is gone (for host mode comparison)
  async verifyPidGone(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0)
      return false // Process exists
    } catch {
      return true // Process is gone
    }
  }

  // Set log callback
  onLog(sandboxKey: string, callback: (log: string) => void): void {
    this.logCallbacks.set(sandboxKey, callback)
  }

  // Private: Log helper
  private log(sandboxKey: string, message: string): void {
    const status = this.sandboxes.get(sandboxKey)
    if (status) {
      status.logs.push(message)
    }
    
    const callback = this.logCallbacks.get(sandboxKey)
    if (callback) {
      callback(message)
    }
  }

  // Private: Ensure Dockerfile exists
  private async ensureDockerfile(config: SandboxConfig): Promise<string> {
    const dockerfilePath = path.join(config.workspacePath, 'Dockerfile')
    
    try {
      await fs.access(dockerfilePath)
      return dockerfilePath
    } catch {
      // Generate appropriate Dockerfile
      const dockerfile = config.type === 'backend' 
        ? this.generateBackendDockerfile()
        : this.generateFrontendDockerfile()
      
      await fs.writeFile(dockerfilePath, dockerfile)
      return dockerfilePath
    }
  }

  // Private: Generate backend Dockerfile
  private generateBackendDockerfile(): string {
    return `FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build if needed
RUN npm run build 2>/dev/null || true

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start
CMD ["npm", "start"]
`
  }

  // Private: Generate frontend Dockerfile
  private generateFrontendDockerfile(): string {
    return `FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Expose port
EXPOSE 4000

# Start dev server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4000"]
`
  }

  // Private: Build Docker image
  private async buildImage(workspacePath: string, imageName: string, dockerfilePath: string): Promise<void> {
    const { stdout, stderr } = await execAsync(
      `docker build -t ${imageName} -f ${dockerfilePath} ${workspacePath}`,
      { timeout: 300000 } // 5 minute timeout
    )
    
    if (stderr && !stderr.includes('Successfully built')) {
      console.log('Build output:', stderr)
    }
  }

  // Private: Run container
  private async runContainer(config: SandboxConfig, imageName: string): Promise<string> {
    const memoryLimit = config.memoryLimit || '512m'
    const cpuLimit = config.cpuLimit || '1.0'
    const networkMode = config.networkMode || 'bridge'
    
    const portMapping = networkMode === 'host' 
      ? '' 
      : `-p ${config.port}:${config.type === 'backend' ? 3000 : 4000}`
    
    const networkFlag = networkMode === 'host' ? '--network host' : ''
    
    const cmd = `docker run -d \\
      --name openhei-${config.jobId}-${config.type} \\
      ${portMapping} \\
      ${networkFlag} \\
      --memory=${memoryLimit} \\
      --cpus=${cpuLimit} \\
      --read-only \\
      --tmpfs /tmp:noexec,nosuid,size=100m \\
      --tmpfs /app/node_modules:noexec,nosuid,size=500m \\
      -e PORT=${config.type === 'backend' ? 3000 : 4000} \\
      -e NODE_ENV=production \\
      ${imageName}`
    
    const { stdout } = await execAsync(cmd.replace(/\\\n/g, ' ').trim())
    return stdout.trim()
  }

  // Private: Stream logs from container
  private streamLogs(containerId: string, sandboxKey: string): void {
    const logsProcess = spawn('docker', ['logs', '-f', containerId], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    logsProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.log(sandboxKey, `[container] ${line}`)
      }
    })
    
    logsProcess.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.log(sandboxKey, `[container:err] ${line}`)
      }
    })
    
    // Clean up when container stops
    logsProcess.on('exit', () => {
      this.log(sandboxKey, '[container] Log stream ended')
    })
  }

  // Clean up all sandboxes for a job
  async cleanupJob(jobId: string): Promise<void> {
    await this.stopSandbox(jobId, 'backend')
    await this.stopSandbox(jobId, 'frontend')
    this.sandboxes.delete(`${jobId}-backend`)
    this.sandboxes.delete(`${jobId}-frontend`)
  }
}

// Singleton instance
export const dockerSandbox = new DockerSandbox()
