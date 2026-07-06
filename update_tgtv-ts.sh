#!/bin/bash
set -e

REPO_DIR="/app/Repos/tgtv-tournament-system"
APP_DIR="/app/tgtv-ts"
APP_NAME="tgtv-app"
ENV_FILE="/app/tgtv-ts.env"   # .env лежит вне репы, не в git

echo "=== [1/5] git pull ==="
cd "$REPO_DIR"
git pull

echo "=== [2/5] Stopping pm2 app (if running) ==="
pm2 stop "$APP_NAME" 2>/dev/null || true

echo "=== [3/5] Syncing files to $APP_DIR ==="
rsync -av --delete --exclude='.git' --exclude='.env' \
  "$REPO_DIR/" "$APP_DIR/"

echo "=== [4/5] Copying .env ==="
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found at $ENV_FILE"
  echo "Create it from the template:"
  echo "  cp $REPO_DIR/.env.example $ENV_FILE"
  echo "  nano $ENV_FILE"
  exit 1
fi
cp "$ENV_FILE" "$APP_DIR/.env"

echo "=== [5/5] Starting pm2 app ==="
cd "$APP_DIR"
pm2 start server.js --name "$APP_NAME" 2>/dev/null || pm2 restart "$APP_NAME"
pm2 save

echo ""
echo "=== Deploy complete ==="
