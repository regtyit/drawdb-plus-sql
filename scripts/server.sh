#!/usr/bin/env bash
# drawdb-plus-sql launcher
#
#   ./scripts/server.sh private  — everything on localhost; the only way in is the web page on this machine
#   ./scripts/server.sh public   — web app + API reachable from the network, with a shared token;
#                                  PostgreSQL itself must stay loopback-only
#   ./scripts/server.sh stop     — stop everything
#   ./scripts/server.sh status   — what is running, bound where
#
# In public mode the script generates (or reuses) POSTGRES_API_TOKEN and pairs it
# into public/config.js so browsers get it automatically. public/config.js is a
# runtime file and is git-ignored — never commit it.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
LOG_DIR="$REPO_DIR/logs"
API_PORT="${POSTGRES_API_PORT:-5001}"
WEB_PORT=3148

MODE="${1:-}"

mkdir -p "$LOG_DIR"

kill_port() {
  local port=$1 pids p
  pids=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  sleep 1
  pids=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for p in $pids; do kill -9 "$p" 2>/dev/null || true; done
}

current_token() {
  if [ -f "$SERVER_DIR/.env" ]; then
    grep -m1 '^POSTGRES_API_TOKEN=' "$SERVER_DIR/.env" | cut -d= -f2- || true
  fi
}

gen_token() {
  openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

lan_ip() {
  ip route get 1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}'
}

write_server_env() {
  local host=$1 cors=$2 token=$3
  cat > "$SERVER_DIR/.env" <<EOF
POSTGRES_API_PORT=$API_PORT
POSTGRES_API_HOST=$host
POSTGRES_API_CORS_ORIGIN=$cors
POSTGRES_API_TOKEN=$token
EOF
}

write_runtime_config() {
  local token=$1
  cat > "$REPO_DIR/public/config.js" <<EOF
// Runtime deployment config for drawdb-plus-sql.
// Browsers always target the machine serving the page, no hardcoded IPs.
window.__DRAWDB_CONFIG__ = {
  postgresApiUrl: \`http://\${location.hostname}:$API_PORT\`,
  postgresApiToken: "$token",
};
EOF
}

start_api() {
  echo "Starting companion API on $API_PORT ..."
  (cd "$SERVER_DIR" && nohup node src/index.js > "$LOG_DIR/server.log" 2>&1 &
    echo $! > "$LOG_DIR/server.pid")
}

start_web() {
  local host_flag="$1"
  echo "Starting web app on $WEB_PORT $host_flag..."
  (cd "$REPO_DIR" && nohup npx vite $host_flag > "$LOG_DIR/web.log" 2>&1 &
    echo $! > "$LOG_DIR/web.pid")
}

wait_http() {
  local url=$1 tries=${2:-30} i
  for (( i = 0; i < tries; i++ )); do
    if curl -sf "$url" > /dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  return 1
}

check_postgres_isolation() {
  # PostgreSQL must only listen on loopback. Anything else gets flagged loudly.
  local rows nonlocal
  rows=$(ss -ltn 2>/dev/null | awk '$4 ~ /:5432$/ {print $4}' || true)
  if [ -n "$rows" ]; then
    nonlocal=$(echo "$rows" | grep -vE "^(127\.0\.0\.1|\[::1\]):" || true)
    if [ -n "$nonlocal" ]; then
      echo ""
      echo "WARNING: PostgreSQL is listening on non-loopback address(es): $nonlocal"
      echo "         PostgreSQL must stay private. To fix, set listen_addresses = 'localhost'"
      echo "         in postgresql.conf and restart it, or shield port 5432 with a firewall."
    else
      echo "PostgreSQL is loopback-only (127.0.0.1/[::1]) — it is only reachable through the API. OK."
    fi
  else
    echo "Did not find a listener on port 5432 — configure it in the web app when you connect."
  fi
}

case "$MODE" in
  private)
    echo "Mode: PRIVATE (localhost only)"
    kill_port "$API_PORT"
    kill_port "$WEB_PORT"
    TOKEN=$(current_token)
    write_server_env "127.0.0.1" "http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT" "$TOKEN"
    write_runtime_config "$TOKEN"
    start_api
    start_web "--host 127.0.0.1"
    if wait_http "http://127.0.0.1:$API_PORT/health"; then
      echo "API ready:   http://127.0.0.1:$API_PORT"
    else
      echo "API failed to start — see $LOG_DIR/server.log"
      exit 1
    fi
    if wait_http "http://127.0.0.1:$WEB_PORT/"; then
      echo "Web ready:   http://localhost:$WEB_PORT"
    else
      echo "Web failed to start — see $LOG_DIR/web.log"
      exit 1
    fi
    echo "This machine only. Other devices cannot reach it."
    ;;
  public)
    echo "Mode: PUBLIC (network access, token protected)"
    kill_port "$API_PORT"
    kill_port "$WEB_PORT"
    TOKEN=$(current_token)
    if [ -z "${TOKEN// }" ]; then
      TOKEN=$(gen_token)
      echo "Generated a new POSTGRES_API_TOKEN into server/.env and public/config.js."
    fi
    write_server_env "0.0.0.0" "*" "$TOKEN"
    write_runtime_config "$TOKEN"
    start_api
    start_web "--host"
    if wait_http "http://127.0.0.1:$API_PORT/health"; then
      echo "API ready:   http://$(lan_ip):$API_PORT (also http://127.0.0.1:$API_PORT on this machine)"
    else
      echo "API failed to start — see $LOG_DIR/server.log"
      exit 1
    fi
    if wait_http "http://127.0.0.1:$WEB_PORT/"; then
      echo "Web ready:   http://$(lan_ip):$WEB_PORT"
    else
      echo "Web failed to start — see $LOG_DIR/web.log"
      exit 1
    fi
    check_postgres_isolation
    echo ""
    echo "Security notes:"
    echo "  - Requests need the token paired in public/config.js (browsers pick it up automatically)."
    echo "  - Do not commit public/config.js or server/.env — both are git-ignored runtime files."
    ;;
  stop)
    echo "Stopping drawdb-plus-sql ..."
    kill_port "$API_PORT"
    kill_port "$WEB_PORT"
    echo "Stopped."
    ;;
  status)
    echo "== listeners =="
    ss -ltn 2>/dev/null | grep -E ":(($WEB_PORT|$API_PORT))\b" || echo "  nothing running"
    echo "== API health =="
    curl -s "http://127.0.0.1:$API_PORT/health" || echo "  API not responding"
    echo ""
    check_postgres_isolation
    ;;
  *)
    echo "Usage: $0 {private|public|stop|status}"
    exit 2
    ;;
esac
