#!/usr/bin/env bash
# Run as the existing root PM2 owner. Never sources dotenv or prints secrets.
set -Eeuo pipefail
umask 077

if [ "$EUID" -ne 0 ]; then
  echo "Run this reviewed deployment script with sudo." >&2
  exit 1
fi
if [ "$#" -ne 3 ]; then
  echo "Usage: bash email-production.sh COMMIT RELEASE_BUNDLE MAIL_ENV_FRAGMENT" >&2
  exit 1
fi
EXPECTED="$1"
BUNDLE="$(realpath "$2")"
FRAGMENT="$(realpath "$3")"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
HELPER="$SCRIPT_DIR/email-production-env.cjs"
REPO=/app/Repos/tgtv-tournament-system
APP=/app/tgtv-ts
ENV_FILE=/app/tgtv-ts.env
APP_NAME=tgtv-app
export PM2_HOME=/root/.pm2
export NODE_ENV=production

[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid commit"; exit 1; }
test -f "$BUNDLE"
test -f "$FRAGMENT"
test -f "$HELPER"
test -S "$PM2_HOME/rpc.sock"
test "$(git -C "$REPO" branch --show-current)" = main
test -z "$(git -C "$REPO" status --porcelain)"
node "$HELPER" preflight "$ENV_FILE" "$APP_NAME"

# The bundle carries the reviewed commit, avoiding a race with later main pushes.
git -C "$REPO" bundle verify "$BUNDLE"
git -C "$REPO" fetch "$BUNDLE" HEAD
test "$(git -C "$REPO" rev-parse FETCH_HEAD)" = "$EXPECTED"
git -C "$REPO" merge-base --is-ancestor HEAD "$EXPECTED"
git -C "$REPO" cat-file -e "$EXPECTED:src/api/email.js"

BACKUP="/app/backups/email-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
cp -p "$ENV_FILE" "$BACKUP/tgtv-ts.env"
cp -p "$APP/.env" "$BACKUP/app.env"
git -C "$REPO" rev-parse HEAD > "$BACKUP/previous-commit.txt"
tar --exclude='./node_modules' --exclude='./.git' \
  -czf "$BACKUP/app-before-email.tar.gz" -C "$APP" .
docker exec tgtv-tournament-postgres pg_dump -U tgtv -d tgtv_tournament -Fc \
  > "$BACKUP/database.dump"
test -s "$BACKUP/database.dump"
docker exec -i tgtv-tournament-postgres pg_restore --list \
  < "$BACKUP/database.dump" > "$BACKUP/database-contents.txt"
cp "$FRAGMENT" "$BACKUP/resend-auth.production.env"
chmod 600 "$BACKUP/"*.env "$BACKUP/database.dump"
printf 'Backup saved: %s\n' "$BACKUP"

# Validate before stopping the site. No actual email is sent by this check.
cp "$ENV_FILE" "$BACKUP/env-validation"
node "$HELPER" configure "$BACKUP/env-validation" "$FRAGMENT" disabled
CHANGED=0
on_error() {
  local code=$?
  trap - ERR
  set +e
  if [ "$CHANGED" = 1 ]; then
    echo "Deployment failed; disabling email and attempting to restart the application." >&2
    node "$HELPER" provider "$ENV_FILE" disabled
    cp "$ENV_FILE" "$APP/.env"
    node "$HELPER" restart "$ENV_FILE" "$APP_NAME"
    pm2 save
  fi
  printf 'Inspect PM2 logs. Backup: %s\n' "$BACKUP" >&2
  exit "$code"
}
trap on_error ERR
node "$HELPER" configure "$ENV_FILE" "$FRAGMENT" disabled
CHANGED=1
pm2 stop "$APP_NAME"
git -C "$REPO" merge --ff-only "$EXPECTED"
rsync -a --delete --exclude='.git' --exclude='.env' \
  --exclude='node_modules' --exclude='work' "$REPO/" "$APP/"
cd "$APP"
npm ci --omit=dev
cp "$ENV_FILE" "$APP/.env"
chmod 600 "$APP/.env"
node "$HELPER" restart "$ENV_FILE" "$APP_NAME"

wait_email() {
  local expected="$1"
  local attempt
  for attempt in $(seq 1 40); do
    if curl -fsS --max-time 3 http://127.0.0.1:3000/api/auth/email-config |
      node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{process.exit(JSON.parse(s).enabled===(process.argv[1]==="true")?0:1)}catch{process.exit(1)}})' "$expected"; then
      return 0
    fi
    sleep 1
  done
  return 1
}
wait_email false
curl -fsS --max-time 10 http://127.0.0.1:3000/api/me > /dev/null
curl -fsS --max-time 10 https://ktcompanion.ru/ > /dev/null
node <<'NODE'
const { getPool, closePool } = require("./src/db/pool");
(async () => {
  const result = await getPool().query("SELECT name FROM schema_migrations WHERE version=42");
  if (result.rows[0]?.name !== "email_accounts") throw Error("Email migration is missing");
  process.env.EMAIL_PROVIDER = "resend";
  require("./src/email/config").configuration();
  console.log("Email migration and configuration verified");
})().catch(() => { console.error("Email preflight failed"); process.exitCode=1; }).finally(closePool);
NODE

node "$HELPER" provider "$ENV_FILE" resend
cp "$ENV_FILE" "$APP/.env"
chmod 600 "$APP/.env"
node "$HELPER" restart "$ENV_FILE" "$APP_NAME"
wait_email true
curl -fsS --max-time 10 https://ktcompanion.ru/api/auth/email-config
printf '\n'
STATUS="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
  -X POST https://ktcompanion.ru/api/email/webhook \
  -H 'Content-Type: application/json' --data '{}')"
test "$STATUS" = 401
pm2 save
cp "$ENV_FILE" "$BACKUP/tgtv-ts.email-enabled.env"
chmod 600 "$BACKUP/tgtv-ts.email-enabled.env"
trap - ERR
printf 'Email release deployed: %s\nBackup: %s\n' "$EXPECTED" "$BACKUP"
echo "Enable the prepared Resend webhook, then verify delivery to the approved test inbox."
