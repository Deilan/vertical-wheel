#!/usr/bin/env bash
set -u

RUNTIME_DIR=".qa-runtime"
VITE_PID_FILE="$RUNTIME_DIR/vite.pid"
CLOUDFLARED_PID_FILE="$RUNTIME_DIR/cloudflared.pid"

stop_from_pid_file() {
  local label="$1"
  local pid_file="$2"

  if [ ! -f "$pid_file" ]; then
    echo "$label is not running: no PID file."
    return
  fi

  local pid
  pid="$(cat "$pid_file")"

  if [ -z "$pid" ]; then
    rm -f "$pid_file"
    echo "$label had an empty PID file; removed it."
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "Stopped $label with PID $pid."
  else
    echo "$label PID $pid was not running."
  fi

  rm -f "$pid_file"
}

stop_from_pid_file "Vite" "$VITE_PID_FILE"
stop_from_pid_file "cloudflared" "$CLOUDFLARED_PID_FILE"

echo "Logs were kept in $RUNTIME_DIR/."
