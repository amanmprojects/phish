#!/usr/bin/env bash
# Run CampusGuard UI + API on 0.0.0.0 so anyone on the network can open it.
set -euo pipefail

cd "$(dirname "$0")"

# Load .env if present (TAVILY_API_KEY, etc.)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export WEB_PORT="${WEB_PORT:-5173}"
export CORS_OPEN="${CORS_OPEN:-1}"

# Discover non-loopback IPv4 addresses for a friendly printout
lan_ips() {
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -v '^127\.' || true
  fi
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true
  fi
}

mapfile -t IPS < <(lan_ips | awk 'NF && !seen[$0]++')

echo "=============================================="
echo "  CampusGuard — public (0.0.0.0)"
echo "=============================================="
echo "  API:  http://0.0.0.0:${PORT}"
echo "  UI:   http://0.0.0.0:${WEB_PORT}"
if ((${#IPS[@]} > 0)); then
  echo ""
  echo "  Open from other devices:"
  for ip in "${IPS[@]}"; do
    echo "    http://${ip}:${WEB_PORT}"
  done
fi
echo "=============================================="
echo ""

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies…"
  npm install
fi

# Ensure Tavily extension is present for deep investigate
if [[ ! -f .pi/npm/node_modules/@tavily/pi-extension/index.ts ]]; then
  echo "Installing Tavily Pi extension (local)…"
  if command -v pi >/dev/null 2>&1; then
    pi install -l npm:@tavily/pi-extension || true
  else
    echo "Warning: 'pi' not found — deep web tools may be unavailable."
  fi
fi

exec npm run dev
