#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_NAME="${RETROBUILDER_TMUX_SESSION:-retrobuilder-dev}"
SUPERVISOR_SCRIPT="$ROOT_DIR/scripts/dev-supervisor.sh"
LOG_FILE="$ROOT_DIR/.omx/logs/dev-supervisor.log"
PORT="${RETROBUILDER_PORT:-7777}"
HOST="127.0.0.1"

health_check() {
  curl -sf "http://$HOST:$PORT/api/health" >/dev/null 2>&1
}

case "${1:-}" in
  start)
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      echo "tmux supervisor already running in session $SESSION_NAME"
      exit 0
    fi
    tmux new-session -d -s "$SESSION_NAME" "cd '$ROOT_DIR' && bash '$SUPERVISOR_SCRIPT' run"
    for _ in $(seq 1 40); do
      if health_check; then
        echo "RETROBUILDER tmux supervisor started (session $SESSION_NAME)"
        exit 0
      fi
      sleep 0.5
    done
    echo "RETROBUILDER tmux supervisor started but health check did not come up in time"
    exit 1
    ;;
  stop)
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME"
      echo "RETROBUILDER tmux supervisor stopped"
    else
      echo "RETROBUILDER tmux supervisor is not running"
    fi
    ;;
  restart)
    "$0" stop || true
    "$0" start
    ;;
  status)
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      echo "tmux: running ($SESSION_NAME)"
    else
      echo "tmux: stopped"
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
  attach)
    exec tmux attach-session -t "$SESSION_NAME"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs [lines]|attach}" >&2
    exit 1
    ;;
esac
