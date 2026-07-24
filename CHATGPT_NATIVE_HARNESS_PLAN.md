# Kaku + MCP-Start: ChatGPT-Native Local Harness Plan

## Document status

- Purpose: define a production-grade local harness designed specifically for ChatGPT controlling Mamdouh's Mac through Kaku Terminal.
- Scope: Kaku integration, MCP transport, local execution, project context, Agent Kernel, skills, subagents, safety, observability, recovery, and testing.
- Principle: Kaku is the operator interface. The harness daemon is the control plane. Desktop Commander remains an execution adapter, not the architecture owner.
- Absolute perfection is not a realistic engineering target. The target is a measurable, secure, recoverable, low-latency system with explicit trust boundaries.

## Located components

| Component | Current path |
| --- | --- |
| Kaku application | `/Applications/Kaku.app` |
| Kaku version | `0.15.0` from the application bundle |
| Kaku user configuration | `/Users/mamdouhaboammar/.config/kaku` |
| Kaku Lua configuration | `/Users/mamdouhaboammar/.config/kaku/kaku.lua` |
| Kaku shell environment | `/Users/mamdouhaboammar/.config/kaku/zsh/plugins/env.zsh` |
| Kaku shell hooks | `/Users/mamdouhaboammar/.config/kaku/zsh/plugins/kaku-skills-harness.zsh` |
| MCP-Start command | Alias to `/Users/mamdouhaboammar/DesktopCommanderMCP/start-session.sh` |
| Desktop Commander checkout | `/Users/mamdouhaboammar/DesktopCommanderMCP` |
| Agent Kernel source | `/Users/mamdouhaboammar/agent-kernel` |
| Agent Kernel runtime home | `/Users/mamdouhaboammar/.agent-kernel` |
| Delegate Team binary | `/opt/homebrew/bin/delegate-team` |
| Current skill inventory | 107 unique discovered skills |

## Current-state audit

### P0 security findings

1. The current public ngrok endpoint has no application authentication before exposing MCP tools.
2. CORS is configured as `Access-Control-Allow-Origin: *`.
3. Desktop Commander currently has `allowedDirectories: []`, which means unrestricted file operations.
4. The public endpoint therefore exposes a high-trust local command and filesystem surface through a static address.
5. Tool logging prints full commands and file-content previews into `/tmp/mcp_session_*.log`.
6. The current session log is mode `0644`, not private `0600`.
7. The shell credential guard claims to block secrets, but a controlled fake-token test proved the command still executed.
8. The current guard only checks a few token formats and does not cover arguments arriving through MCP tool calls.

### P0 reliability findings

1. The server uses `SSEServerTransport`, while the installed MCP SDK marks that transport deprecated and provides Streamable HTTP.
2. A live test found 60 connection events, one disconnection event, and 59 active sessions in one server process.
3. Session objects are retained in memory when the client reconnects without closing the prior stream.
4. `list_processes` timed out during the audit.
5. The message handler parses request JSON twice, with the second parse outside the protective try block.
6. There is no session TTL, heartbeat reaper, maximum-session cap, or orphan cleanup.
7. There is no durable session journal for reconnect and resume.

### P1 session and tunnel findings

1. `start-session.sh` kills every ngrok process with `pkill -9 ngrok`.
2. Every terminal window uses the same static ngrok domain, so the design is not genuinely multi-session.
3. Port isolation exists locally, but public routing still permits only one active static-domain owner.
4. The script has no readiness probe before printing success beyond fixed sleeps.
5. Tunnel failure, DNS delay, and server failure are not distinguished.
6. Shutdown is process-based rather than ownership-based and can leave stale children.
7. The already-installed `tunnel-client` path is present but is not the primary path used by `mcp-start`.

### P1 source-control findings

1. The custom harness files are untracked inside the upstream Desktop Commander checkout.
2. The checkout points directly to `wonderwhy-er/DesktopCommanderMCP` on `main`.
3. The custom files have no isolated history, release tag, rollback path, or CI.
4. An upstream update or cleanup can delete the local harness layer.
5. Kaku configuration is also hand-edited without a generated manifest or migration record.

### P1 shell findings

1. Login-shell startup measured between 3.52 and 3.84 seconds.
2. Skill discovery alone consumed about 2.01 seconds in an isolated test.
3. `env.zsh` is sourced from `.zshenv`, so every Zsh process is labeled as Kaku, including non-Kaku shells.
4. Kaku environment code is sourced repeatedly through `.zshenv`, `.zshrc`, and the hook file.
5. Skill discovery scans more than 100 skills on every directory change and agent launch.
6. The three-pane shortcut launches `gemini`, but Gemini was not available in the audited PATH.
7. `fix_last_error` stores only an exit code, not the failed command, stderr, cwd, environment profile, or relevant log context.

## Target operating model

ChatGPT should connect to one authenticated harness gateway, not directly to an ad hoc terminal server.

```text
ChatGPT
  -> authenticated MCP gateway
  -> session and identity manager
  -> policy and approval engine
  -> project context resolver
  -> execution adapters
       - Desktop Commander
       - Agent Kernel
       - Delegate Team
       - Git and worktrees
       - test and review tools
  -> append-only audit and recovery journal
  -> Kaku operator UI
```

### Design rules

1. Kaku remains the human-visible terminal and command center.
2. `mcp-start` becomes a thin CLI entry point, not a long shell script containing the system architecture.
3. A single local daemon owns connections, sessions, process trees, logs, and cleanup.
4. Every remote session is bound to one identity, one project, one capability profile, and one expiry.
5. The default profile is project-scoped and approval-aware, not full-home unrestricted access.
6. Agent Kernel is the source of durable rules and policies.
7. Delegate Team is used only through structured task contracts and isolated worktrees.
8. Skills are indexed once and selected per task. They are not rescanned and exported as a large environment variable on every prompt.
9. Every mutating operation has a checkpoint, diff, verification result, and rollback path.
10. Secrets are resolved locally and injected only into approved child processes. Secret values are never returned to ChatGPT or written to logs.
