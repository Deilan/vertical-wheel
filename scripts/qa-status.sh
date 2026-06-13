#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR=".qa-runtime"
VITE_PID_FILE="$RUNTIME_DIR/vite.pid"
CLOUDFLARED_PID_FILE="$RUNTIME_DIR/cloudflared.pid"
CLOUDFLARED_LOG="$RUNTIME_DIR/cloudflared.log"
LOCAL_URL="http://localhost:5173/?debug=1"

is_running() {
  local pid_file="$1"

  if [ ! -f "$pid_file" ]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file")"

  if [ -z "$pid" ]; then
    return 1
  fi

  kill -0 "$pid" 2>/dev/null
}

show_status() {
  local label="$1"
  local pid_file="$2"

  if is_running "$pid_file"; then
    echo "$label: running (PID $(cat "$pid_file"))"
  else
    echo "$label: not running"
  fi
}

cloudflare_url() {
  if [ ! -f "$CLOUDFLARED_LOG" ]; then
    return 1
  fi

  grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | tail -n 1
}

show_status "Vite" "$VITE_PID_FILE"
show_status "cloudflared" "$CLOUDFLARED_PID_FILE"
echo "Local URL: $LOCAL_URL"

url="$(cloudflare_url || true)"
if [ -n "$url" ]; then
  echo "Cloudflare URL: $url"
else
  echo "Cloudflare URL: not found"
fi
