#!/usr/bin/env bash
# Read-only check: is the dev server this skill launched worth driving?
set -euo pipefail

source "$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

fail() {
  echo "verify-ktcalc doctor: FAIL — $*" >&2
  exit 1
}

[[ -f "$PID_FILE" ]] || fail "no pid file at $PID_FILE. Run launch.sh first."
pid=$(tr -d '[:space:]' <"$PID_FILE")
[[ -n "$pid" ]] || fail "pid file is empty"
kill -0 "$pid" 2>/dev/null || fail "recorded pid $pid is not running"
echo "verify-ktcalc doctor: OK — dev server pid $pid is alive"

[[ -f "$PORT_FILE" ]] || fail "no port file at $PORT_FILE"
port=$(tr -d '[:space:]' <"$PORT_FILE")
if [[ "$port" != "$PORT" ]]; then
  fail "VERIFY_PORT=$PORT but this artifacts dir was launched on port $port. Unset VERIFY_PORT or point VERIFY_ARTIFACTS at the matching run."
fi

body=$(curl -fsS --max-time 5 "http://127.0.0.1:$port/") || fail "http://127.0.0.1:$port/ did not return a body"
printf '%s' "$body" | grep -q 'id="root"' || fail "response is missing #root (not the ktcalc shell)"
printf '%s' "$body" | grep -q 'Kill Team 2024 Calculator' || fail "response is not the ktcalc index"
echo "verify-ktcalc doctor: OK — http://127.0.0.1:$port/ is serving the ktcalc shell"

if command -v lsof >/dev/null 2>&1; then
  listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -n "$listeners" ]] || fail "nothing is listening on port $port"
  owned=0
  for lp in $listeners; do
    if is_in_pid_tree "$lp" "$pid"; then
      owned=1
    fi
  done
  if [[ "$owned" -ne 1 ]]; then
    fail "port $port listeners ($listeners) are not the recorded pid $pid or its children. Refusing to drive a shared instance."
  fi
  echo "verify-ktcalc doctor: OK — port $port is owned by pid $pid"
else
  echo "verify-ktcalc doctor: WARN — lsof is not installed, so listener ownership was not checked. Pid and HTTP checks passed."
fi

if [[ -f "$LOG_FILE" ]] && grep -Eq "Compiled successfully|Compiled with warnings" "$LOG_FILE"; then
  echo "verify-ktcalc doctor: OK — log reports a completed compile"
else
  fail "dev server log has no 'Compiled successfully' or 'Compiled with warnings' line ($LOG_FILE)"
fi

echo "verify-ktcalc doctor: instance is worth driving"
