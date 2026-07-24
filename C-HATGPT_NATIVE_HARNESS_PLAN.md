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
5. Kaku configuration is hand-edited without a generated manifest or migration record.

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

## Recommended repository strategy

Create a first-party repository at:

`/Users/mamdouhaboammar/kaku-chatgpt-harness`

Do not continue placing orchestration files inside the upstream Desktop Commander checkout.

Recommended layout:

```text
kaku-chatgpt-harness/
  apps/harnessd/              local daemon and MCP gateway
  apps/harnessctl/            operator CLI used by mcp-start
  packages/session-core/      identity, leases, TTL, reconnect, cleanup
  packages/policy-adapter/    Agent Kernel integration
  packages/execution-dc/      Desktop Commander adapter
  packages/workspace/         project detection, worktrees, checkpoints
  packages/skill-index/       cached skill metadata and task matching
  packages/subagents/         Delegate Team contracts and result schema
  packages/secrets/           macOS Keychain broker
  packages/observability/     structured events, redaction, metrics
  integrations/kaku/          generated Lua and Zsh integration
  tests/                      unit, integration, security, soak, recovery
  docs/                       architecture, runbooks, threat model
```

Desktop Commander should be consumed as a pinned dependency or adapter. Local patches should live in a small maintained fork only when an upstream extension point is insufficient.

Agent Kernel should remain a separate governance product. The harness calls it through its CLI or MCP interface rather than copying its memory implementation.

## Core components

### 1. `harnessd`

A persistent local daemon launched by `launchd`.

Responsibilities:

- own one MCP gateway process
- use Streamable HTTP
- authenticate every request
- maintain session leases and capability profiles
- track process ownership
- expire orphaned sessions
- manage project context
- publish health and metrics locally
- write redacted structured logs
- provide graceful shutdown and upgrade

The daemon must not depend on one Kaku window staying open.

### 2. `harnessctl`

The only operator CLI.

Proposed commands:

```bash
harnessctl start
harnessctl stop
harnessctl status
harnessctl doctor
harnessctl connect chatgpt --project "$PWD"
harnessctl disconnect <session>
harnessctl sessions
harnessctl logs <session>
harnessctl approve <request>
harnessctl revoke <session>
harnessctl repair
harnessctl update
```

`mcp-start` becomes an alias for:

```bash
harnessctl connect chatgpt --project "$PWD"
```

### 3. Authenticated MCP gateway

Requirements:

- use the existing official tunnel client path as the preferred transport
- no raw public ngrok endpoint without an application auth layer
- short-lived signed session credentials
- device binding
- one active project binding per session
- scope claims such as `read`, `write-project`, `process`, `git`, `full-local`
- replay protection
- request size limits
- rate limits
- idle timeout and absolute timeout
- local revocation

### 4. Session manager

Every session record must contain:

```json
{
  "sessionId": "uuid",
  "client": "chatgpt",
  "projectRoot": "/absolute/project/path",
  "profile": "project-write",
  "createdAt": "ISO timestamp",
  "lastSeenAt": "ISO timestamp",
  "expiresAt": "ISO timestamp",
  "processIds": [],
  "worktreePaths": [],
  "approvalState": {},
  "checkpointId": "optional"
}
```

Required behavior:

- one connection object per logical session
- session reuse on reconnect
- deterministic cleanup
- maximum concurrent sessions
- heartbeat reaper
- process-tree termination
- cleanup of temporary files and worktrees
- recovery after daemon restart

### 5. Project context resolver

Before the first mutating tool call, resolve:

- Git root
- current branch and dirty state
- repository instructions
- Agent Kernel project identity
- package manager
- runtime versions
- test commands
- secret profile
- cloud project mappings
- Supabase project mapping
- deployment target
- available skills
- available review and security tools

Store this in a session-local context snapshot. Refresh only when relevant files change.

### 6. Agent Kernel adapter

At session start:

1. run `agent-kernel status`
2. load the constitution and current policies
3. resolve project-specific memories
4. apply command guard before execution
5. record an episode checkpoint
6. propose durable lessons after verified completion

The harness must never allow the model to edit generated Agent Kernel output directly.

### 7. Skill index and router

Replace repeated filesystem scanning with a SQLite or JSON index containing:

- skill name
- description
- trigger phrases
- source path
- supported agents
- required tools
- trust level
- last modified hash
- conflicts
- version

Refresh on filesystem events or explicit `harnessctl skills refresh`.

For each task, select a small skill set and expose only that set to the agent.

### 8. Workspace and worktree manager

For mutating repository tasks:

- create a checkpoint before changes
- use a dedicated Git worktree by default
- record base commit
- prevent two agents from editing the same worktree
- keep unrelated dirty user changes outside the agent worktree
- provide a structured diff
- run required tests
- support rollback
- remove the worktree after merge or rejection

Non-Git folders use snapshot manifests and content hashes.

### 9. Subagent orchestration

ChatGPT remains the primary orchestrator.

Delegate Team receives explicit contracts:

```json
{
  "taskId": "uuid",
  "goal": "single bounded outcome",
  "projectRoot": "isolated worktree",
  "allowedPaths": [],
  "forbiddenPaths": [],
  "requiredSkills": [],
  "requiredTests": [],
  "outputSchema": "structured JSON",
  "timeoutSeconds": 900
}
```

Rules:

- no multiple mutating agents in one worktree
- no unrestricted `--dangerously-skip-permissions`
- read-only research agents may run in parallel
- mutating agents must use independent worktrees
- each result must include evidence, changed files, tests, risks, and unresolved items
- ChatGPT reviews and integrates results

### 10. Secret broker

Use macOS Keychain as the source of secret values.

The model sees secret references, never secret values.

Example:

```text
secret://supabase/project-x/service-role
secret://gcloud/account-y/application-credentials
secret://vercel/team-z/token
```

The broker:

- maps repository fingerprint to credential profile
- injects values only into the target child process
- redacts stdout and stderr
- blocks logging of matching values
- records secret reference usage without recording values
- expires temporary environment files immediately

## Kaku integration redesign

### Keep in Kaku

- visual session status
- project name
- active ChatGPT connection indicator
- approval notifications
- quick connect and disconnect shortcuts
- split-pane presets
- log viewer
- failed-command capture
- session recovery command

### Remove from shell startup

- full skill scanning
- global fake Kaku environment in every Zsh process
- direct architecture logic in aliases
- static model assumptions
- unsafe credential guard claims
- agent wrapping that starts sessions implicitly
- automatic `--dangerously-skip-permissions`

### Proposed Kaku shortcuts

```text
Cmd+Shift+C    connect current project to ChatGPT
Cmd+Shift+X    disconnect current session
Cmd+Shift+S    show session dashboard
Cmd+Shift+A    show pending approvals
Cmd+Shift+R    recover previous session
Cmd+Shift+D    open diff and verification view
Cmd+Shift+H    diagnose the last failed command with captured context
```

The shortcut handlers should call `harnessctl`, not embed orchestration logic in Lua.

## Failed-command diagnosis redesign

Capture:

- exact command
- exit code
- cwd
- start and end timestamps
- redacted stdout and stderr tail
- active project profile
- runtime versions
- changed files
- related process ID
- recent successful command
- current branch and dirty state

Store this as a structured local event with mode `0600`.

`harnessctl diagnose last` should generate a bounded diagnosis package for ChatGPT without exposing unrelated history or secrets.

## Delivery phases

### Phase 0: Freeze and baseline

Tasks:

- back up Kaku configuration
- inventory custom Desktop Commander files
- capture current hashes
- capture startup benchmark
- capture connection leak benchmark
- document current tunnel behavior
- create threat model
- create new harness repository
- add CI and branch protection

Exit criteria:

- all current custom files are recoverable
- no untracked harness logic remains without a backup
- baseline report is committed

### Phase 1: Immediate security containment

Tasks:

- stop unauthenticated raw public exposure
- make official tunnel client the primary connection path
- require signed short-lived session credentials
- restrict CORS
- change logs to mode `0600`
- redact commands, arguments, file previews, stdout, and stderr
- replace `allowedDirectories: []` with session-scoped roots
- add capability profiles
- remove false credential-blocking message
- add explicit approvals for high-risk operations

Exit criteria:

- anonymous requests cannot initialize or call tools
- no secret values appear in logs
- a revoked session immediately loses access
- default ChatGPT session cannot read outside its project profile

### Phase 2: Transport and session rewrite

Tasks:

- replace SSE with Streamable HTTP
- implement stable logical sessions
- add reconnect and resume
- add heartbeat, TTL, and orphan reaper
- cap concurrent sessions
- use owned process groups
- remove `pkill -9 ngrok`
- replace fixed sleeps with readiness probes
- add graceful shutdown
- add daemon restart recovery

Exit criteria:

- active connection count returns to zero after disconnect
- one-hour soak test shows no orphan growth
- reconnect resumes the same logical session
- two Kaku windows can run independent sessions
- stopping one session does not affect another tunnel or process

### Phase 3: Shell and Kaku performance

Tasks:

- keep `.zshenv` minimal
- load Kaku code only inside Kaku
- source each integration once
- cache skill index
- remove repeated scans on `chpwd`
- detect installed agents dynamically
- generate Kaku config from a manifest
- add `harnessctl doctor`
- benchmark startup in CI

Exit criteria:

- harness-added shell overhead is below 80 ms p95
- full Kaku login shell is below 700 ms p95
- non-Kaku shells are not labeled as Kaku
- missing agent binaries do not create broken panes or commands

### Phase 4: Context and policy integration

Tasks:

- build project context resolver
- integrate Agent Kernel policy checks
- add project credential profiles
- add package-manager and runtime detection
- index repository instructions
- load only relevant skills
- create session context snapshots
- add policy decision logs

Exit criteria:

- ChatGPT enters the correct project with correct rules automatically
- wrong Supabase, Google Cloud, or Vercel profiles are blocked
- every command has a recorded policy decision
- project context refreshes deterministically

### Phase 5: Safe mutation workflow

Tasks:

- add worktree manager
- add checkpoints
- add diff generation
- add test-command registry
- add rollback
- add protected-path handling
- add explicit merge and push gates
- integrate Hunk for local visual diff review

Exit criteria:

- unrelated user changes are never overwritten
- every mutating session has a base commit and rollback path
- merge is blocked when required tests fail
- push requires an explicit approved action

### Phase 6: Subagents and parallel work

Tasks:

- define Delegate Team contract schema
- route read-only tasks in parallel
- create one worktree per mutating agent
- enforce path ownership
- aggregate structured results
- add conflict detection
- add cancellation and timeout
- add resource limits

Exit criteria:

- parallel agents cannot write to the same worktree
- failed agents leave recoverable logs and checkpoints
- final integration includes evidence from each subtask
- cancellation removes owned processes without killing unrelated work

### Phase 7: Observability and recovery

Tasks:

- append-only JSONL event journal
- local status dashboard
- per-session metrics
- redacted tool-call tracing
- startup and shutdown events
- crash bundles
- session replay summary
- recovery command
- retention and rotation policy

Exit criteria:

- any failure can be reconstructed from session ID
- logs contain no secret values
- daemon restart restores resumable session metadata
- stale artifacts are cleaned by policy

### Phase 8: Test program

Required suites:

- unit tests
- integration tests
- transport contract tests
- authentication tests
- authorization tests
- path-boundary tests
- secret-redaction tests
- process-tree cleanup tests
- reconnect tests
- multi-session tests
- shell-startup benchmarks
- one-hour and eight-hour soak tests
- crash-recovery tests
- worktree isolation tests
- subagent conflict tests
- upgrade and rollback tests

## Anti-regression gates

Every release must prove:

1. no anonymous MCP initialization
2. no unrestricted default filesystem profile
3. no log file above mode `0600`
4. no deprecated SSE transport in production code
5. zero orphan sessions after the disconnect grace period
6. no global `pkill` for tunnel or agent processes
7. no Kaku identity injection into non-Kaku shells
8. credential guard tests execute at the real enforcement boundary
9. no secret fixture appears in logs or tool results
10. every mutating task has a checkpoint and verification record

## Measurable service objectives

| Area | Target |
| --- | --- |
| Connect success | at least 99.5 percent across repeated local tests |
| Reconnect | under 3 seconds p95 |
| Session cleanup | under 5 seconds after disconnect |
| Orphan sessions | zero after cleanup window |
| Harness shell overhead | under 80 ms p95 |
| Full Kaku shell startup | under 700 ms p95 |
| Idle daemon memory | under 150 MB |
| One-hour memory growth | under 5 percent without active workload |
| Authentication failures | closed by default |
| Secret leakage test | zero matches |
| Wrong-project credential use | blocked deterministically |
| Mutating task recovery | complete checkpoint and rollback available |

## Definition of done

The harness is ready for normal use when:

- ChatGPT connects through an authenticated, revocable session.
- The connection is project-scoped by default.
- Long sessions do not accumulate transport objects.
- Multiple Kaku windows can operate independently.
- Agent Kernel policies are checked before tool execution.
- Skills are selected through a cached index.
- Repository changes happen in isolated worktrees.
- Subagents receive bounded contracts.
- Secrets remain local.
- Every change has a diff, test result, and rollback path.
- A daemon or tunnel restart does not lose the session record.
- The entire system can be installed, upgraded, diagnosed, and removed through `harnessctl`.

## Recommended first implementation sprint

Do not begin with the skill router or subagents.

Implement this exact order:

1. create the standalone repository
2. import current scripts as historical fixtures
3. add threat model and baseline tests
4. implement `harnessd` with authenticated Streamable HTTP
5. add session TTL and cleanup
6. add official tunnel client adapter
7. add redacted mode-0600 logging
8. add project-scoped capability profiles
9. implement `harnessctl connect`, `status`, `sessions`, `disconnect`, and `doctor`
10. replace the current `mcp-start` alias
11. run multi-session and one-hour soak tests
12. only then integrate Agent Kernel, skills, worktrees, and Delegate Team

## Final architectural decision

The system should not be a heavily modified Kaku configuration and should not be a collection of shell aliases.

It should be a local ChatGPT execution platform with:

- Kaku as the operator UI
- a dedicated harness daemon as the control plane
- Desktop Commander as one execution adapter
- Agent Kernel as the policy and memory authority
- Delegate Team as a bounded subagent runner
- Keychain as the secret authority
- Git worktrees as the mutation boundary
- structured logs and checkpoints as the recovery layer
