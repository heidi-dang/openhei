# OpenHei App Builder - Evidence Pack

This folder contains evidence demonstrating the App Builder functionality.

## Quick Start

To generate all evidence outputs:

```bash
# 1. Start the development servers (Terminal 1)
cd /root/openhei/packages/app
bun run dev

# 2. In another terminal, run the evidence script (Terminal 2)
cd /root/openhei/EVIDENCE
./generate-all-evidence.sh
```

## Evidence Files

### Generated Evidence (created by script)

| File                      | Description                         |
| ------------------------- | ----------------------------------- | ---------- |
| SUMMARY.txt               | Test summary with pass/fail results |
| job-created.json          | Job creation API response           |
| job-ready.json            | Job status when.log                 | Full ready |
| backend backend logs      |
| health-check.json         | Health check API response           |
| pid-proof.txt             | PID before/after stop verification  |
| ports.txt                 | Port usage before/after stop        |
| sandbox-proof.txt         | Docker/container evidence           |
| stop-response.json        | Stop API response                   |
| restart-response.json     | Restart API response                |
| health-after-restart.json | Health check after restart          |
| final-logs.json           | Complete logs                       |

### Documentation

| File                   | Description                                  |
| ---------------------- | -------------------------------------------- |
| commands.txt           | All API endpoints and shell commands         |
| repro.md               | Step-by-step user journey reproduction guide |
| EVIDENCE_GENERATION.md | Guide to generate evidence                   |

## Manual Verification

### Verify PID is Gone

```bash
# Replace <pid> with the actual PID from pid-proof.txt
ps -p <pid>

# Expected: "ps: pid <pid> does not exist"
```

### Verify Port is Closed

```bash
# Replace <port> with the actual port from pid-proof.txt
curl http://localhost:3333/appbuild/verify-port/<port>

# Expected: {"port": <port>, "isClosed": true, "isOpen": false}
```

### Check Docker Containers

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Check container stats
docker stats <container-id> --no-stream
```

## Expected Results

The evidence should demonstrate:

1. Job created successfully
2. Backend starts with real PID
3. Health check passes
4. Stop kills entire process tree
5. PID verified as terminated
6. Port verified as closed
7. Restart creates new PID
8. New process passes health check
9. Docker containers created with resource limits
10. Logs stream in real-time

## Troubleshooting

**Server not running:**

```bash
cd packages/app
bun run dev
```

**Docker not available:**
The system will automatically fall back to host mode. Check the job status for confirmation.

**Port already in use:**
The system will find the next available port automatically. Check the job status for the actual port used.
