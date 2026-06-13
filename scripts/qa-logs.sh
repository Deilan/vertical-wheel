#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR=".qa-runtime"
VITE_LOG="$RUNTIME_DIR/vite.log"
CLOUDFLARED_LOG="$RUNTIME_DIR/cloudflared.log"

cloudflare_url() {
  if [ ! -f "$CLOUDFLARED_LOG" ]; then
    return 1
  fi

  grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | tail -n 1
}

echo "== Vite log: last 80 lines =="
if [ -f "$VITE_LOG" ]; then
  tail -n 80 "$VITE_LOG"
else
  echo "No Vite log found at $VITE_LOG."
fi

echo
echo "== cloudflared log: last 120 lines =="
if [ -f "$CLOUDFLARED_LOG" ]; then
  tail -n 120 "$CLOUDFLARED_LOG"
else
  echo "No cloudflared log found at $CLOUDFLARED_LOG."
fi

echo
url="$(cloudflare_url || true)"
if [ -n "$url" ]; then
  echo "Cloudflare URL: $url"
else
  echo "Cloudflare URL: not found"
fi
