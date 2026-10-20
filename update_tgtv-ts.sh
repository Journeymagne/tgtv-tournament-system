#!/bin/bash
set -Eeuo pipefail

# Usage:
#   bash update_tgtv-ts.sh [production|staging] [--prepare-only]
#   bash update_tgtv-ts.sh production --ref <sha-or-tag> [--prepare-only]
# Deployment details and recovery: docs/deployment.md
usage() {
  echo "Usage: $0 [production|staging] [--ref <sha-or-tag>] [--prepare-only]" >&2
}

TARGET="${1:-production}"
shift || true
REF=""
MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prepare-only)
      MODE="--prepare-only"
      shift
      ;;
    --ref)
      [[ $# -ge 2 && -n "${2:-}" ]] || { echo "Missing value for --ref" >&2; usage; exit 1; }
      REF="$2"
      shift 2
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

case "$TARGET" in
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
    usage
    exit 1
    ;;
esac

for command in git node npm pm2 tar flock; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done
[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || {
  echo "Node.js 22+ is required" >&2; exit 1;
}
# Lock covers repository update, preparation and activation. The OS releases it on exit.
exec 9>"${APP_DIR}.update.lock"
flock -n 9 || { echo "Another deployment is in progress for $APP_NAME" >&2; exit 1; }

export SSH_ASKPASS=/root/.ssh/askpass.sh
export SSH_ASKPASS_REQUIRE=force
export DISPLAY=:0
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="setsid -w ssh -o StrictHostKeyChecking=accept-new"

cd "$REPO_DIR"
[[ -z "$(git status --porcelain)" ]] || { echo "Repository has uncommitted changes" >&2; exit 1; }
git fetch origin --tags --prune
git fetch origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"

if [[ -n "$REF" ]]; then
  # Resolve the requested tag/SHA to a commit and deploy exactly that tree.
  if ! git cat-file -e "${REF}^{commit}" 2>/dev/null; then
    git fetch origin "$REF"
  fi
  RESOLVED="$(git rev-parse --verify "${REF}^{commit}")"
  git merge-base --is-ancestor "$RESOLVED" "origin/$BRANCH" || {
    echo "Ref $REF ($RESOLVED) is not on origin/$BRANCH; refusing deploy" >&2
    exit 1
  }
  git checkout --detach "$RESOLVED"
  echo "Preparing $TARGET (ref $REF → $RESOLVED) for $APP_NAME"
else
  git checkout "$BRANCH"
  git merge --ff-only "origin/$BRANCH"
  # Avoid accidentally deploying local-only commits from this server.
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/$BRANCH")" ]] || {
    echo "Local branch differs from origin/$BRANCH" >&2; exit 1;
  }
  echo "Preparing $TARGET ($BRANCH) for $APP_NAME"
fi

ARGS=("$REPO_DIR" "$APP_DIR" "$APP_NAME" "$ENV_FILE")
[[ -z "$MODE" ]] || ARGS+=("$MODE")
TGTV_DEPLOY_LOCKED="$APP_DIR" node scripts/deploy-release.js "${ARGS[@]}"
