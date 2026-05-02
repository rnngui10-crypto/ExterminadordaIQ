#!/usr/bin/env bash
set -e

echo "==> Installing Python packages..."
pip install -r artifacts/api-server/requirements.txt

echo "==> Installing Node packages..."
npm install -g pnpm@9
pnpm install --frozen-lockfile

echo "==> Building frontend..."
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/iq-trader run build

echo "==> Building API server..."
pnpm --filter @workspace/api-server run build

echo "==> Build complete!"
