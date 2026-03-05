# Doctor Usage Guide

## Prereqs

- bun
- node
- python3
- rg (optional)
- git

## Clean Install

```bash
bun install --frozen-lockfile
```

## Run Doctor

```bash
python3 tools/doctor.py
```

## Outputs (\_doctor/<stamp>/)

- `report.md` / `report.json`: CI/static issues
- `runtime_working.md` / `runtime_broken.md`: runtime suite (backend/UI/SSE/stop-restart)
- `dev_report.json`: task list for PRs

## PASS

- exit 0
- runtime executed (PASS in working.md)
- runtime_broken.md empty
- no HIGH/MED

## FAIL

- stage skipped (missing tooling)
- runtime skipped
- any FAIL\n\n**Extra envvars**:\n`bash\nOPENHEI_BACKEND_PORT=4096 OPENHEI_BACKEND_DIR=packages/openhei OPENHEI_BACKEND_SCRIPT=serve ./tools/doctor.py\n`\n
