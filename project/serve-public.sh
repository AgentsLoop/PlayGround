#!/usr/bin/env bash
# STRIKE PROTOCOL — public runtime startup.
#
# Ensures: (1) the app server runs in tmux session `app-server` on port 3000
# serving the repo root (./index.html -> self-contained game under project/);
# (2) a cloudflared quick tunnel fronts http://127.0.0.1:3000 with a DNS-
# resolving https://*.trycloudflare.com URL recorded for verifiers.
#
# Background: quick-tunnel hostnames occasionally never register in DNS
# (curl => "Could not resolve host") even though cloudflared stays connected.
# This script detects that case and rotates to a fresh tunnel until the
# public URL both resolves and returns HTTP 200 for /index.html.
#
# Usage:
#   ./project/serve-public.sh            # start/verify everything, print URL
#   URL file: .opencode-web/app-public-url.txt
#   Tunnel log: .opencode-web/app-public-tunnel.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/.opencode-web"
PORT="${PORT:-3000}"
LOG="$WEB/app-public-tunnel.log"
PIDF="$WEB/app-public-tunnel.pid"
URLF="$WEB/app-public-url.txt"
cd "$ROOT"

# --- 1. app server in tmux ---
if ! tmux has-session -t app-server 2>/dev/null; then
  echo "Starting tmux session app-server..."
  tmux new-session -d -s app-server -c "$ROOT" "python3 -u -m http.server $PORT --bind 127.0.0.1"
  sleep 6
else
  echo "tmux session app-server already running."
fi
if ! python3 -c "import socket;s=socket.socket();s.settimeout(5);s.connect(('127.0.0.1',$PORT))" 2>/dev/null; then
  echo "ERROR: nothing listening on 127.0.0.1:$PORT" >&2
  tmux capture-pane -p -t app-server 2>&1 | head -n 5 >&2 || true
  exit 1
fi
echo "App server OK on 127.0.0.1:$PORT."

# --- 2. public tunnel with working DNS ---
# Patient check: fresh quick-tunnel hostnames can need 60-120s for DNS
# propagation, and the first edge hits can be slow. Retry before judging.
url_works() {
  local u="$1" tries="${2:-2}" i code
  for i in $(seq 1 "$tries"); do
    if nslookup "$u" >/dev/null 2>&1; then
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$u/index.html" || true)"
      [ "$code" = "200" ] && return 0
      echo "  check $i/$tries: DNS ok, HTTP=${code:-<fail>} — waiting..."
    else
      echo "  check $i/$tries: DNS not resolving yet — waiting..."
    fi
    sleep 12
  done
  return 1
}
current_url() { grep -o 'https://[a-z0-9.-]*trycloudflare.com' "$LOG" 2>/dev/null | sort -u | tail -n 1; }
start_tunnel() {
  echo "Starting fresh cloudflared quick tunnel for :$PORT..."
  pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$PORT" 2>/dev/null || true
  sleep 2
  rm -f "$LOG"
  nohup "$WEB/cloudflared" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$LOG" 2>&1 &
  echo $! > "$PIDF"
  for _ in $(seq 1 18); do
    sleep 5
    U="$(current_url || true)"
    [ -n "$U" ] && break
  done
  echo "Tunnel URL: ${U:-<none yet>}"
}
U="$(current_url || true)"
if [ -z "${U:-}" ] || ! url_works "$U" 2; then
  echo "No working public URL (got '${U:-<none>}') — rotating tunnel (max 2 attempts)."
  for _ in 1 2; do
    start_tunnel
    U="$(current_url || true)"
    if [ -n "$U" ] && url_works "$U" 10; then break; fi
    echo "URL $U not working yet, retrying..."
  done
fi
if [ -z "${U:-}" ] || ! url_works "$U"; then
  echo "ERROR: could not establish a working public URL after retries." >&2
  tail -n 5 "$LOG" >&2 || true
  exit 1
fi
echo "$U" > "$URLF"
echo "PUBLIC URL: $U"
echo "Verified: DNS resolves + /index.html returns 200. URL recorded in $URLF"
