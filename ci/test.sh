#!/usr/bin/env bash
# Type check + unit tests + production build — run by Loop CI (test-command) and locally:
#   bash ci/test.sh
# Runs in node:22 (Docker) when available, so CI doesn't depend on the runner's Node version.
set -euo pipefail
cd "$(dirname "$0")/.."

run() {
  npm ci --no-audit --no-fund
  npm run typecheck
  npm test
  npm run build
  # the first page must stay small: fail if the entry chunk grows past 130 KB gzipped
  entry=$(ls dist/assets/index-*.js | head -1)
  size=$(gzip -c "$entry" | wc -c)
  echo "entry chunk: $entry $((size / 1024)) KB gzipped"
  [ "$size" -lt 133120 ] || { echo "entry chunk too big"; exit 1; }
}

# Docker only if it actually runs (installed-but-stopped Docker Desktop → use the local Node)
if [ "${INSIDE_NODE:-}" = "1" ] || ! docker info >/dev/null 2>&1; then
  run
else
  # own node_modules + dist inside the container (anonymous volumes): never replaces the host's (other OS/arch)
  docker run --rm -e INSIDE_NODE=1 -v "$PWD":/app -v /app/node_modules -v /app/dist -w /app node:22-alpine \
    sh -c "apk add --no-cache bash >/dev/null && bash ci/test.sh"
fi
