#!/usr/bin/env bash
# Development launcher to run OpenHei from source with the local dashboard

export OPENHEI_DASHBOARD_DIR="$(pwd)/packages/app/dist"
export OPENHEI_SERVER_USERNAME="admin"
export OPENHEI_SERVER_PASSWORD="password"

echo "Starting OpenHei from source..."
echo "Using Dashboard: $OPENHEI_DASHBOARD_DIR"

# Ensure dependencies are current, skipping husky if git is missing
HUSKY=0 bun install

# Run from source with browser conditions for SolidJS compatibility
exec bun --conditions=browser packages/openhei/src/index.ts web "$@"
