#!/bin/bash

set -euo pipefail

detect_lan_host() {
  if command -v ipconfig > /dev/null 2>&1; then
    ipconfig getifaddr en0 2> /dev/null || ipconfig getifaddr en1 2> /dev/null || true
    return
  fi

  if command -v hostname > /dev/null 2>&1; then
    hostname -I 2> /dev/null | awk '{print $1}'
  fi
}

lan_host=${LOCAL_LAN_HOST:-$(detect_lan_host)}
frontend_port=${LOCAL_FRONTEND_PORT:-3000}
pb_port=${LOCAL_POCKETBASE_PORT:-8090}

if [ -z "$lan_host" ]; then
  echo "Could not detect a LAN IP address."
  echo "Set LOCAL_LAN_HOST manually, for example:"
  echo "  LOCAL_LAN_HOST=192.168.1.50 pnpm dev:lan"
  exit 1
fi

export VITE_POCKETBASE_URL=${VITE_POCKETBASE_URL:-"http://${lan_host}:${pb_port}"}

echo "Starting Vite for LAN access..."
echo "   App URL: http://${lan_host}:${frontend_port}"
echo "   PocketBase URL: ${VITE_POCKETBASE_URL}"
echo ""

pnpm dev -- --host 0.0.0.0 --port "${frontend_port}" --strictPort "$@"
