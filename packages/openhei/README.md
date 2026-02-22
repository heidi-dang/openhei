# openhei

OpenHei CLI + local backend.

## Local Development

```bash
bun install

# Backend (serves API on localhost:4096)
bun run --conditions=browser ./src/index.ts serve --port 4096
```

For local UI changes, run the app dev server from `packages/app` separately.

## Build

```bash
# Build a single native binary for the current platform
bun run script/build.ts --single --skip-install

# Faster reruns (reuse dashboard + models snapshot when present)
bun run script/build.ts --single --skip-install --reuse-dashboard --reuse-models
```

## Local Install

From the repo root:

```bash
./install.sh -repo-local --no-modify-path
./install.sh -repo-local --reuse-build --skip-install --skip-build --no-modify-path
```
