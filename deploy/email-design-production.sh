#!/usr/bin/env bash
# Update the reviewed email design without rewriting Resend or database settings.
set -Eeuo pipefail
umask 077
[[ "$EUID" = 0 ]] || { echo "Run this installer with sudo." >&2; exit 1; }
[[ "$#" = 2 ]] || { echo "Usage: bash email-design-production.sh COMMIT RELEASE_BUNDLE" >&2; exit 1; }
EXPECTED="$1"
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid commit" >&2; exit 1; }
BUNDLE="$(realpath "$2")"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
HELPER="$SCRIPT_DIR/email-production-env.cjs"
REPO=/app/Repos/tgtv-tournament-system
APP=/app/tgtv-ts
ENV_FILE=/app/tgtv-ts.env
APP_NAME=tgtv-app
export PM2_HOME=/root/.pm2 NODE_ENV=production
[[ "$(realpath "$REPO")" = "$REPO" && "$(realpath "$APP")" = "$APP" ]]
exec 9>/app/.email-design-deploy.lock
flock -n 9 || { echo "Another design update is running." >&2; exit 1; }
test -f "$BUNDLE"; test -f "$HELPER"; test -S "$PM2_HOME/rpc.sock"
test "$(git -C "$REPO" branch --show-current)" = main
test -z "$(git -C "$REPO" status --porcelain)"
node "$HELPER" preflight "$ENV_FILE" "$APP_NAME"
git -C "$REPO" bundle verify "$BUNDLE"
git -C "$REPO" fetch "$BUNDLE" HEAD
test "$(git -C "$REPO" rev-parse FETCH_HEAD)" = "$EXPECTED"
PREVIOUS="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" merge-base --is-ancestor "$PREVIOUS" "$EXPECTED"
git -C "$REPO" diff --quiet "$PREVIOUS" "$EXPECTED" -- src/db/migrations
node - "$REPO" "$EXPECTED" "$APP" <<'NODE'
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const [repo,expected,app]=process.argv.slice(2);
const read=ref=>JSON.parse(execFileSync('git',['-C',repo,'show',ref+':package.json'],{encoding:'utf8'}));
const before=read('HEAD'), after=read(expected);
assert.equal(require(app+'/package.json').version,before.version);
assert.equal(after.version,'5.1.1');
for(const key of ['dependencies','devDependencies','engines'])assert.deepEqual(after[key],before[key], 'Dependency change needs a different installer');
NODE
BACKUP="/app/backups/email-design-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
printf '%s\n' "$PREVIOUS" > "$BACKUP/previous-commit.txt"
cp -p "$ENV_FILE" "$BACKUP/tgtv-ts.env"
cp -p "$APP/.env" "$BACKUP/app.env"
tar --exclude='./node_modules' --exclude='./.git' --exclude='./work' -czf "$BACKUP/app-before.tar.gz" -C "$APP" .
docker exec tgtv-tournament-postgres pg_dump -U tgtv -d tgtv_tournament -Fc > "$BACKUP/database.dump"
test -s "$BACKUP/database.dump"
docker exec -i tgtv-tournament-postgres pg_restore --list < "$BACKUP/database.dump" > "$BACKUP/database-contents.txt"
printf 'Backup saved: %s\n' "$BACKUP"
CHANGED=0
on_error() {
  local code=$?
  trap - ERR
  set +e
  if [ "$CHANGED" = 1 ]; then
    echo "Update failed; restoring the previous application code." >&2
    pm2 stop "$APP_NAME"
    mkdir "$BACKUP/restore"
    if tar -xzf "$BACKUP/app-before.tar.gz" -C "$BACKUP/restore"; then
      rsync -a --delete --exclude='.git' --exclude='.env' --exclude='node_modules' --exclude='work' "$BACKUP/restore/" "$APP/"
    fi
    if [ "$(git -C "$REPO" rev-parse HEAD)" = "$EXPECTED" ] && [ -z "$(git -C "$REPO" status --porcelain)" ]; then
      git -C "$REPO" reset --hard "$PREVIOUS"
    fi
    node "$HELPER" restart "$ENV_FILE" "$APP_NAME"
    pm2 save
  fi
  printf 'Inspect PM2 logs. Backup: %s\n' "$BACKUP" >&2
  exit "$code"
}
trap on_error ERR
CHANGED=1
pm2 stop "$APP_NAME"
git -C "$REPO" merge --ff-only "$EXPECTED"
rsync -a --delete --exclude='.git' --exclude='.env' --exclude='node_modules' --exclude='work' "$REPO/" "$APP/"
node "$HELPER" restart "$ENV_FILE" "$APP_NAME"
READY=0
for attempt in $(seq 1 40); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/auth/email-config |
    node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{process.exit(JSON.parse(s).enabled===true?0:1)}catch{process.exit(1)}})'; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1
curl -fsS --max-time 10 http://127.0.0.1:3000/api/me > /dev/null
curl -fsS --max-time 10 https://ktcompanion.ru/ > /dev/null
curl -fsS --max-time 10 https://ktcompanion.ru/account-email.html > "$BACKUP/deployed-page.html"
node - "$BACKUP/deployed-page.html" "$APP" <<'NODE'
const fs=require('node:fs'), assert=require('node:assert/strict');
const [htmlPath,app]=process.argv.slice(2);
const html=fs.readFileSync(htmlPath,'utf8');
assert.ok(html.includes('data-companion-section="account"'));
assert.ok(html.includes('/account-email.css?v=5.1.1'));
assert.equal(require(app+'/package.json').version,'5.1.1');
console.log('Public account page and version 5.1.1 verified');
NODE
cmp -s "$ENV_FILE" "$BACKUP/tgtv-ts.env"
cmp -s "$APP/.env" "$BACKUP/app.env"
pm2 save
trap - ERR
printf 'Design release 5.1.1 deployed: %s\nBackup: %s\n' "$EXPECTED" "$BACKUP"
echo "Resend configuration preserved. Ready for the final browser and email check."
