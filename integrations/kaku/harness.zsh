# Kaku ChatGPT Harness integration template.
# The verified installer writes a managed copy to:
# ~/.config/kaku/zsh/plugins/chatgpt-harness.zsh

export KAKU_CHATGPT_HARNESS_RUNTIME="${KAKU_CHATGPT_HARNESS_RUNTIME:-$HOME/kaku-chatgpt-harness}"
export HARNESS_ENDPOINT="${HARNESS_ENDPOINT:-http://127.0.0.1:8765}"
export HARNESS_LOG_PATH="${HARNESS_LOG_PATH:-$KAKU_CHATGPT_HARNESS_RUNTIME/.runtime/harnessd.log}"
export PATH="$HOME/.local/bin:$PATH"
