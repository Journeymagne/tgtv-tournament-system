#!/usr/bin/env bash
# Stop only the processes this skill started. Leaves evidence files in place.
set -euo pipefail

source "$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

stop_recorded() {
  local file="$1"
  local label="$2"
  if [[ ! -f "$file" ]]; then
    echo "verify-ktcalc cleanup: no $label pid file"
    return 0
  fi
  local pid
  pid=$(tr -d '[:space:]' <"$file" || true)
  if [[ -z "$pid" ]]; then
    rm -f "$file"
    echo "verify-ktcalc cleanup: empty $label pid file removed"
    return 0
  fi
  if kill -0 "$pid" 2>/dev/null; then
    if is_windows; then
      kill_windows_tree "$pid"
    fi
    # Chrome is started detached, so its pid is a process-group leader.
    # kill the group first; fall back to the recorded tree. Never pkill by name.
    kill -- -"$pid" 2>/dev/null || true
    kill_tree "$pid"
    local i
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "verify-ktcalc cleanup: stopped $label pid $pid"
  else
    echo "verify-ktcalc cleanup: $label pid $pid was not running"
  fi
  rm -f "$file"
}

stop_recorded "$CHROME_PID_FILE" "chrome"
stop_recorded "$PID_FILE" "dev server"
rm -f "$PORT_FILE"

echo "verify-ktcalc cleanup: evidence kept in $ARTIFACTS"
