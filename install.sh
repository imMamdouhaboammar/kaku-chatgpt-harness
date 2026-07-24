#!/usr/bin/env bash

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "=========================================================="
echo "   Kaku + ChatGPT-Native Local Harness Autopilot Installer"
echo "=========================================================="
echo -e "${NC}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"

# 1. Check Bun installation
if ! command -v bun &> /dev/null; then
    echo -e "${BLUE}[1/5] Bun not found. Installing Bun runtime...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
else
    echo -e "${GREEN}[1/5] Bun runtime detected: $(bun --version)${NC}"
fi

# 2. Install workspace dependencies
echo -e "${BLUE}[2/5] Installing workspace dependencies...${NC}"
cd "$REPO_DIR"
bun install --silent

# 3. Build production binaries
echo -e "${BLUE}[3/5] Building production binaries...${NC}"
bun run build

# 4. Create symlink for harnessctl
echo -e "${BLUE}[4/5] Creating harnessctl CLI executable symlink...${NC}"
mkdir -p "$BIN_DIR"
cat << 'EOF' > "$BIN_DIR/harnessctl"
#!/usr/bin/env bash
exec bun run "$HOME/kaku-chatgpt-harness/apps/harnessctl/src/cli.ts" "$@"
EOF
chmod +x "$BIN_DIR/harnessctl"

# 5. Install launchd background service
echo -e "${BLUE}[5/5] Registering macOS launchd background service...${NC}"
bun run "$REPO_DIR/apps/harnessctl/src/cli.ts" service install

echo -e "${GREEN}"
echo "=========================================================="
echo " 🎉 Installation Complete! Harness is running in background."
echo "=========================================================="
echo -e "${NC}"
echo "Quick Commands:"
echo "  harnessctl status         Check daemon and active sessions"
echo "  harnessctl doctor         Run diagnostic checks"
echo "  harnessctl connect        Connect current project session"
echo "  harnessctl agency         Inspect auto-injected agency harness"
echo ""
