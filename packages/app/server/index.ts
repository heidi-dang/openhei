/**
 * AppBuild Local Server - Node.js Backend
 * Main entry point for the local App Builder server
 */

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { JobManager } from './job-manager'
import { JobRunner } from './job-runner'
import { createAppBuildRoutes } from './api'

const PORT = process.env.APPBUILD_PORT ? parseInt(process.env.APPBUILD_PORT) : 3333

// Initialize job manager and runner
const jobManager = new JobManager(process.cwd())
const jobRunner = new JobRunner(jobManager)

// Create main app
const app = new Hono()

// Enable CORS for all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

// Health check
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'openhei-appbuild',
    timestamp: new Date().toISOString()
  })
})

// Mount AppBuild routes
app.route('/appbuild', createAppBuildRoutes(jobManager, jobRunner))

// Start server
console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   OpenHei App Builder - Local Server                     ║
║                                                          ║
║   Server running on http://localhost:${PORT}              ║
║                                                          ║
║   API Endpoints:                                         ║
║   - GET  /health           Health check                  ║
║   - GET  /appbuild/jobs    List all jobs                 ║
║   - POST /appbuild/jobs    Create new job                ║
║   - GET  /appbuild/jobs/:id Get job details              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`)

serve({
  fetch: app.fetch,
  port: PORT
})

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...')
  
  // Get all jobs and stop their processes
  const jobs = await jobManager.listJobs()
  for (const job of jobs) {
    if (job.status === 'running' || job.status === 'ready') {
      console.log(`Stopping job: ${job.name} (${job.id})`)
      await jobRunner.stopJob(job.id)
    }
  }
  
  console.log('Goodbye!')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\nShutting down gracefully...')
  
  const jobs = await jobManager.listJobs()
  for (const job of jobs) {
    if (job.status === 'running' || job.status === 'ready') {
      console.log(`Stopping job: ${job.name} (${job.id})`)
      await jobRunner.stopJob(job.id)
    }
  }
  
  console.log('Goodbye!')
  process.exit(0)
})
