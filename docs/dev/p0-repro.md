# OpenHei P0 Reliability - Reproduction Guide

## Environment

- **OS**: Ubuntu 25.04 (Linux 6.14.0)
- **Shell**: bash
- **Node**: v24.13.1
- **Bun**: 1.3.9+

## Start Commands

### Backend Server

```bash
cd /home/heidi/work/open/packages/openhei
bun run --conditions=browser ./src/index.ts serve --port 4096
```

- **URL**: http://localhost:4096
- **Expected**: `{"healthy":true,"version":"local"}`

### UI Dev Server

```bash
cd /home/heidi/work/open/packages/app
bun dev -- --port 4444
```

- **URL**: http://localhost:4444
- **Expected**: HTML page loads

## How to Trigger a Run

### QLoRA Training Run

1. Open http://localhost:4444
2. Navigate to Settings → QLoRA
3. Click "Install" (if not installed)
4. Configure model params
5. Click "Start"

### Session/Chat Run

1. Open http://localhost:4444
2. Create or open a session
3. Type a prompt that triggers tool usage
4. Watch Thinking Bubble and Activity Panel

## How to Trigger Stop

### QLoRA Stop

1. Click "Stop" button in QLoRA panel
2. Verify with: `pgrep -af 'qlora|train' || echo "No processes"`

### Session Stop

1. Click Stop button in session header
2. Verify polling stops in Network tab

## Verification Commands

### Check Port 4096

```bash
ss -ltnp | grep ':4096'
# or
lsof -i :4096
```

### Check Running Processes

```bash
# QLoRA processes
pgrep -af 'qlora|train|heidi-engine' || echo "No training processes"

# Backend
pgrep -af 'bun.*openhei' || echo "No backend"
```

### Network Debugging

```bash
# Watch for spam (should NOT have many rapid requests)
curl -s -w "\n%{http_code}" http://localhost:4096/global/health

# Event stream
timeout 5 curl -s -N http://localhost:4096/global/event
```
