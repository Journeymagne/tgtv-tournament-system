#!/usr/bin/env bash
# Start one isolated ktcalc dev server for verification.
# Records the npm pid in the artifacts dir and waits until the app answers HTTP.
set -euo pipefail

source "$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
mkdir -p "$ARTIFACTS"

if [[ -f "$PID_FILE" ]]; then
  old=$(cat "$PID_FILE" || true)
  if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
    echo "verify-ktcalc: this artifacts dir already has a live dev server (pid $old)." >&2
    echo "Run cleanup.sh, or use a second VERIFY_PORT and VERIFY_ARTIFACTS. Refusing to double-start." >&2
    exit 1
  fi
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "verify-ktcalc: port $PORT is already in use. Refusing to attach to a shared instance." >&2
    echo "Set VERIFY_PORT to a free port (and VERIFY_ARTIFACTS to a separate directory for a second run)." >&2
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
    exit 1
  fi
fi

if [[ ! -d "$REPO_ROOT/node_modules/react-scripts" ]]; then
  echo "verify-ktcalc: dependencies are not installed. From the repo root run: npm ci" >&2
  exit 1
fi

cd "$REPO_ROOT"
# BROWSER=none keeps Create React App from opening a window. PORT isolates this
# run from a developer's normal `npm start` on 3000. prestart copies rules/*.md
# into public/rules/ (gitignored) before webpack starts.
nohup env BROWSER=none PORT="$PORT" npm start >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
echo "$PORT" >"$PORT_FILE"
disown || true

echo "verify-ktcalc: dev server pid $(cat "$PID_FILE") on http://127.0.0.1:$PORT/"
echo "verify-ktcalc: log $LOG_FILE"

deadline=$((SECONDS + 180))
while (( SECONDS < deadline )); do
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "verify-ktcalc: dev server exited before it was ready. Last log lines:" >&2
    tail -n 40 "$LOG_FILE" >&2 || true
    exit 1
  fi
  if grep -Eq "Compiled successfully|Compiled with warnings" "$LOG_FILE"; then
    if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/" | grep -q 'id="root"'; then
      echo "verify-ktcalc: ready at http://127.0.0.1:$PORT/"
      exit 0
    fi
  fi
  sleep 1
done

echo "verify-ktcalc: timed out waiting for a compile line and HTTP on port $PORT" >&2
tail -n 40 "$LOG_FILE" >&2 || true
exit 1
