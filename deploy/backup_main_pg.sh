#!/usr/bin/env bash
# Daily Postgres backup: keep 1 local dump; full GFS retention on FTP (encrypted).
# Secrets via env only - never commit.
#
# Install on the server, e.g.:
#   install -m 700 deploy/backup_main_pg.sh /app/scripts/backup_main_pg.sh
# Env file (chmod 600). Auto-loaded from BACKUP_ENV_FILE (default below).
#   /app/backup-ftp.env
#
# Required for FTP upload (exact names):
#   FTP_HOST=ftp.example.com
#   FTP_USER=...
#   FTP_PASS=...
#   BACKUP_ENCRYPT_PASS=...
# Optional:
#   FTP_DIR=backups          # path INSIDE the FTP account (NOT a VPS path like /app/...)
#                            # empty = FTP login home; script uses <FTP_DIR>/daily|weekly|monthly
#   FTP_PORT=21
#   FTP_DAILY_KEEP=14 FTP_WEEKLY_KEEP=8 FTP_MONTHLY_KEEP=6
#   CONTAINER_NAME DB_USER DB_NAME BACKUP_ROOT BACKUP_ENV_FILE
#
# Needs: docker, curl, 7z (p7zip-full).
# Note: plain "docker exec" (no -t/-T). -T is only for "docker compose exec".
set -Eeuo pipefail
umask 077

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/app/backup-ftp.env}"
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  # strip CR so Windows-edited env files still work
  set -a
  # shellcheck disable=SC1090
  source <(tr -d '\r' <"$BACKUP_ENV_FILE")
  set +a
  echo "[backup] loaded env: $BACKUP_ENV_FILE"
else
  echo "[backup] env file not found: $BACKUP_ENV_FILE (local-only mode)"
fi

# Aliases from early drafts / common mistakes
FTP_HOST="${FTP_HOST:-${FTP_SERVER:-${FTP_HOSTNAME:-}}}"
FTP_USER="${FTP_USER:-${FTP_LOGIN:-${FTP_USERNAME:-}}}"
FTP_PASS="${FTP_PASS:-${FTP_PASSWORD:-}}"
if [[ -z "${FTP_HOST:-}" && -n "${FTP_URL:-}" ]]; then
  _ftp_rest="${FTP_URL#ftp://}"
  _ftp_rest="${_ftp_rest#ftps://}"
  _ftp_rest="${_ftp_rest#FTPS://}"
  _ftp_rest="${_ftp_rest#FTP://}"
  _ftp_authority="${_ftp_rest%%/*}"
  _ftp_authority="${_ftp_authority#*@}"   # drop user:pass@ if present
  FTP_HOST="${_ftp_authority%%:*}"
  _ftp_port_part="${_ftp_authority#"$FTP_HOST"}"
  if [[ "$_ftp_port_part" == :* ]]; then
    FTP_PORT="${FTP_PORT:-${_ftp_port_part#:}}"
  fi
  _ftp_path="${_ftp_rest#*/}"
  if [[ "$_ftp_rest" == */* && -n "$_ftp_path" ]]; then
    FTP_DIR="${FTP_DIR:-/${_ftp_path}}"
  fi
  unset _ftp_rest _ftp_authority _ftp_port_part _ftp_path
fi

CONTAINER_NAME="${CONTAINER_NAME:-tgtv-tournament-postgres}"
DB_USER="${DB_USER:-tgtv}"
DB_NAME="${DB_NAME:-tgtv_tournament}"

BACKUP_ROOT="${BACKUP_ROOT:-/app/pg_backups/prod}"
LOCAL_DIR="$BACKUP_ROOT/latest"

FTP_HOST="${FTP_HOST:-}"
FTP_USER="${FTP_USER:-}"
FTP_PASS="${FTP_PASS:-}"
FTP_PORT="${FTP_PORT:-21}"
# Empty = upload under the FTP account home (daily/weekly/monthly).
FTP_DIR="${FTP_DIR:-}"
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
  if [[ -n "$LOCAL_ARCHIVE" ]]; then
    rm -rf -- "$(dirname -- "$LOCAL_ARCHIVE")" 2>/dev/null || true
  fi
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
  local src_dir src_base tmp_dir
  src_dir="$(dirname -- "$src")"
  src_base="$(basename -- "$src")"
  # mktemp must not pre-create the .7z path: 7z refuses to open an empty file as archive.
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/tgtv-pg-backup.XXXXXX")"
  LOCAL_ARCHIVE="${tmp_dir}/${ARCHIVE_NAME}"
  # -mhe=on: encrypt names; -mx=0: store only (-Fc already compressed)
  # Add by basename so the archive does not embed /app/pg_backups/...
  (cd -- "$src_dir" && 7z a -t7z -mhe=on -mx=0 -p"${BACKUP_ENCRYPT_PASS}" "$LOCAL_ARCHIVE" "$src_base") >/dev/null
  chmod 600 "$LOCAL_ARCHIVE"
}

ftp_base_url() {
  printf 'ftp://%s:%s' "$FTP_HOST" "$FTP_PORT"
}

# Path relative to FTP login home (no leading slash). Example: daily, backups/daily
ftp_rel_dir() {
  local subdir="$1"
  local base="${FTP_DIR#/}"
  base="${base%/}"
  if [[ -z "$base" ]]; then
    printf '%s' "$subdir"
  else
    printf '%s/%s' "$base" "$subdir"
  fi
}

upload_ftp() {
  local remote_subdir="$1"
  local remote_name="$2"
  local dest_dir url
  dest_dir="$(ftp_rel_dir "$remote_subdir")"
  url="$(ftp_base_url)/${dest_dir}/${remote_name}"

  echo "[backup] FTP put -> ${FTP_HOST}/${dest_dir}/${remote_name}"
  if ! curl -sS --fail --ftp-create-dirs \
      --user "${FTP_USER}:${FTP_PASS}" \
      -T "$LOCAL_ARCHIVE" \
      "$url"; then
    echo "[backup] FTP upload failed. Check FTP_DIR (folder inside FTP account, not VPS /app/...)." >&2
    echo "[backup] Current FTP_DIR='${FTP_DIR:-<empty=FTP home>}' -> remote path '/${dest_dir}/'" >&2
    exit 1
  fi
}

# Delete remote archives older than keep_days (age from backup_YYYYMMDD_* name).
prune_ftp_dir() {
  local remote_subdir="$1"
  local keep_days="$2"
  local dest_dir list_url listing
  dest_dir="$(ftp_rel_dir "$remote_subdir")"
  list_url="$(ftp_base_url)/${dest_dir}/"

  listing="$(curl -sS --list-only --user "${FTP_USER}:${FTP_PASS}" "$list_url" 2>/dev/null || true)"
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
      echo "[backup] FTP del -> ${FTP_HOST}/${dest_dir}/${name}"
      curl -sS --user "${FTP_USER}:${FTP_PASS}" \
        -Q "DELE ${dest_dir}/${name}" \
        "$(ftp_base_url)/" >/dev/null 2>&1 || true
    fi
  done <<<"$listing"
}

if [[ -n "$FTP_HOST" ]]; then
  if [[ -z "$FTP_USER" || -z "$FTP_PASS" || -z "$BACKUP_ENCRYPT_PASS" ]]; then
    echo "[backup] FTP_HOST set but FTP_USER/FTP_PASS/BACKUP_ENCRYPT_PASS missing" >&2
    exit 1
  fi
  # Common misconfig: paste VPS path into FTP_DIR
  if [[ "${FTP_DIR}" == /app/* || "${FTP_DIR}" == app/* ]]; then
    echo "[backup] FTP_DIR='${FTP_DIR}' looks like a VPS path, not an FTP folder." >&2
    echo "[backup] Fix /app/backup-ftp.env: use e.g. FTP_DIR= or FTP_DIR=backups" >&2
    exit 1
  fi

  encrypt_archive "$LOCAL_DUMP"
  upload_ftp "daily" "$ARCHIVE_NAME"
  if [[ "$DOW" == "7" ]]; then upload_ftp "weekly" "$ARCHIVE_NAME"; fi
  if [[ "$DOM" == "01" ]]; then upload_ftp "monthly" "$ARCHIVE_NAME"; fi
  rm -rf -- "$(dirname -- "$LOCAL_ARCHIVE")"
  LOCAL_ARCHIVE=""

  prune_ftp_dir "daily" "$FTP_DAILY_KEEP"
  prune_ftp_dir "weekly" "$((FTP_WEEKLY_KEEP * 7))"
  prune_ftp_dir "monthly" "$((FTP_MONTHLY_KEEP * 30))"
  echo "[backup] FTP ok"
else
  echo "[backup] FTP_HOST empty - local only (keeping 1 dump)"
  echo "[backup] expected keys: FTP_HOST FTP_USER FTP_PASS BACKUP_ENCRYPT_PASS"
  if [[ -f "$BACKUP_ENV_FILE" ]]; then
    echo "[backup] keys found in ${BACKUP_ENV_FILE}:"
    tr -d '\r' <"$BACKUP_ENV_FILE" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | cut -d= -f1 || true
  fi
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
