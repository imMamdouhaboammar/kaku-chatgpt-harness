import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

export const SHELL_MARKER_START = "# KAKU_SHELL_INTEGRATION_START";
export const SHELL_MARKER_END = "# KAKU_SHELL_INTEGRATION_END";

const ZSHRC_BLOCK = [
  SHELL_MARKER_START,
  'if [[ -o interactive ]] && { [[ "${TERM:-}" == "kaku" ]] || [[ -n "${WEZTERM_PANE:-}" ]] || [[ "${TERM_PROGRAM:l}" == "kaku" ]]; }; then',
  '  [[ -r "$HOME/.config/kaku/zsh/kaku.zsh" ]] && source "$HOME/.config/kaku/zsh/kaku.zsh"',
  '  [[ -r "$HOME/.config/kaku/zsh/plugins/kaku-shell-loader.zsh" ]] && source "$HOME/.config/kaku/zsh/plugins/kaku-shell-loader.zsh"',
  'fi',
  SHELL_MARKER_END
].join("\n");

const KAKU_SHELL_LOADER = [
  "# Managed by Kaku ChatGPT Harness. Kaku panes only.",
  '[[ -n "${_KAKU_SHELL_LOADER_LOADED:-}" ]] && return 0',
  'if [[ "${TERM:-}" != "kaku" && -z "${WEZTERM_PANE:-}" && "${TERM_PROGRAM:l}" != "kaku" ]]; then return 0; fi',
  'typeset -g _KAKU_SHELL_LOADER_LOADED=1',
  'source "$HOME/.config/kaku/zsh/plugins/kaku-harness-env.zsh"',
  '[[ -r "$HOME/.config/kaku/zsh/plugins/chatgpt-harness.zsh" ]] && source "$HOME/.config/kaku/zsh/plugins/chatgpt-harness.zsh"',
  '[[ -r "$HOME/.config/kaku/zsh/plugins/kaku-harness-interactive.zsh" ]] && source "$HOME/.config/kaku/zsh/plugins/kaku-harness-interactive.zsh"',
  ""
].join("\n");

const KAKU_HARNESS_ENV = [
  "# Managed terminal-scoped Kaku environment.",
  '[[ -n "${_KAKU_HARNESS_ENV_LOADED:-}" ]] && return 0',
  'typeset -g _KAKU_HARNESS_ENV_LOADED=1',
  'export TERM_PROGRAM="Kaku"',
  'export KAKU_TERMINAL=1',
  'export KAKU_AI_HARNESS_ENABLED=1',
  'export KAKU_FINGERPRINT="Kaku-AI-Terminal-Agent-Harness-v2"',
  'export TERMINAL_EMULATOR="Kaku"',
  'export AGENT_TERMINAL_ID="kaku-macOS-ai-harness"',
  'export PATH="$HOME/.config/kaku/zsh/bin:$HOME/.local/bin:$PATH"',
  '_kaku_discover_skills() {',
  '  emulate -L zsh',
  '  setopt local_options null_glob',
  '  local root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
  '  local -a skill_paths=() skills_found=()',
  '  local workspace_skills="$root_dir/.agents/skills"',
  '  local global_agent_skills="$HOME/.agents/skills"',
  '  local mattpocock_skills="$HOME/.config/mattpocock-skills/skills"',
  '  local gemini_config_skills="$HOME/.gemini/config/skills"',
  '  local cdir spath sdir',
  '  if [[ -d "$workspace_skills" ]]; then skill_paths+=("$workspace_skills"); export AGENT_WORKSPACE_SKILLS_DIR="$workspace_skills"; else unset AGENT_WORKSPACE_SKILLS_DIR; fi',
  '  [[ -d "$global_agent_skills" ]] && skill_paths+=("$global_agent_skills")',
  '  for cdir in "$mattpocock_skills"/*(N/); do skill_paths+=("$cdir"); done',
  '  [[ -d "$gemini_config_skills" ]] && skill_paths+=("$gemini_config_skills")',
  '  for spath in "${skill_paths[@]}"; do for sdir in "$spath"/*(N/); do [[ -f "$sdir/SKILL.md" ]] && skills_found+=("${sdir:t}"); done; done',
  '  typeset -U skills_found skill_paths',
  '  export AGENT_SKILLS_PATH="${(j.:.)skill_paths}"',
  '  export ACTIVE_SKILLS_SUMMARY="${(j: :)skills_found}"',
  '}',
  '_kaku_discover_skills',
  ""
].join("\n");

const INTERACTIVE_PREFIX = [
  "# Managed interactive Kaku harness.",
  '[[ -n "${_KAKU_SKILLS_HARNESS_LOADED:-}" ]] && return 0',
  'typeset -g _KAKU_SKILLS_HARNESS_LOADED=1',
  'alias mcp-start="$HOME/.local/bin/mcp-start"',
  'export AGENT_KERNEL_HOME="$HOME/.agent-kernel"',
  'agent_kernel_chpwd_hook() {',
  '  command -v agent-kernel >/dev/null 2>&1 || return 0',
  '  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0',
  '  [[ "${AGENT_KERNEL_AUTO_INIT:-1}" == "0" ]] && return 0',
  '  local cwd_name="${PWD:t}"',
  '  agent-kernel session list 2>/dev/null | grep -i -q "$cwd_name" || agent-kernel session start --agent kaku --project . >/dev/null 2>&1 || true',
  '}',
  'autoload -Uz add-zsh-hook',
  'add-zsh-hook -d chpwd agent_kernel_chpwd_hook 2>/dev/null || true',
  'add-zsh-hook chpwd agent_kernel_chpwd_hook',
  'agent_kernel_chpwd_hook 2>/dev/null || true',
  ""
].join("\n");

const MCP_START = `#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="$HOME/.local/state/desktop-commander"
LOG_FILE="$STATE_DIR/remote.log"
mkdir -p "$STATE_DIR"
remote_pids() {
  ps ax -o pid=,command= | awk 'index($0, "npm exec @wonderwhy-er/desktop-commander") && $0 ~ / remote([[:space:]]|$)/ {print $1}'
}
status() {
  local pids count
  pids="$(remote_pids)"
  count="$(printf '%s\n' "$pids" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "$count" -eq 0 ]]; then echo "Remote Desktop Commander is not running."; return 1; fi
  if [[ "$count" -gt 1 ]]; then
    echo "Duplicate Remote Desktop Commander launchers detected: $(printf '%s' "$pids" | tr '\n' ' ' | xargs)" >&2
    return 2
  fi
  echo "Remote Desktop Commander is running: $pids"
}
case "\${1:-start}" in
  start)
    pids="$(remote_pids)"
    if [[ -n "$pids" ]]; then status || true; echo "Remote Desktop Commander already running; no duplicate started."; exit 0; fi
    nohup npx --yes @wonderwhy-er/desktop-commander@0.2.46 remote >>"$LOG_FILE" 2>&1 &
    echo $! > "$STATE_DIR/launcher.pid"
    sleep 2
    status
    ;;
  status) status ;;
  dedupe)
    pids="$(remote_pids)"
    count="$(printf '%s\n' "$pids" | sed '/^$/d' | wc -l | tr -d ' ')"
    [[ "$count" -le 1 ]] && { status || true; exit 0; }
    keep="$(printf '%s\n' "$pids" | tail -n 1)"
    while read -r pid; do
      [[ -z "$pid" || "$pid" == "$keep" ]] && continue
      /bin/kill -TERM -- "-$pid" 2>/dev/null || /bin/kill -TERM "$pid" 2>/dev/null || true
    done <<< "$pids"
    echo "Kept newest Remote Desktop Commander launcher: $keep"
    ;;
  stop)
    pids="$(remote_pids)"
    [[ -z "$pids" ]] && { echo "Remote Desktop Commander is not running."; exit 0; }
    while read -r pid; do [[ -n "$pid" ]] && /bin/kill -TERM -- "-$pid" 2>/dev/null || true; done <<< "$pids"
    echo "Stop signal sent to owned Remote Desktop Commander launchers."
    ;;
  restart) "$0" stop; sleep 2; "$0" start ;;
  doctor) exec "$HOME/.local/bin/kaku-doctor" ;;
  *) echo "Usage: mcp-start {start|status|dedupe|stop|restart|doctor}" >&2; exit 2 ;;
esac
`;

const KAKU_DOCTOR = `#!/usr/bin/env bash
set -euo pipefail
HOME_DIR="\${KAKU_TEST_HOME:-$HOME}"
failures=0
pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; failures=$((failures + 1)); }
clean_zsh() { /usr/bin/env -i HOME="$HOME_DIR" USER="\${USER:-$(id -un)}" PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" "$@"; }
native_out=$(clean_zsh TERM_PROGRAM=Apple_Terminal TERM=xterm-256color /bin/zsh -lic 'printf "%s|%s|%s" "\${TERM_PROGRAM-}" "\${KAKU_TERMINAL-}" "\${_KAKU_SHELL_LOADER_LOADED-}"' </dev/null 2>&1) || true
[[ "$native_out" == 'Apple_Terminal||' ]] && pass 'native Terminal remains isolated from Kaku' || fail "native Terminal isolation: $native_out"
kaku_out=$(clean_zsh TERM_PROGRAM=Kaku TERM=kaku WEZTERM_PANE=1 /bin/zsh -lic 'printf "%s|%s|%s|%s" "\${TERM_PROGRAM-}" "\${KAKU_TERMINAL-}" "\${_KAKU_HARNESS_ENV_LOADED-}" "\${_KAKU_SKILLS_HARNESS_LOADED-}"' </dev/null 2>&1) || true
[[ "$kaku_out" == 'Kaku|1|1|1' ]] && pass 'Kaku integration initializes once' || fail "Kaku integration: $kaku_out"
bash_out=$(/usr/bin/env -i HOME="$HOME_DIR" USER="\${USER:-$(id -un)}" PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" /bin/bash -lc 'printf OK' 2>&1) || true
[[ "$bash_out" == 'OK' ]] && pass 'Bash login starts cleanly' || fail "Bash startup: $bash_out"
[[ $(grep -c 'kaku-shell-loader.zsh' "$HOME_DIR/.zshrc" 2>/dev/null || true) -eq 1 ]] && pass 'one Kaku loader is configured' || fail 'Kaku loader count in .zshrc'
grep -q '.config/kaku' "$HOME_DIR/.zshenv" 2>/dev/null && fail '.zshenv loads Kaku globally' || pass '.zshenv is terminal-neutral'
if grep -Eq 'pkill[[:space:]]+-9|kill[[:space:]]+-9|ngrok|serveo' "$HOME_DIR/.local/bin/mcp-start" 2>/dev/null; then fail 'mcp-start contains unsafe legacy transport logic'; else pass 'mcp-start uses safe local remote transport'; fi
"$HOME_DIR/.local/bin/mcp-start" status >/dev/null 2>&1 && pass 'Remote Desktop Commander process is detected' || fail 'Remote Desktop Commander process detection'
curl -fsS --max-time 2 http://127.0.0.1:8765/health | grep -q '"status":"ok"' && pass 'Kaku ChatGPT harness is healthy' || fail 'Kaku ChatGPT harness health endpoint'
(( failures == 0 )) || { printf '%s regression check(s) failed.\n' "$failures" >&2; exit 1; }
printf 'All Kaku shell regression checks passed.\n'
`;

export function rewriteZshenv(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let skipBlock = false;
  for (const line of lines) {
    if (skipBlock) { if (line.trim() === "fi") skipBlock = false; continue; }
    if (line.includes(".config/kaku/zsh/plugins/env.zsh")) { if (/^\s*if\s/.test(line)) skipBlock = true; continue; }
    if (line.includes("Kaku & AI Harness Global Zsh Environment")) continue;
    if (line.includes("Automatically loaded by EVERY Zsh process")) continue;
    output.push(line);
  }
  const result = normalizeText(output.join("\n"));
  return result.trim() ? result : "# Global Zsh environment must remain terminal-neutral.\n";
}

export function rewriteZshrc(content: string): string {
  let base = removeManagedBlock(content);
  base = base.replace(/\n?# Kaku and Agent Kernel integrations are isolated to Kaku Terminal\.[\s\S]*?(?=\n# >>> railway initialize >>>|$)/, "\n");
  base = base.split(/\r?\n/).filter((line) => {
    if (line.includes(".config/kaku/zsh/plugins/env.zsh")) return false;
    if (line.includes(".config/kaku/zsh/kaku.zsh")) return false;
    if (line.includes(".config/kaku/zsh/plugins/kaku-skills-harness.zsh")) return false;
    if (line.includes("Kaku PATH Integration")) return false;
    if (line.includes("Load Harness Environment for all shells")) return false;
    return true;
  }).join("\n");
  base = normalizeText(base).trimEnd();
  return `${base}${base ? "\n\n" : ""}${ZSHRC_BLOCK}\n`;
}

export function rewriteBashProfile(content: string): string {
  return normalizeText(content
    .replace(/^\s*\.\s+"\$HOME\/\.local\/bin\/env"\s*$/gm, `[ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"`)
    .replace(/^\s*\.\s+"\/Users\/[^\"]+\/\.deno\/env"\s*$/gm, `[ -f "$HOME/.deno/env" ] && . "$HOME/.deno/env"`)
    .replace(/^\s*\.\s+"\$HOME\/\.deno\/env"\s*$/gm, `[ -f "$HOME/.deno/env" ] && . "$HOME/.deno/env"`));
}

export function managedShellIntegrationPaths(homeDir: string): string[] {
  return [
    join(homeDir, ".zshenv"),
    join(homeDir, ".zshrc"),
    join(homeDir, ".bash_profile"),
    join(homeDir, ".config", "kaku", "zsh", "plugins", "kaku-shell-loader.zsh"),
    join(homeDir, ".config", "kaku", "zsh", "plugins", "kaku-harness-env.zsh"),
    join(homeDir, ".config", "kaku", "zsh", "plugins", "kaku-harness-interactive.zsh"),
    join(homeDir, ".local", "bin", "mcp-start"),
    join(homeDir, ".local", "bin", "kaku-doctor"),
    join(homeDir, ".local", "share", "kaku-guards", "kaku-shell-regression.sh")
  ];
}

export function applyShellIntegration(homeDir: string): void {
  const pluginDir = join(homeDir, ".config", "kaku", "zsh", "plugins");
  const guardDir = join(homeDir, ".local", "share", "kaku-guards");
  mkdirSync(pluginDir, { recursive: true, mode: 0o755 });
  mkdirSync(join(homeDir, ".local", "bin"), { recursive: true, mode: 0o755 });
  mkdirSync(guardDir, { recursive: true, mode: 0o755 });
  rewriteOptionalFile(join(homeDir, ".zshenv"), rewriteZshenv);
  rewriteOptionalFile(join(homeDir, ".zshrc"), rewriteZshrc);
  rewriteOptionalFile(join(homeDir, ".bash_profile"), rewriteBashProfile);
  const legacyInteractive = existsSync(join(pluginDir, "kaku-skills-harness.zsh"))
    ? readFileSync(join(pluginDir, "kaku-skills-harness.zsh"), "utf8")
    : "";
  writeAtomic(join(pluginDir, "kaku-shell-loader.zsh"), KAKU_SHELL_LOADER, 0o644);
  writeAtomic(join(pluginDir, "kaku-harness-env.zsh"), KAKU_HARNESS_ENV, 0o644);
  writeAtomic(join(pluginDir, "kaku-harness-interactive.zsh"), INTERACTIVE_PREFIX + sanitizeLegacyInteractive(legacyInteractive), 0o644);
  writeAtomic(join(homeDir, ".local", "bin", "mcp-start"), MCP_START, 0o755);
  writeAtomic(join(guardDir, "kaku-shell-regression.sh"), KAKU_DOCTOR, 0o755);
  writeAtomic(join(homeDir, ".local", "bin", "kaku-doctor"), `#!/usr/bin/env bash\nexec "$HOME/.local/share/kaku-guards/kaku-shell-regression.sh" "$@"\n`, 0o755);
}

function sanitizeLegacyInteractive(content: string): string {
  if (!content.trim()) return "";
  return normalizeText(content.split(/\r?\n/).filter((line) => {
    if (line.includes("plugins/env.zsh")) return false;
    if (line.includes("Kaku Unified AI Harness")) return false;
    return true;
  }).join("\n"));
}

function rewriteOptionalFile(path: string, transform: (content: string) => string): void {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeAtomic(path, transform(current), 0o644);
}

function removeManagedBlock(content: string): string {
  const start = content.indexOf(SHELL_MARKER_START);
  if (start < 0) return content;
  const end = content.indexOf(SHELL_MARKER_END, start);
  if (end < 0) return content.slice(0, start);
  return content.slice(0, start) + content.slice(end + SHELL_MARKER_END.length);
}

function normalizeText(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function writeAtomic(path: string, content: string, mode: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { mode });
  renameSync(temporary, path);
  chmodSync(path, mode);
}
