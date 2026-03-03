# OpenHei App Builder - Local Server

This is the Node.js backend server for the OpenHei App Builder feature. It provides real code generation, process spawning, and local execution capabilities.

## Features

- **Real Code Generation**: Generates Express backends and React frontends with actual files
- **Process Spawning**: Spawns real Node.js processes with PID tracking
- **Health Checks**: Monitors running processes with automatic health checks
- **Disk Persistence**: Stores jobs and logs on the filesystem
- **Start/Stop/Restart**: Full lifecycle management for backend and frontend processes

## Architecture

```
packages/app/server/
├── index.ts              # Main server entry point
├── api.ts                # Hono API routes
├── job-manager.ts        # Job persistence and management
├── job-runner.ts         # Job execution with process spawning
├── types.ts              # TypeScript type definitions
├── generators/
│   ├── backend-generator.ts   # Express + TypeScript generator
│   └── frontend-generator.ts  # React + Vite + Tailwind generator
└── package.json
```

## Getting Started

### 1. Install Dependencies

```bash
cd packages/app/server
npm install
```

### 2. Start the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start
```

The server will start on port 3333 by default (configurable via `APPBUILD_PORT` env var).

### 3. Start with Frontend

From the app package root:

```bash
# Start both the AppBuild server and Vite dev server
bun run dev
```

This will start:
- AppBuild API server on http://localhost:3333
- Vite dev server on http://localhost:5000

## API Endpoints

### Jobs

- `GET /appbuild/jobs` - List all jobs
- `POST /appbuild/jobs` - Create a new job
- `GET /appbuild/jobs/:id` - Get job details with logs
- `DELETE /appbuild/jobs/:id` - Delete a job
- `GET /appbuild/jobs/:id/logs` - Get job logs

### Process Control

- `POST /appbuild/jobs/:id/stop` - Stop a job's processes
- `POST /appbuild/jobs/:id/restart-backend` - Restart backend process
- `POST /appbuild/jobs/:id/restart-frontend` - Restart frontend process
- `GET /appbuild/jobs/:id/health` - Check backend health

### Files

- `GET /appbuild/jobs/:id/files` - Get workspace file structure
- `GET /appbuild/jobs/:id/files/*` - Get file content

## Workspace Structure

Jobs are stored in `.openhei/appbuild/<jobId>/`:

```
.openhei/appbuild/
├── <jobId>/
│   ├── job.json          # Job metadata
│   ├── logs.json         # Job logs
│   └── workspace/        # Generated code
│       ├── backend/      # Express backend
│       │   ├── src/
│       │   ├── package.json
│       │   └── ...
│       └── frontend/     # React frontend
│           ├── src/
│           ├── package.json
│           └── ...
```

## Environment Variables

- `APPBUILD_PORT` - Server port (default: 3333)
- `NODE_ENV` - Environment (development/production)

## Process Management

The server uses Node.js `child_process.spawn()` to:

1. Install dependencies (`npm install`)
2. Start backend (`npm start`)
3. Start frontend dev server (`npm run dev`)

Processes are tracked with their PIDs and can be:
- Monitored via health checks
- Stopped gracefully (SIGTERM)
- Force killed if needed (SIGKILL after 5s timeout)

## Health Checks

The server performs health checks on running backends every 30 seconds by calling the `/health` endpoint. Results are stored in the job metadata.

## Integration with OpenHei

The App Builder is integrated into OpenHei via:

1. **Sidebar Entry**: Added to `layout.tsx` with the "blocks" icon
2. **Routes**: `/app-builder` and `/app-builder/:sessionId` in `app.tsx`
3. **Vite Proxy**: API requests proxied to the local server

## Development

### Adding New Generators

1. Create a new generator class in `generators/`
2. Extend the `JobRunner` to use the generator
3. Add corresponding UI form in the frontend

### Testing

```bash
# Test the API directly
curl http://localhost:3333/health

# Create a job
curl -X POST http://localhost:3333/appbuild/jobs \
  -H "Content-Type: application/json" \
  -d '{"name": "Test App", "mode": "backend", "formData": {"appName": "Test App", "description": "A test app"}}'
```
