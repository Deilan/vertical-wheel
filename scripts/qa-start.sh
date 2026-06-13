#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR=".qa-runtime"
VITE_PID_FILE="$RUNTIME_DIR/vite.pid"
CLOUDFLARED_PID_FILE="$RUNTIME_DIR/cloudflared.pid"
VITE_LOG="$RUNTIME_DIR/vite.log"
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

cloudflare_url() {
  if [ ! -f "$CLOUDFLARED_LOG" ]; then
    return 1
  fi

  grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | tail -n 1
}

mkdir -p "$RUNTIME_DIR"

if ! is_running "$CLOUDFLARED_PID_FILE" && ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed or is not in PATH."
  echo "Install cloudflared, then run npm run qa:start again."
  echo "Local Vite was not started by this command."
  exit 1
fi

if is_running "$VITE_PID_FILE"; then
  echo "Vite already running with PID $(cat "$VITE_PID_FILE")."
else
  rm -f "$VITE_PID_FILE"
  : > "$VITE_LOG"
  nohup npm run dev:host >> "$VITE_LOG" 2>&1 &
  echo "$!" > "$VITE_PID_FILE"
  echo "Started Vite with PID $(cat "$VITE_PID_FILE")."
fi

if is_running "$CLOUDFLARED_PID_FILE"; then
  echo "cloudflared already running with PID $(cat "$CLOUDFLARED_PID_FILE")."
else
  rm -f "$CLOUDFLARED_PID_FILE"
  : > "$CLOUDFLARED_LOG"
  nohup cloudflared tunnel --protocol http2 --url http://localhost:5173 >> "$CLOUDFLARED_LOG" 2>&1 &
  echo "$!" > "$CLOUDFLARED_PID_FILE"
  echo "Started cloudflared with PID $(cat "$CLOUDFLARED_PID_FILE")."
fi

echo "Local URL: $LOCAL_URL"

for _ in $(seq 1 30); do
  url="$(cloudflare_url || true)"

  if [ -n "$url" ]; then
    echo "Cloudflare URL: $url"
    exit 0
  fi

  sleep 1
done

echo "Cloudflare URL not found yet. Run npm run qa:logs or npm run qa:status."
