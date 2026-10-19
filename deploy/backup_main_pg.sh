!/usr/bin/env bash
# Daily Postgres backup: custom dump locally, AES-encrypted archive to FTP.
# Retention: daily / weekly (Sunday) / monthly (1st). Secrets via env only.
#
# Install on the server, e.g.:
#   install -m 700 deploy/backup_main_pg.sh /app/scripts/backup_main_pg.sh
# Env file (chmod 600), sourced by cron вЂ” never commit:
#   /app/backup-ftp.env
#
# Required for FTP upload:
#   FTP_HOST=ftp.example.com
#   FTP_USER=...
#   FTP_PASS=...
#   BACKUP_ENCRYPT_PASS=...   # AES passphrase for 7z (required if FTP_* set)
# Optional:
#   FTP_DIR=/backups/tgtv-pg  # remote base (daily|weekly|monthly under it)
#   FTP_PORT=21
#   CONTAINER_NAME DB_USER DB_NAME BACKUP_ROOT DAILY_KEEP WEEKLY_KEEP MONTHLY_KEEP
#
# Needs: docker, curl, 7z (p7zip-full). Plain FTP is supported; encrypt before upload.
set -Eeuo pipefail
umask 077

CONTAINER_NAME="${CONTAINER_NAME:-tgtv-tournament-postgres}"
DB_USER="${DB_USER:-tgtv}"
DB_NAME="${DB_NAME:-tgtv_tournament}"

BACKUP_ROOT="${BACKUP_ROOT:-/app/pg_backups/prod}"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"

DAILY_KEEP="${DAILY_KEEP:-14}"       # days
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"      # weeks
MONTHLY_KEEP="${MONTHLY_KEEP:-6}"    # months

FTP_HOST="${FTP_HOST:-}"
FTP_USER="${FTP_USER:-}"
FTP_PASS="${FTP_PASS:-}"
FTP_PORT="${FTP_PORT:-21}"
FTP_DIR="${FTP_DIR:-/backups/tgtv-pg}"
BACKUP_ENCRYPT_PASS="${BACKUP_ENCRYPT_PASS:-}"

STAMP="$(date +%Y%m%d_%H%M%S)"
DOW="$(date +%u)"   # 1=Mon вЂ¦ 7=Sun
DOM="$(date +%d)"
BASE="backup_${STAMP}"
DUMP_NAME="${BASE}.dump"
ARCHIVE_NAME="${BASE}.dump.7z"
LOCAL_DUMP="$DAILY_DIR/$DUMP_NAME"
LOCAL_ARCHIVE=""
REMOTE_TMP=""

cleanup() {
  local code=$?
  [[ -n "$REMOTE_TMP" ]] && docker exec -T "$CONTAINER_NAME" rm -f "$REMOTE_TMP" 2>/dev/null || true
  [[ -n "$LOCAL_ARCHIVE" && -f "$LOCAL_ARCHIVE" ]] && rm -f "$LOCAL_ARCHIVE" || true
  exit "$code"
}
trap cleanup EXIT

command -v docker >/dev/null
command -v curl >/dev/null
command -v 7z >/dev/null

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"
chmod 700 "$BACKUP_ROOT"

echo "[backup] dumping ${DB_NAME} в†’ ${LOCAL_DUMP}"
REMOTE_TMP="/tmp/${DUMP_NAME}"
docker exec -T "$CONTAINER_NAME" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "$REMOTE_TMP"
docker cp "${CONTAINER_NAME}:${REMOTE_TMP}" "$LOCAL_DUMP"
docker exec -T "$CONTAINER_NAME" rm -f "$REMOTE_TMP"
REMOTE_TMP=""

test -s "$LOCAL_DUMP"
docker exec -i "$CONTAINER_NAME" pg_restore --list <"$LOCAL_DUMP" >/dev/null
chmod 600 "$LOCAL_DUMP"
echo "[backup] local ok $(du -h "$LOCAL_DUMP" | awk '{print $1}')"

if [[ "$DOW" == "7" ]]; then
  cp -p "$LOCAL_DUMP" "$WEEKLY_DIR/$DUMP_NAME"
  echo "[backup] weekly в†’ $WEEKLY_DIR/$DUMP_NAME"
fi
if [[ "$DOM" == "01" ]]; then
  cp -p "$LOCAL_DUMP" "$MONTHLY_DIR/$DUMP_NAME"
  echo "[backup] monthly в†’ $MONTHLY_DIR/$DUMP_NAME"
fi

encrypt_archive() {
  local src="$1"
  LOCAL_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/tgtv-pg-backup.XXXXXX.7z")"
  # -mhe=on: encrypt file names; -mx=0: store only (-Fc already compressed)
  7z a -t7z -mhe=on -mx=0 -p"${BACKUP_ENCRYPT_PASS}" "$LOCAL_ARCHIVE" "$src" >/dev/null
  chmod 600 "$LOCAL_ARCHIVE"
}

upload_ftp() {
  local src="$1"
  local remote_subdir="$2"
  local remote_name="$3"

  [[ -n "$FTP_HOST" ]] || return 0

  if [[ -z "$FTP_USER" || -z "$FTP_PASS" || -z "$BACKUP_ENCRYPT_PASS" ]]; then
    echo "[backup] FTP_HOST set but FTP_USER/FTP_PASS/BACKUP_ENCRYPT_PASS missing" >&2
    return 1
  fi

  encrypt_archive "$src"

  local dest_dir="${FTP_DIR%/}/${remote_subdir}"
  local url="ftp://${FTP_HOST}:${FTP_PORT}${dest_dir}/${remote_name}"
  echo "[backup] FTP в†’ ${FTP_HOST}${dest_dir}/${remote_name}"
  curl -sS --fail --ftp-create-dirs \
    --user "${FTP_USER}:${FTP_PASS}" \
    -T "$LOCAL_ARCHIVE" \
    "$url"
  rm -f "$LOCAL_ARCHIVE"
  LOCAL_ARCHIVE=""
}

upload_ftp "$LOCAL_DUMP" "daily" "$ARCHIVE_NAME"
[[ "$DOW" == "7" ]] && upload_ftp "$WEEKLY_DIR/$DUMP_NAME" "weekly" "$ARCHIVE_NAME"
[[ "$DOM" == "01" ]] && upload_ftp "$MONTHLY_DIR/$DUMP_NAME" "monthly" "$ARCHIVE_NAME"

find "$DAILY_DIR" -name 'backup_*.dump' -mtime +"$DAILY_KEEP" -delete
find "$WEEKLY_DIR" -name 'backup_*.dump' -mtime +"$((WEEKLY_KEEP * 7))" -delete
find "$MONTHLY_DIR" -name 'backup_*.dump' -mtime +"$((MONTHLY_KEEP * 30))" -delete

echo "[backup] done"
# Restore local:
#   docker cp $LOCAL_DUMP tgtv-tournament-postgres:/tmp/restore.dump
#   docker exec -T tgtv-tournament-postgres \
#     pg_restore -U tgtv -d tgtv_tournament --clean --if-exists --no-owner --role=tgtv \
#     /tmp/restore.dump
# Decrypt FTP archive:
#   7z x backup_вЂ¦.dump.7z
