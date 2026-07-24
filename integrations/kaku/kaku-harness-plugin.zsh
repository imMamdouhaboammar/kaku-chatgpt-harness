# Kaku ChatGPT-Native Harness Zsh Plugin
# Minimal startup footprint (<80ms overhead)

export HARNESS_CTL_BIN="$HOME/kaku-chatgpt-harness/apps/harnessctl/src/cli.ts"

alias mcp-start="bun run $HARNESS_CTL_BIN connect chatgpt --project \"$PWD\""
alias harness-status="bun run $HARNESS_CTL_BIN status"
alias harness-doctor="bun run $HARNESS_CTL_BIN doctor"
