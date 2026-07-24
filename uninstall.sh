#!/usr/bin/env bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}Uninstalling Kaku ChatGPT Native Harness...${NC}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Uninstall launchd service
if [ -f "$HOME/Library/LaunchAgents/com.kaku.harnessd.plist" ]; then
    echo "Stopping and unloading launchd service..."
    bun run "$REPO_DIR/apps/harnessctl/src/cli.ts" service uninstall || true
fi

# 2. Remove symlink
if [ -f "$HOME/.local/bin/harnessctl" ]; then
    echo "Removing harnessctl symlink..."
    rm -f "$HOME/.local/bin/harnessctl"
fi

echo -e "${GREEN}Uninstallation complete!${NC}"
