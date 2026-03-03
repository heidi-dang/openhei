/**
 * AppBuild API Routes - Node.js Local Backend
 * HTTP API for the App Builder feature
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { JobManager } from './job-manager'
import { JobRunner } from './job-runner'
import type { CreateJobRequest, SandboxMode } from './types'
import { sandboxManager } from './sandbox'

export function createAppBuildRoutes(jobManager: JobManager, jobRunner: JobRunner) {
  const app = new Hono()
  
  // Enable CORS
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
  }))
  
  // List all jobs
  app.get('/jobs', async (c) => {
    try {
      const jobs = await jobManager.listJobs()
      return c.json({ jobs })
    } catch (error) {
      console.error('Failed to list jobs:', error)
      return c.json({ error: 'Failed to list jobs' }, 500)
    }
  })
  
  // Get job details
  app.get('/jobs/:id', async (c) => {
    try {
      const id = c.req.param('id')
      const job = await jobManager.loadJob(id)
      
      if (!job) {
        return c.json({ error: 'Job not found' }, 404)
      }
      
      const logs = await jobManager.getLogs(id, 200)
      
      return c.json({ job, logs })
    } catch (error) {
      console.error('Failed to get job:', error)
      return c.json({ error: 'Failed to get job' }, 500)
    }
  })
  
  // Create new job
  app.post('/jobs', async (c) => {
    try {
      const body = await c.req.json<CreateJobRequest>()
      
      if (!body.name || !body.mode) {
        return c.json({ error: 'Missing required fields: name, mode' }, 400)
      }
      
      const job = await jobManager.createJob(body)
      
      // Start job execution in background
      jobRunner.runJob(job.id).catch(console.error)
      
      return c.json({ job }, 201)
    } catch (error) {
      console.error('Failed to create job:', error)
      return c.json({ 
        error: 'Failed to create job',
        message: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // Delete job
  app.delete('/jobs/:id', async (c) => {
    try {
      const id = c.req.param('id')
      
      // Stop any running processes first
      await jobRunner.stopJob(id)
      
      await jobManager.deleteJob(id)
      return c.json({ success: true })
    } catch (error) {
      console.error('Failed to delete job:', error)
      return c.json({ 
        error: 'Failed to delete job',
        message: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // Get job logs
  app.get('/jobs/:id/logs', async (c) => {
    try {
      const id = c.req.param('id')
      const limit = parseInt(c.req.query('limit') || '200')
      
      const logs = await jobManager.getLogs(id, limit)
      return c.json({ logs })
    } catch (error) {
      console.error('Failed to get logs:', error)
      return c.json({ error: 'Failed to get logs' }, 500)
    }
  })
  
  // Stop job
  app.post('/jobs/:id/stop', async (c) => {
    try {
      const id = c.req.param('id')
      
      const result = await jobRunner.stopJob(id)
      
      // Verify PIDs are actually gone
      let backendVerified = false
      let frontendVerified = false
      
      if (result.backendPid) {
        await new Promise(r => setTimeout(r, 500))
        backendVerified = await jobRunner.verifyPidGone(result.backendPid)
      }
      
      if (result.frontendPid) {
        await new Promise(r => setTimeout(r, 500))
        frontendVerified = await jobRunner.verifyPidGone(result.frontendPid)
      }
      
      return c.json({ 
        success: true, 
        backendKilled: result.backendKilled,
        frontendKilled: result.frontendKilled,
        backendPid: result.backendPid,
        frontendPid: result.frontendPid,
        backendVerified,
        frontendVerified
      })
    } catch (error) {
      console.error('Failed to stop job:', error)
      return c.json({ 
        error: 'Failed to stop job',
        message: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // Restart backend
  app.post('/jobs/:id/restart-backend', async (c) => {
    try {
      const id = c.req.param('id')
      
      const result = await jobRunner.restartBackend(id)
      const job = await jobManager.loadJob(id)
      
      return c.json({ 
        success: result.success, 
        job,
        pid: result.pid,
        port: result.port,
        health: result.health
      })
    } catch (error) {
      console.error('Failed to restart backend:', error)
      return c.json({ 
        error: 'Failed to restart backend',
        message: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // Restart frontend
  app.post('/jobs/:id/restart-frontend', async (c) => {
    try {
      const id = c.req.param('id')
      
      const result = await jobRunner.restartFrontend(id)
      const job = await jobManager.loadJob(id)
      
      return c.json({ 
        success: result.success, 
        job,
        pid: result.pid,
        port: result.port
      })
    } catch (error) {
      console.error('Failed to restart frontend:', error)
      return c.json({ 
        error: 'Failed to restart frontend',
        message: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // Verify PID is gone
  app.get('/jobs/:id/verify-pid/:pid', async (c) => {
    try {
      const pid = parseInt(c.req.param('pid'))
      const isGone = await jobRunner.verifyPidGone(pid)
      
      return c.json({
        pid,
        isGone,
        isRunning: !isGone
      })
    } catch (error) {
      console.error('Failed to verify PID:', error)
      return c.json({ error: 'Failed to verify PID' }, 500)
    }
  })
  
  // Verify port is closed
  app.get('/verify-port/:port', async (c) => {
    try {
      const port = parseInt(c.req.param('port'))
      const isClosed = await jobRunner.isPortClosed(port)
      
      return c.json({
        port,
        isClosed,
        isOpen: !isClosed
      })
    } catch (error) {
      console.error('Failed to verify port:', error)
      return c.json({ error: 'Failed to verify port' }, 500)
    }
  })
  
  // Get sandbox status
  app.get('/sandbox/status', async (c) => {
    try {
      const dockerAvailable = await sandboxManager.isDockerAvailable()
      const defaultMode = sandboxManager.getDefaultMode()
      
      return c.json({
        dockerAvailable,
        defaultMode,
        message: dockerAvailable 
          ? 'Docker is available, sandbox mode enabled' 
          : 'Docker not available, using host mode'
      })
    } catch (error) {
      console.error('Failed to get sandbox status:', error)
      return c.json({ error: 'Failed to get sandbox status' }, 500)
    }
  })
  
  // Set job sandbox mode
  app.post('/jobs/:id/sandbox-mode', async (c) => {
    try {
      const id = c.req.param('id')
      const body = await c.req.json<{ mode: SandboxMode }>()
      
      if (!body.mode || (body.mode !== 'docker' && body.mode !== 'host')) {
        return c.json({ error: 'Invalid mode. Use "docker" or "host"' }, 400)
      }
      
      sandboxManager.setJobMode(id, body.mode)
      
      // Update job
      const job = await jobManager.loadJob(id)
      if (job) {
        job.sandboxMode = body.mode
        await jobManager.saveJob(job)
      }
      
      return c.json({
        success: true,
        jobId: id,
        mode: body.mode
      })
    } catch (error) {
      console.error('Failed to set sandbox mode:', error)
      return c.json({ error: 'Failed to set sandbox mode' }, 500)
    }
  })
  
  // Get process status
  app.get('/jobs/:id/process-status', async (c) => {
    try {
      const id = c.req.param('id')
      const statuses = sandboxManager.getJobStatuses(id)
      
      return c.json({
        jobId: id,
        backend: statuses.backend,
        frontend: statuses.frontend
      })
    } catch (error) {
      console.error('Failed to get process status:', error)
      return c.json({ error: 'Failed to get process status' }, 500)
    }
  })
  
  // Open workspace folder (returns path)
  app.get('/jobs/:id/workspace-path', async (c) => {
    try {
      const id = c.req.param('id')
      const job = await jobManager.loadJob(id)
      
      if (!job) {
        return c.json({ error: 'Job not found' }, 404)
      }
      
      return c.json({
        jobId: id,
        workspacePath: job.workspacePath,
        absolutePath: job.workspacePath
      })
    } catch (error) {
      console.error('Failed to get workspace path:', error)
      return c.json({ error: 'Failed to get workspace path' }, 500)
    }
  })
  
  // Health check backend
  app.get('/jobs/:id/health', async (c) => {
    try {
      const id = c.req.param('id')
      
      const job = await jobManager.loadJob(id)
      if (!job?.backend) {
        return c.json({ healthy: false, error: 'No backend configured' })
      }
      
      return c.json({ 
        healthy: job.backend.healthCheck || false,
        status: job.backend.status,
        port: job.backend.port,
        pid: job.backend.pid
      })
    } catch (error) {
      console.error('Failed to check health:', error)
      return c.json({ error: 'Failed to check health' }, 500)
    }
  })
  
  // Get generated files
  app.get('/jobs/:id/files', async (c) => {
    try {
      const id = c.req.param('id')
      
      const job = await jobManager.loadJob(id)
      if (!job) {
        return c.json({ error: 'Job not found' }, 404)
      }
      
      // Read workspace directory structure
      const fs = await import('fs/promises')
      const path = await import('path')
      
      async function getDirectoryStructure(dirPath: string, basePath: string = ''): Promise<any[]> {
        const items: any[] = []
        
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true })
          
          for (const entry of entries) {
            const relativePath = path.join(basePath, entry.name)
            
            if (entry.isDirectory() && entry.name !== 'node_modules') {
              items.push({
                name: entry.name,
                path: relativePath,
                type: 'directory',
                children: await getDirectoryStructure(path.join(dirPath, entry.name), relativePath)
              })
            } else if (entry.isFile()) {
              items.push({
                name: entry.name,
                path: relativePath,
                type: 'file'
              })
            }
          }
        } catch (error) {
          // Directory doesn't exist
        }
        
        return items
      }
      
      const files = await getDirectoryStructure(job.workspacePath)
      
      return c.json({ files })
    } catch (error) {
      console.error('Failed to get files:', error)
      return c.json({ error: 'Failed to get files' }, 500)
    }
  })
  
  // Get file content
  app.get('/jobs/:id/files/*', async (c) => {
    try {
      const id = c.req.param('id')
      const filePath = c.req.param('*')
      
      const job = await jobManager.loadJob(id)
      if (!job) {
        return c.json({ error: 'Job not found' }, 404)
      }
      
      const fs = await import('fs/promises')
      const path = await import('path')
      
      const fullPath = path.join(job.workspacePath, filePath)
      
      // Security check - ensure the file is within the workspace
      if (!fullPath.startsWith(job.workspacePath)) {
        return c.json({ error: 'Access denied' }, 403)
      }
      
      try {
        const content = await fs.readFile(fullPath, 'utf-8')
        return c.json({ content, path: filePath })
      } catch (error) {
        return c.json({ error: 'File not found' }, 404)
      }
    } catch (error) {
      console.error('Failed to get file:', error)
      return c.json({ error: 'Failed to get file' }, 500)
    }
  })
  
  return app
}
