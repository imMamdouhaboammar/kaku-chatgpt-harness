#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"

if [[ -z "$BUN_BIN" ]]; then
  echo "[installer] Bun is required and was not found in PATH." >&2
  exit 1
fi

exec "$BUN_BIN" "$REPO_DIR/scripts/install-runtime.ts" "$@"
