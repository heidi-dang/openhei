# Evidence Generation Guide

To generate real evidence outputs, run the App Builder and execute the following:

## Prerequisites

```bash
# Install dependencies
cd packages/app
bun install

# Start servers
bun run dev
```

## Generate Evidence

```bash
# In another terminal
cd packages/app

# 1. Create a backend job
curl -X POST http://localhost:3333/appbuild/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sample Tasks API",
    "mode": "backend",
    "sandboxMode": "docker",
    "formData": {
      "appName": "Sample Tasks API",
      "description": "A simple CRUD API for managing tasks",
      "port": 3001
    }
  }'

# 2. Wait for jobpoll until status = "ready")
curl to be ready ( http://localhost:3333/appbuild/jobs/<job-id>

# 3. Capture logs
curl http://localhost:3333/appbuild/jobs/<job-id>/logs > backend.log

# 4. Health check
curl http://localhost:3333/appbuild/jobs/<job-id>/health

# 5. Verify PID exists
ps -p <backend-pid>

# 6. Verify port is open
ss -ltnp | grep <backend-port>

# 7. Stop backend
curl -X POST http://localhost:3333/appbuild/jobs/<job-id>/stop

# 8. Verify PID is gone
ps -p <backend-pid>
# Expected: "ps: pid <pid> does not exist"

# 9. Verify port is closed
ss -ltnp | grep <backend-port>
# Expected: no output

# 10. Restart backend
curl -X POST http://localhost:3333/appbuild/jobs/<job-id>/restart-backend

# 11. Verify new PID and health
curl http://localhost:3333/appbuild/jobs/<job-id>/health

# 12. Docker proof
docker ps --filter "name=openhei-<job-id>"
docker stats <container-id> --no-stream
```

## Expected Evidence Files

- `recording.mp4` - Screen recording of the full workflow
- `backend.log` - Backend logs from the job
- `frontend.log` - Frontend logs (if UI job created)
- `pid-proof.txt` - PID before/after stop verification
- `ports.txt` - Port usage before/after stop
- `sandbox-proof.txt` - Docker container evidence
