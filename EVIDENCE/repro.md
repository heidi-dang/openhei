# OpenHei App Builder - User Journey Reproduction Guide

## Prerequisites

- Docker installed and running (for sandbox mode)
- Node.js 20+ and Bun installed
- Git installed

## Setup

```bash
# 1. Navigate to the repo
cd /mnt/okcomputer/output/heidi-dang-openhei-f18de5d

# 2. Install dependencies
bun install

# 3. Start the development servers
cd packages/app
bun run dev
```

Wait for both servers to start:
- AppBuild API: http://localhost:3333
- OpenHei UI: http://localhost:5000

---

## Journey 1: Create a Backend Job

### Step 1: Open App Builder

1. Open browser to http://localhost:5000/app-builder
2. You should see the App Builder interface with three tabs: Backend, UI, Repo Import

### Step 2: Create Backend

1. Click on the "Backend" tab
2. Fill in the form:
   - **App Name**: `Tasks API`
   - **Description**: `A simple CRUD API for managing tasks`
   - **Port**: `3001`
   - **Language**: `TypeScript`
   - **Framework**: `Express`
   - **Database**: `In-Memory`
   - **Auth**: `None`
3. Click "Create Backend"

### Step 3: Watch Progress

1. The job appears in the left sidebar
2. Click on it to see the Session Detail page
3. Watch the Progress tab - phases will update:
   - Plan → Scaffold → Implement → Validate → Run Backend → Ready
4. Switch to the Logs tab to see real-time logs

### Step 4: Verify Backend is Running

1. Switch to the Backend tab
2. You should see:
   - Status: `running`
   - Port: `3001`
   - PID: (a number)
   - Health: `✓ OK`
   - Sandbox Mode: `docker` or `host`

### Step 5: Test Backend Directly

```bash
# Health check
curl http://localhost:3001/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-...",
  "service": "Tasks API"
}

# List items
curl http://localhost:3001/api/items
```

---

## Journey 2: Create a UI Job

### Step 1: Create UI

1. Go back to App Builder (click "New Session" or navigate to /app-builder)
2. Click on the "UI" tab
3. Fill in the form:
   - **App Name**: `Tasks Manager`
   - **Description**: `Frontend for managing tasks`
   - **Port**: `4001`
   - **Framework**: `React`
   - **Styling**: `Tailwind CSS`
4. Click "Create UI"

### Step 2: Watch Progress

1. The job appears in the sidebar
2. Click on it to see progress
3. Phases: Plan → Scaffold → Implement → Validate → Run Frontend → Ready

### Step 3: Preview UI

1. Switch to the Preview tab
2. You should see the generated UI loaded in an iframe
3. The UI should show:
   - Header with app name
   - Navigation (Home, Items, About)
   - Main content area

---

## Journey 3: Stop Backend and Verify

### Step 1: Stop Backend

1. In the Backend tab, click "Stop Backend"
2. Wait for confirmation

### Step 2: Verify PID is Gone

```bash
# Check if PID exists (replace <pid> with actual PID)
ps -p <pid>

# Expected: "ps: pid <pid> does not exist"
```

### Step 3: Verify Port is Closed

```bash
# Check if port is closed
curl http://localhost:3333/appbuild/verify-port/3001

# Expected: {"port": 3001, "isClosed": true, "isOpen": false}
```

### Step 4: Verify via API

```bash
# Verify PID via API
curl http://localhost:3333/appbuild/jobs/<job-id>/verify-pid/<pid>

# Expected: {"pid": <pid>, "isGone": true, "isRunning": false}
```

---

## Journey 4: Restart Backend

### Step 1: Restart Backend

1. In the Backend tab, click "Restart Backend"
2. Wait for the backend to start

### Step 2: Verify New PID

1. You should see a new PID
2. Health check should show `✓ OK`

### Step 3: Test Backend

```bash
# Health check should pass
curl http://localhost:3001/health
```

---

## Journey 5: Stop/Restart Frontend

### Step 1: Stop Frontend

1. Switch to Preview tab
2. Click "Stop Frontend"
3. The preview iframe should show an error or blank page

### Step 2: Restart Frontend

1. Click "Restart Frontend"
2. Wait for it to start
3. The preview should reload and work again

---

## Journey 6: Repo Import (Run Only)

### Step 1: Import Repo

1. Click on "Repo Import" tab
2. Fill in:
   - **Repository URL**: `https://github.com/expressjs/express.git`
   - **Run Target**: `backend`
3. Click "Import Repository"

### Step 2: Note

The UI should clearly indicate:
- "Repo Import (Run Only) - clones and runs, no AI changes"
- The repo will be cloned and attempts to run

---

## Journey 7: Sandbox Mode Verification

### Step 1: Check Sandbox Status

```bash
curl http://localhost:3333/appbuild/sandbox/status

# Expected if Docker available:
{
  "dockerAvailable": true,
  "defaultMode": "docker",
  "message": "Docker is available, sandbox mode enabled"
}
```

### Step 2: View Docker Containers

```bash
# List running containers
docker ps

# You should see containers named like:
# openhei-<job-id>-backend
# openhei-<job-id>-frontend
```

### Step 3: Check Container Resources

```bash
# Check resource usage
docker stats <container-id> --no-stream

# Expected output shows memory and CPU limits
```

---

## Journey 8: Error Handling

### Step 1: Create Job with Invalid Port

1. Create a backend job
2. Use a port that's already in use (e.g., 5000)

### Step 2: Observe Error

1. The job should fail
2. Logs should show the error
3. Error info should be displayed in the UI
4. Workspace should be preserved for inspection

---

## Journey 9: Open Workspace

### Step 1: Get Workspace Path

```bash
curl http://localhost:3333/appbuild/jobs/<job-id>/workspace-path
```

### Step 2: Inspect Generated Code

```bash
# View the generated files
ls -la .openhei/appbuild/<job-id>/workspace/
```

---

## Cleanup

### Delete Job

1. In the Session Detail, click "Delete"
2. This stops all processes and removes the workspace

### Or via API

```bash
curl -X DELETE http://localhost:3333/appbuild/jobs/<job-id>
```

---

## Expected Behaviors Checklist

- [ ] `bun run dev` starts both servers without manual steps
- [ ] Backend job creates workspace, generates code, installs deps, starts server
- [ ] Health check passes for running backend
- [ ] UI job generates frontend, starts dev server, preview works
- [ ] Stop backend kills process, PID verified gone, port closed
- [ ] Restart backend creates new PID, health check passes
- [ ] Stop frontend breaks preview, restart fixes it
- [ ] Repo Import clearly labeled as "Run Only"
- [ ] Sandbox mode runs apps in Docker containers with resource limits
- [ ] Logs stream in real-time to UI
- [ ] Error handling shows meaningful messages
- [ ] Workspace path accessible for inspection
