#!/usr/bin/env bash
# STRIKE PROTOCOL — local app server.
#
# Serves the game on http://127.0.0.1:3000/ (repo-root ./index.html is the
# playable entrypoint; all game code/assets live self-contained under project/).
#
# Host configuration notes:
# - Binds 127.0.0.1 explicitly; public access is provided by a cloudflared
#   quick tunnel pointed at http://127.0.0.1:3000 (see .opencode-web/).
# - Python's http.server performs no Host-header validation, so no
#   allowed-host configuration is required for tunnel/proxy hostnames.
# - If port 3000 is already in use by a stale server, this script restarts it.
#
# Usage:
#   ./serve.sh                       # foreground (Ctrl-C to stop)
#   tmux new-session -d -s app-server './project/serve.sh'   # persistent
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port $PORT in use — restarting stale server..."
  pkill -f "http.server $PORT" || true
  sleep 1
fi
cd "$ROOT"
echo "Serving $ROOT on http://127.0.0.1:$PORT/ (./index.html -> project/ game)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
