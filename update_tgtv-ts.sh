#!/bin/bash
set -e

# Usage:
#   bash update_tgtv-ts.sh              # production (default)
#   bash update_tgtv-ts.sh production
#   bash update_tgtv-ts.sh staging

ENV="${1:-production}"

case "$ENV" in
  production|prod)
    REPO_DIR="/app/Repos/tgtv-tournament-system"
    APP_DIR="/app/tgtv-ts"
    APP_NAME="tgtv-app"
    ENV_FILE="/app/tgtv-ts.env"
    BRANCH="main"
    ;;
  staging|stage|dev)
    REPO_DIR="/app/Repos/tgtv-tournament-system-staging"
    APP_DIR="/app/tgtv-ts-staging"
    APP_NAME="tgtv-app-staging"
    ENV_FILE="/app/tgtv-ts-staging.env"
    BRANCH="feat/tournament-system-mvp"
    ;;
  *)
    echo "Usage: $0 [production|staging]"
    echo "  production — branch main → /app/tgtv-ts"
    echo "  staging    — branch feat/tournament-system-mvp → /app/tgtv-ts-staging"
    exit 1
    ;;
esac

echo "=== Deploy target: $ENV ==="
echo "  repo:   $REPO_DIR ($BRANCH)"
echo "  app:    $APP_DIR"
echo "  pm2:    $APP_NAME"
echo "  env:    $ENV_FILE"
echo ""

echo "=== [1/6] git pull ($BRANCH) ==="
cd "$REPO_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "=== [2/6] Stopping pm2 app (if running) ==="
pm2 stop "$APP_NAME" 2>/dev/null || true

echo "=== [3/6] Syncing files to $APP_DIR ==="
# node_modules исключены из --delete, чтобы не сносить их при каждом деплое
rsync -av --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='node_modules' \
  "$REPO_DIR/" "$APP_DIR/"

echo "=== [4/6] Installing npm dependencies from package-lock.json ==="
cd "$APP_DIR"
npm ci --omit=dev

echo "=== [5/6] Copying .env ==="
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: env file not found at $ENV_FILE"
    echo "Create it from the template:"
    echo "  cp $REPO_DIR/.env.example $ENV_FILE"
    echo "  nano $ENV_FILE"
    exit 1
fi
cp "$ENV_FILE" "$APP_DIR/.env"

echo "=== [6/6] Starting pm2 app ==="
# NODE_ENV=production makes src/config.js default COOKIE_SECURE to true (the
# session cookie, including the one carrying an admin password reset, gets
# the Secure flag). pm2 fixes the env a process was (re)started with and
# keeps reusing it on later restarts unless told otherwise, so --update-env
# is required here too -- without it, an app that was ever started without
# NODE_ENV set would keep running without it forever, even after this script
# starts exporting it.
export NODE_ENV=production
pm2 start server.js --name "$APP_NAME" 2>/dev/null || pm2 restart "$APP_NAME" --update-env
pm2 save

echo ""
echo "=== Deploy complete ($ENV) ==="
#!/bin/bash
set -e

# Usage:
#   bash update_tgtv-ts.sh              # production (default)
#   bash update_tgtv-ts.sh production
#   bash update_tgtv-ts.sh staging

ENV="${1:-production}"

case "$ENV" in
  production|prod)
    REPO_DIR="/app/Repos/tgtv-tournament-system"
    APP_DIR="/app/tgtv-ts"
    APP_NAME="tgtv-app"
    ENV_FILE="/app/tgtv-ts.env"
    BRANCH="main"
    ;;
  staging|stage|dev)
    REPO_DIR="/app/Repos/tgtv-tournament-system-staging"
    APP_DIR="/app/tgtv-ts-staging"
    APP_NAME="tgtv-app-staging"
    ENV_FILE="/app/tgtv-ts-staging.env"
    BRANCH="feat/tournament-system-mvp"
    ;;
  *)
    echo "Usage: $0 [production|staging]"
    echo "  production — branch main → /app/tgtv-ts"
    echo "  staging    — branch feat/tournament-system-mvp → /app/tgtv-ts-staging"
    exit 1
    ;;
esac

echo "=== Deploy target: $ENV ==="
echo "  repo:   $REPO_DIR ($BRANCH)"
echo "  app:    $APP_DIR"
echo "  pm2:    $APP_NAME"
echo "  env:    $ENV_FILE"
echo ""

echo "=== [1/6] git pull ($BRANCH) ==="
cd "$REPO_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "=== [2/6] Stopping pm2 app (if running) ==="
pm2 stop "$APP_NAME" 2>/dev/null || true

echo "=== [3/6] Syncing files to $APP_DIR ==="
# node_modules исключены из --delete, чтобы не сносить их при каждом деплое
rsync -av --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='node_modules' \
  "$REPO_DIR/" "$APP_DIR/"

echo "=== [4/6] Installing npm dependencies from package-lock.json ==="
cd "$APP_DIR"
npm ci --omit=dev

echo "=== [5/6] Copying .env ==="
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: env file not found at $ENV_FILE"
    echo "Create it from the template:"
    echo "  cp $REPO_DIR/.env.example $ENV_FILE"
    echo "  nano $ENV_FILE"
    exit 1
fi
cp "$ENV_FILE" "$APP_DIR/.env"

echo "=== [6/6] Starting pm2 app ==="
# NODE_ENV=production makes src/config.js default COOKIE_SECURE to true (the
# session cookie, including the one carrying an admin password reset, gets
# the Secure flag). pm2 fixes the env a process was (re)started with and
# keeps reusing it on later restarts unless told otherwise, so --update-env
# is required here too -- without it, an app that was ever started without
# NODE_ENV set would keep running without it forever, even after this script
# starts exporting it.
export NODE_ENV=production
pm2 start server.js --name "$APP_NAME" 2>/dev/null || pm2 restart "$APP_NAME" --update-env
pm2 save

echo ""
echo "=== Deploy complete ($ENV) ==="
