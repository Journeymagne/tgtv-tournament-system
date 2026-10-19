#!/usr/bin/env bash
# Daily Postgres backup: keep 1 local dump; full GFS retention on FTP (encrypted).
# Secrets via env only - never commit.
#
# Install on the server, e.g.:
#   install -m 700 deploy/backup_main_pg.sh /app/scripts/backup_main_pg.sh
# Env file (chmod 600), sourced by cron:
#   /app/backup-ftp.env
#
# Required for FTP upload:
#   FTP_HOST=ftp.example.com
#   FTP_USER=...
#   FTP_PASS=...
#   BACKUP_ENCRYPT_PASS=...
# Optional:
#   FTP_DIR=/backups/tgtv-pg
#   FTP_PORT=21
#   FTP_DAILY_KEEP=14 FTP_WEEKLY_KEEP=8 FTP_MONTHLY_KEEP=6
#   CONTAINER_NAME DB_USER DB_NAME BACKUP_ROOT
#
# Needs: docker, curl, 7z (p7zip-full).
# Note: plain "docker exec" (no -t/-T). -T is only for "docker compose exec".
set -Eeuo pipefail
umask 077

CONTAINER_NAME="${CONTAINER_NAME:-tgtv-tournament-postgres}"
DB_USER="${DB_USER:-tgtv}"
DB_NAME="${DB_NAME:-tgtv_tournament}"

BACKUP_ROOT="${BACKUP_ROOT:-/app/pg_backups/prod}"
LOCAL_DIR="$BACKUP_ROOT/latest"

FTP_HOST="${FTP_HOST:-}"
FTP_USER="${FTP_USER:-}"
FTP_PASS="${FTP_PASS:-}"
FTP_PORT="${FTP_PORT:-21}"
FTP_DIR="${FTP_DIR:-/backups/tgtv-pg}"
BACKUP_ENCRYPT_PASS="${BACKUP_ENCRYPT_PASS:-}"

FTP_DAILY_KEEP="${FTP_DAILY_KEEP:-14}"       # days
FTP_WEEKLY_KEEP="${FTP_WEEKLY_KEEP:-8}"      # weeks
FTP_MONTHLY_KEEP="${FTP_MONTHLY_KEEP:-6}"    # months

STAMP="$(date +%Y%m%d_%H%M%S)"
DOW="$(date +%u)"   # 1=Mon ... 7=Sun
DOM="$(date +%d)"
BASE="backup_${STAMP}"
DUMP_NAME="${BASE}.dump"
ARCHIVE_NAME="${BASE}.dump.7z"
LOCAL_DUMP="$LOCAL_DIR/$DUMP_NAME"
LOCAL_ARCHIVE=""
REMOTE_TMP=""

cleanup() {
  local code=$?
  [[ -n "$REMOTE_TMP" ]] && docker exec "$CONTAINER_NAME" rm -f "$REMOTE_TMP" 2>/dev/null || true
  [[ -n "$LOCAL_ARCHIVE" && -f "$LOCAL_ARCHIVE" ]] && rm -f "$LOCAL_ARCHIVE" || true
  exit "$code"
}
trap cleanup EXIT

command -v docker >/dev/null
command -v curl >/dev/null
command -v 7z >/dev/null

mkdir -p "$LOCAL_DIR"
chmod 700 "$BACKUP_ROOT"

# Drop legacy local trees from older script versions (daily/weekly/monthly on disk).
rm -rf "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly"

echo "[backup] dumping ${DB_NAME} -> ${LOCAL_DUMP}"
REMOTE_TMP="/tmp/${DUMP_NAME}"
docker exec "$CONTAINER_NAME" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "$REMOTE_TMP"
docker cp "${CONTAINER_NAME}:${REMOTE_TMP}" "$LOCAL_DUMP"
docker exec "$CONTAINER_NAME" rm -f "$REMOTE_TMP"
REMOTE_TMP=""

test -s "$LOCAL_DUMP"
docker exec -i "$CONTAINER_NAME" pg_restore --list <"$LOCAL_DUMP" >/dev/null
chmod 600 "$LOCAL_DUMP"
echo "[backup] local ok $(du -h "$LOCAL_DUMP" | awk '{print $1}')"

encrypt_archive() {
  local src="$1"
  LOCAL_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/tgtv-pg-backup.XXXXXX.7z")"
  # -mhe=on: encrypt names; -mx=0: store only (-Fc already compressed)
  7z a -t7z -mhe=on -mx=0 -p"${BACKUP_ENCRYPT_PASS}" "$LOCAL_ARCHIVE" "$src" >/dev/null
  chmod 600 "$LOCAL_ARCHIVE"
}

ftp_base_url() {
  printf 'ftp://%s:%s' "$FTP_HOST" "$FTP_PORT"
}

upload_ftp() {
  local remote_subdir="$1"
  local remote_name="$2"

  local dest_dir="${FTP_DIR%/}/${remote_subdir}"
  local url
  url="$(ftp_base_url)${dest_dir}/${remote_name}"
  echo "[backup] FTP put -> ${FTP_HOST}${dest_dir}/${remote_name}"
  curl -sS --fail --ftp-create-dirs \
    --user "${FTP_USER}:${FTP_PASS}" \
    -T "$LOCAL_ARCHIVE" \
    "$url"
}

# Delete remote archives older than keep_days (age from backup_YYYYMMDD_* name).
prune_ftp_dir() {
  local remote_subdir="$1"
  local keep_days="$2"
  local dest_dir="${FTP_DIR%/}/${remote_subdir}"
  local list_url
  list_url="$(ftp_base_url)${dest_dir}/"

  local listing
  listing="$(curl -sS --list-only --user "${FTP_USER}:${FTP_PASS}" "$list_url" || true)"
  [[ -n "$listing" ]] || return 0

  local now_epoch cutoff name ymd file_epoch
  now_epoch="$(date +%s)"
  cutoff=$((keep_days * 86400))

  while IFS= read -r name; do
    [[ "$name" =~ ^backup_([0-9]{8})_[0-9]{6}\.dump\.7z$ ]] || continue
    ymd="${BASH_REMATCH[1]}"
    file_epoch="$(date -d "${ymd:0:4}-${ymd:4:2}-${ymd:6:2}" +%s 2>/dev/null || true)"
    [[ -n "$file_epoch" ]] || continue
    if (( now_epoch - file_epoch > cutoff )); then
      echo "[backup] FTP del -> ${FTP_HOST}${dest_dir}/${name}"
      curl -sS --user "${FTP_USER}:${FTP_PASS}" \
        -Q "DELE ${dest_dir}/${name}" \
        "$(ftp_base_url)/" >/dev/null || true
    fi
  done <<<"$listing"
}

if [[ -n "$FTP_HOST" ]]; then
  if [[ -z "$FTP_USER" || -z "$FTP_PASS" || -z "$BACKUP_ENCRYPT_PASS" ]]; then
    echo "[backup] FTP_HOST set but FTP_USER/FTP_PASS/BACKUP_ENCRYPT_PASS missing" >&2
    exit 1
  fi

  encrypt_archive "$LOCAL_DUMP"
  upload_ftp "daily" "$ARCHIVE_NAME"
  [[ "$DOW" == "7" ]] && upload_ftp "weekly" "$ARCHIVE_NAME"
  [[ "$DOM" == "01" ]] && upload_ftp "monthly" "$ARCHIVE_NAME"
  rm -f "$LOCAL_ARCHIVE"
  LOCAL_ARCHIVE=""

  prune_ftp_dir "daily" "$FTP_DAILY_KEEP"
  prune_ftp_dir "weekly" "$((FTP_WEEKLY_KEEP * 7))"
  prune_ftp_dir "monthly" "$((FTP_MONTHLY_KEEP * 30))"
  echo "[backup] FTP ok"
else
  echo "[backup] FTP_HOST empty - local only (keeping 1 dump)"
fi

# Keep only the dump we just made. If FTP was required and failed, we never get here.
find "$LOCAL_DIR" -type f -name 'backup_*.dump' ! -name "$DUMP_NAME" -delete
# Also clear any leftover archives in BACKUP_ROOT from older runs.
find "$BACKUP_ROOT" -type f \( -name 'backup_*.dump.7z' -o -name 'backup_*.sql' \) -delete 2>/dev/null || true

echo "[backup] done (local kept: $LOCAL_DUMP)"
# Restore from local:
#   docker cp "$LOCAL_DUMP" tgtv-tournament-postgres:/tmp/restore.dump
#   docker exec tgtv-tournament-postgres \
#     pg_restore -U tgtv -d tgtv_tournament --clean --if-exists --no-owner --role=tgtv \
#     /tmp/restore.dump
# Restore from FTP:
#   curl -u USER:PASS -o /tmp/b.dump.7z ftp://HOST/DIR/daily/backup_....dump.7z
#   7z x -pPASS /tmp/b.dump.7z -o/tmp
#   then pg_restore as above
