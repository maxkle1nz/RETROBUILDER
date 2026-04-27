#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_PORT="${RETROBUILDER_PORT:-7777}"
BASE_URL="${RETROBUILDER_TEST_BASE:-http://127.0.0.1:${DEFAULT_PORT}}"
BASE_URL="${BASE_URL%/}"
VERIFY_PORT="$DEFAULT_PORT"
if [[ "$BASE_URL" =~ :([0-9]+)$ ]]; then
  VERIFY_PORT="${BASH_REMATCH[1]}"
fi

SERVER_PID=""
SERVER_LOG="${RETROBUILDER_VERIFY_SERVER_LOG:-$ROOT_DIR/.omx/logs/verify-specular-server.log}"

health_check() {
  curl -sf "$BASE_URL/api/health" >/dev/null
}

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if health_check; then
  echo "==> using existing RETROBUILDER server at $BASE_URL"
else
  mkdir -p "$(dirname "$SERVER_LOG")"
  echo "==> starting RETROBUILDER server for verify:specular at $BASE_URL"
  RETROBUILDER_PORT="$VERIFY_PORT" PORT="$VERIFY_PORT" DISABLE_HMR=true npx tsx server.ts >"$SERVER_LOG" 2>&1 &
  SERVER_PID="$!"

  for _ in $(seq 1 80); do
    if health_check; then
      break
    fi
    sleep 0.5
  done

  if ! health_check; then
    echo "FAIL verify:specular could not start RETROBUILDER server at $BASE_URL"
    echo "==> server log tail ($SERVER_LOG)"
    tail -n 100 "$SERVER_LOG" || true
    exit 1
  fi
fi

export RETROBUILDER_TEST_BASE="$BASE_URL"

echo "==> typecheck"
npx tsc --noEmit

echo "==> production build"
npm run build >/dev/null

echo "==> contract and runtime suite"
npm run verify:git
npx tsx tests/provider-bootstrap-runtime-contract.test.ts
npx tsx tests/bridge-autostart-contract.test.ts
npx tsx tests/bridge-runtime-visibility-contract.test.ts
npx tsx tests/bridge-live-readiness-contract.test.ts
npx tsx tests/app-version-badge-contract.test.ts
npx tsx tests/release-readiness-contract.test.ts
npx tsx tests/ci-readiness-contract.test.ts
npx tsx tests/server-local-bind-contract.test.ts
npx tsx tests/specular-service.test.ts
npx tsx tests/specular-session-persistence.test.ts
npx tsx tests/specular-create-route.test.ts
npx tsx tests/specular-create-contract.test.ts
npx tsx tests/specular-kompletus-contract.test.ts
npx tsx tests/build-design-gate-contract.test.ts
npx tsx tests/build-bundle-contract.test.ts
npx tsx tests/build-dist-output.test.ts
npx tsx tests/build-status-reentry-contract.test.ts
npx tsx tests/build-completion-launch-contract.test.ts
npx tsx tests/build-console-performance-contract.test.ts
npx tsx tests/builder-final-uix-contract.test.ts
npx tsx tests/builder-chat-resume-contract.test.ts
npx tsx tests/responsive-shell-chat-contract.test.ts
npx tsx tests/omx-build-docs-contract.test.ts
npx tsx tests/omx-docs-quality-gate-runtime-contract.test.ts
npx tsx tests/omx-scheduler-contract.test.ts
npx tsx tests/omx-resume-contract.test.ts
npx tsx tests/omx-client-contract.test.ts
npx tsx tests/omx-open-project-route-contract.test.ts
npx tsx tests/omx-real-contract.test.ts

echo "==> m1nd runtime smoke"
npm run smoke:m1nd

echo "==> browser smoke suite"
npx tsx tests/ui-workbench-chromium-cdp.ts
npm run smoke:ui:specular-showcase

echo "PASS verify:specular complete"
