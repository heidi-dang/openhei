/**
 * Host-based Runner for App Builder (fallback mode)
 * Runs generated apps directly on the host with process isolation
 */

import { spawn, type ChildProcess } from 'child_process'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as net from 'net'

const execAsync = promisify(exec)

export interface HostRunnerConfig {
  jobId: string
  workspacePath: string
  type: 'backend' | 'frontend'
  port: number
}

export interface HostRunnerStatus {
  pid: number | null
  status: 'starting' | 'running' | 'stopped' | 'error'
  port: number
  logs: string[]
  error?: string
  startTime?: number
  restartCount: number
}

// Check if a PID exists
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Kill process tree recursively
async function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  const isWindows = process.platform === 'win32'
  
  try {
    if (isWindows) {
      try {
        await execAsync(`taskkill /PID ${pid} /T /F`)
      } catch {
        // Process might already be gone
      }
    } else {
      // Get child PIDs
      try {
        const { stdout } = await execAsync(`pgrep -P ${pid}`)
        const childPids = stdout.trim().split('\n').filter(Boolean).map(Number)
        
        for (const childPid of childPids) {
          await killProcessTree(childPid, signal)
        }
      } catch {
        // No children
      }
      
      // Kill main process
      try {
        process.kill(pid, signal)
      } catch (error: any) {
        if (error.code !== 'ESRCH') throw error
      }
      
      // Kill process group
      try {
        process.kill(-pid, signal)
      } catch {
        // Process group might not exist
      }
    }
  } catch (error) {
    console.error(`Failed to kill process ${pid}:`, error)
  }
}

// Force kill with verification
async function forceKillProcess(pid: number, timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now()
  
  await killProcessTree(pid, 'SIGTERM')
  
  while (Date.now() - startTime < timeoutMs) {
    if (!(await isProcessRunning(pid))) {
      return true
    }
    await new Promise(r => setTimeout(r, 100))
  }
  
  await killProcessTree(pid, 'SIGKILL')
  await new Promise(r => setTimeout(r, 500))
  return !(await isProcessRunning(pid))
}

export class HostRunner {
  private processes = new Map<string, {
    process: ChildProcess
    status: HostRunnerStatus
  }>()
  private logCallbacks = new Map<string, (log: string) => void>()
  private maxRestarts = 3
  private restartBackoffMs = 5000

  // Start a process
  async start(config: HostRunnerConfig): Promise<HostRunnerStatus> {
    const key = `${config.jobId}-${config.type}`
    
    if (this.processes.has(key)) {
      throw new Error(`Process already running for ${key}`)
    }

    const status: HostRunnerStatus = {
      pid: null,
      status: 'starting',
      port: config.port,
      logs: [],
      restartCount: 0
    }

    try {
      const proc = await this.spawnProcess(config, status)
      
      this.processes.set(key, { process: proc, status })
      
      return status
    } catch (error: any) {
      status.status = 'error'
      status.error = error.message
      this.log(key, `Error: ${error.message}`)
      throw error
    }
  }

  // Stop a process
  async stop(jobId: string, type: 'backend' | 'frontend'): Promise<{
    killed: boolean
    pid?: number
    verified: boolean
    portClosed: boolean
  }> {
    const key = `${jobId}-${type}`
    const entry = this.processes.get(key)
    
    if (!entry) {
      this.log(key, 'No process to stop')
      return { killed: false, verified: true, portClosed: true }
    }

    const { process, status } = entry
    const pid = process.pid
    
    if (!pid) {
      this.processes.delete(key)
      return { killed: false, verified: true, portClosed: true }
    }

    this.log(key, `Stopping process (PID: ${pid})...`)

    const killed = await forceKillProcess(pid, 5000)
    
    // Verify PID is gone
    await new Promise(r => setTimeout(r, 500))
    const verified = !(await isProcessRunning(pid))
    
    // Verify port is closed
    const portClosed = await this.isPortClosed(status.port)
    
    if (killed && verified) {
      this.log(key, `Process stopped (PID: ${pid} killed, port: ${status.port} closed)`)
    } else {
      this.log(key, `Warning: Process may not be fully stopped (killed: ${killed}, verified: ${verified})`)
    }
    
    status.status = 'stopped'
    status.pid = null
    this.processes.delete(key)
    
    return { killed, pid, verified, portClosed }
  }

  // Restart a process
  async restart(config: HostRunnerConfig): Promise<HostRunnerStatus> {
    const key = `${config.jobId}-${config.type}`
    const entry = this.processes.get(key)
    
    // Check restart limit
    if (entry && entry.status.restartCount >= this.maxRestarts) {
      entry.status.status = 'error'
      entry.status.error = `Max restarts (${this.maxRestarts}) exceeded`
      this.log(key, `Error: Max restarts exceeded`)
      throw new Error('Max restarts exceeded')
    }
    
    // Stop existing
    if (entry) {
      await this.stop(config.jobId, config.type)
      await new Promise(r => setTimeout(r, 1000))
    }
    
    // Apply backoff if restarting multiple times
    if (entry && entry.status.restartCount > 0) {
      const backoff = this.restartBackoffMs * entry.status.restartCount
      this.log(key, `Waiting ${backoff}ms before restart (backoff)...`)
      await new Promise(r => setTimeout(r, backoff))
    }
    
    // Start new
    const status = await this.start(config)
    status.restartCount = (entry?.status.restartCount || 0) + 1
    
    return status
  }

  // Get status
  getStatus(jobId: string, type: 'backend' | 'frontend'): HostRunnerStatus | null {
    return this.processes.get(`${jobId}-${type}`)?.status || null
  }

  // Verify PID is gone
  async verifyPidGone(pid: number): Promise<boolean> {
    return !(await isProcessRunning(pid))
  }

  // Verify port is closed
  async isPortClosed(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      
      socket.on('connect', () => {
        socket.destroy()
        resolve(false)
      })
      
      socket.on('error', () => resolve(true))
      socket.on('timeout', () => {
        socket.destroy()
        resolve(true)
      })
      
      socket.connect(port, 'localhost')
    })
  }

  // Set log callback
  onLog(key: string, callback: (log: string) => void): void {
    this.logCallbacks.set(key, callback)
  }

  // Private: Spawn process
  private async spawnProcess(config: HostRunnerConfig, status: HostRunnerStatus): Promise<ChildProcess> {
    const isBackend = config.type === 'backend'
    const cwd = config.workspacePath
    
    // Install dependencies first
    this.log(`${config.jobId}-${config.type}`, 'Installing dependencies...')
    await this.runCommand('npm', ['install'], cwd, status)
    
    // Start command
    const cmd = isBackend ? 'npm' : 'npm'
    const args = isBackend 
      ? ['start'] 
      : ['run', 'dev', '--', '--port', String(config.port)]
    
    this.log(`${config.jobId}-${config.type}`, `Starting ${config.type} on port ${config.port}...`)
    
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PORT: String(config.port) },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    if (!proc.pid) {
      throw new Error('Failed to start process')
    }
    
    status.pid = proc.pid
    status.status = 'running'
    status.startTime = Date.now()
    
    // Capture logs
    proc.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.log(`${config.jobId}-${config.type}`, `[${config.type}] ${line}`)
      }
    })
    
    proc.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.log(`${config.jobId}-${config.type}`, `[${config.type}:err] ${line}`)
      }
    })
    
    proc.on('exit', (code) => {
      this.log(`${config.jobId}-${config.type}`, `[${config.type}] Process exited with code ${code}`)
      status.status = 'stopped'
      status.pid = null
      this.processes.delete(`${config.jobId}-${config.type}`)
    })
    
    return proc
  }

  // Private: Run command
  private async runCommand(command: string, args: string[], cwd: string, status: HostRunnerStatus): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      
      let output = ''
      let errorOutput = ''
      
      proc.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })
      
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Command failed with code ${code}: ${errorOutput || output}`))
        }
      })
    })
  }

  // Private: Log helper
  private log(key: string, message: string): void {
    const entry = this.processes.get(key)
    if (entry) {
      entry.status.logs.push(message)
    }
    
    const callback = this.logCallbacks.get(key)
    if (callback) {
      callback(message)
    }
  }

  // Clean up all processes for a job
  async cleanupJob(jobId: string): Promise<void> {
    await this.stop(jobId, 'backend')
    await this.stop(jobId, 'frontend')
  }
}

// Singleton instance
export const hostRunner = new HostRunner()
