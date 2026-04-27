#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.omx/state"
LOG_DIR="$ROOT_DIR/.omx/logs"
PID_FILE="$STATE_DIR/dev-supervisor.pid"
LOG_FILE="$LOG_DIR/dev-supervisor.log"
STOP_FILE="$STATE_DIR/dev-supervisor.stop"
TSX_BIN="$ROOT_DIR/node_modules/.bin/tsx"
export PORT="${RETROBUILDER_PORT:-7777}"
HOST="127.0.0.1"

mkdir -p "$STATE_DIR" "$LOG_DIR"

is_pid_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

health_check() {
  curl -sf "http://$HOST:$PORT/api/health" >/dev/null 2>&1
}

port_in_use() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_port_release() {
  local attempts="${1:-40}"
  for _ in $(seq 1 "$attempts"); do
    if ! port_in_use; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

run_loop() {
  trap 'rm -f "$PID_FILE" "$STOP_FILE"; if [ -n "${child_pid:-}" ]; then kill "$child_pid" 2>/dev/null || true; wait "$child_pid" 2>/dev/null || true; fi; exit 0' INT TERM EXIT
  echo "[$(date -Iseconds)] supervisor started" >> "$LOG_FILE"
  while true; do
    if [ -f "$STOP_FILE" ]; then
      echo "[$(date -Iseconds)] stop requested before launch" >> "$LOG_FILE"
      rm -f "$STOP_FILE"
      exit 0
    fi

    if ! wait_for_port_release 40; then
      echo "[$(date -Iseconds)] port $PORT still busy before launch; delaying restart" >> "$LOG_FILE"
      sleep 1
      continue
    fi

    echo "[$(date -Iseconds)] launching tsx server.ts" >> "$LOG_FILE"
    "$TSX_BIN" server.ts >> "$LOG_FILE" 2>&1 &
    child_pid=$!
    if wait "$child_pid"; then
      exit_code=0
    else
      exit_code=$?
    fi
    echo "[$(date -Iseconds)] server exited with code $exit_code" >> "$LOG_FILE"

    if [ -f "$STOP_FILE" ]; then
      echo "[$(date -Iseconds)] stop acknowledged" >> "$LOG_FILE"
      rm -f "$STOP_FILE"
      exit 0
    fi

    sleep 1
    echo "[$(date -Iseconds)] restarting server" >> "$LOG_FILE"
  done
}

case "${1:-}" in
  start)
    if health_check; then
      echo "RETROBUILDER server already healthy on port $PORT"
      exit 0
    fi
    if [ -f "$PID_FILE" ]; then
      existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
      if is_pid_running "$existing_pid"; then
        echo "RETROBUILDER supervisor already running (pid $existing_pid)"
        exit 0
      fi
      rm -f "$PID_FILE"
    fi
    rm -f "$STOP_FILE"
    nohup "$0" run >/dev/null 2>&1 &
    supervisor_pid=$!
    echo "$supervisor_pid" > "$PID_FILE"
    for _ in $(seq 1 40); do
      if health_check; then
        echo "RETROBUILDER supervisor started (pid $supervisor_pid)"
        exit 0
      fi
      sleep 0.5
    done
    echo "RETROBUILDER supervisor started but health check did not come up in time"
    exit 1
    ;;
  stop)
    if [ ! -f "$PID_FILE" ]; then
      echo "RETROBUILDER supervisor is not running"
      exit 0
    fi
    supervisor_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    touch "$STOP_FILE"
    if is_pid_running "$supervisor_pid"; then
      kill "$supervisor_pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        if ! is_pid_running "$supervisor_pid"; then
          break
        fi
        sleep 0.25
      done
    fi
    rm -f "$PID_FILE" "$STOP_FILE"
    echo "RETROBUILDER supervisor stopped"
    ;;
  restart)
    "$0" stop || true
    "$0" start
    ;;
  status)
    supervisor_pid=""
    if [ -f "$PID_FILE" ]; then
      supervisor_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    fi
    if [ -n "$supervisor_pid" ] && is_pid_running "$supervisor_pid"; then
      echo "supervisor: running (pid $supervisor_pid)"
    else
      echo "supervisor: stopped"
    fi
    if health_check; then
      echo "health: ok"
    else
      echo "health: down"
    fi
    echo "log: $LOG_FILE"
    ;;
  logs)
    tail -n "${2:-120}" "$LOG_FILE"
    ;;
  run)
    run_loop
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs [lines]|run}" >&2
    exit 1
    ;;
esac
