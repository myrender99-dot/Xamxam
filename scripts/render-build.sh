#!/usr/bin/env bash
# Render.com build script
# Configure this as your Build Command in the Render dashboard.
# Required env var: DATABASE_URL (set in Render → Environment → Add Environment Variable)
set -euo pipefail

echo "▶ Installing dependencies…"
pnpm install --frozen-lockfile

echo "▶ Applying database schema (drizzle-kit push)…"
pnpm --filter @workspace/db run push-force

echo "▶ Building API server…"
pnpm --filter @workspace/api-server run build

echo "▶ Building frontend…"
pnpm --filter @workspace/dokmart run build

echo "✓ Build complete"
