#!/bin/bash

set -euo pipefail

echo "Starting Local PocketBase Development Environment"
echo "===================================================="

detect_lan_host() {
  if command -v ipconfig > /dev/null 2>&1; then
    ipconfig getifaddr en0 2> /dev/null || ipconfig getifaddr en1 2> /dev/null || true
    return
  fi

  if command -v hostname > /dev/null 2>&1; then
    hostname -I 2> /dev/null | awk '{print $1}'
  fi
}

pb_http_host=${LOCAL_POCKETBASE_HTTP_HOST:-localhost}
pb_port=${LOCAL_POCKETBASE_PORT:-8090}
frontend_port=${LOCAL_FRONTEND_PORT:-3000}
lan_host=${LOCAL_LAN_HOST:-}

if [ -z "$lan_host" ] && [ "$pb_http_host" = "0.0.0.0" ]; then
  lan_host=$(detect_lan_host)
fi

default_origins=(
  "http://localhost:3001"
  "http://localhost:3000"
  "http://localhost:5173"
  "http://127.0.0.1:3000"
  "http://127.0.0.1:5173"
)

if [ -n "$lan_host" ]; then
  default_origins+=("http://${lan_host}:${frontend_port}")
fi

allowed_origins=${LOCAL_POCKETBASE_ALLOWED_ORIGINS:-$(IFS=,; echo "${default_origins[*]}")}
display_api_url="http://localhost:${pb_port}"
display_admin_url="${display_api_url}/_/"

if [ -n "$lan_host" ]; then
  display_api_url="http://${lan_host}:${pb_port}"
  display_admin_url="${display_api_url}/_/"
fi

mkdir -p local-pb-db
mkdir -p local-pb-db/pb_data
mkdir -p local-pb-db/pb_hooks

if [ ! -x local-pb-db/pocketbase ]; then
  echo "Missing executable PocketBase binary at local-pb-db/pocketbase"
  echo "See docs/pocketbase/local-development.md for setup instructions."
  exit 1
fi

node scripts/sync-local-pocketbase-hooks.mjs

echo "Starting PocketBase locally with CORS enabled..."
echo "   Bind Address: ${pb_http_host}:${pb_port}"
echo "   Admin Panel: ${display_admin_url}"
echo "   API Base URL: ${display_api_url}"
echo "   Database Location: ./local-pb-db/pb_data"
echo "   Hooks Location: ./local-pb-db/pb_hooks"
echo "   Allowed Origins: ${allowed_origins}"
echo ""

cd local-pb-db && ./pocketbase serve \
  --http="${pb_http_host}:${pb_port}" \
  --origins="${allowed_origins}" \
  "$@"
