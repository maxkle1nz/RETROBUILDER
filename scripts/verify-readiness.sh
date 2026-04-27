#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> generated workspace verification"
npm run verify:generated-workspace

echo "==> SPECULAR / OMX / m1nd / browser truth verification"
npm run verify:specular

echo "PASS verify:readiness complete"
