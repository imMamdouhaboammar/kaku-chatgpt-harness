# Secure Executable Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an authenticated, project-scoped harness daemon that validates JSON-RPC requests, enforces policy before execution, exposes truthful CLI lifecycle commands, and passes type, unit, integration, and security gates.

**Architecture:** Keep `harnessd` as the HTTP control plane, but split request validation and tool execution into focused packages. Sessions issue short-lived leases only after bootstrap authentication, policy evaluates normalized real paths and structured commands, and a local execution adapter implements a minimal allowlisted tool set. `harnessctl` talks to the daemon instead of printing simulated state.

**Tech Stack:** Bun 1.3.14, TypeScript 5.9, Bun test, Bun HTTP server, Node filesystem and child process APIs.

## Global Constraints

- Development source is `/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness`.
- Installed runtime is `/Users/mamdouhaboammar/kaku-chatgpt-harness` and must not be changed until every gate passes.
- Bun is the mandatory runtime and package manager.
- Default network binding is `127.0.0.1`.
- Logs must remain redacted and mode `0600`.
- Default capability is `project-write`; `full-local` requires explicit server configuration.
- Every tool request must pass authentication, schema validation, and policy evaluation before execution.
- Tests use temporary directories and never write outside their fixtures.

---

## File Structure

- `packages/protocol/src/index.ts`: JSON-RPC request parsing, typed errors, and response helpers.
- `packages/execution-local/src/index.ts`: allowlisted filesystem and process tools with bounded output.
- `packages/session-core/src/index.ts`: lease creation, bootstrap authorization inputs, TTL, capacity, and revocation.
- `packages/policy-adapter/src/index.ts`: path containment, symlink-aware checks, profile rules, and command policy.
- `apps/harnessd/src/index.ts`: HTTP routing and orchestration only.
- `apps/harnessctl/src/index.ts`: real daemon health, connect, status, and disconnect calls.
- `tests/integration/daemon-live.test.ts`: live server auth and tool execution flow.
- `tests/security/security-gates.test.ts`: traversal, unauthorized profile, secret logging, and command denial regressions.

### Task 1: Restore strict TypeScript validation

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Test: `package.json` scripts

**Interfaces:**
- Produces: `bun run typecheck` with exit code 0.

- [ ] Add `"typecheck": "tsc --noEmit"` to root scripts.
- [ ] Replace the unresolved `bun-types` root reference with the installed Bun type entrypoint.
- [ ] Run `bun install --frozen-lockfile`.
- [ ] Run `bun run typecheck`; expected result is exit code 0 with no diagnostics.
- [ ] Run `bun test`; expected result is all baseline tests passing.
- [ ] Commit with `fix: restore strict type validation`.

### Task 2: Harden session issuance and lifecycle

**Files:**
- Modify: `packages/session-core/src/index.ts`
- Modify: `packages/session-core/test/session.test.ts`

**Interfaces:**
- Produces: `CreateSessionInput`, `SessionManager.createSession(input)`, `SessionManager.revokeSession(id)`, and bounded active-session behavior.

- [ ] Write tests that reject empty clients, non-absolute project roots, unsupported profiles, and capacity overflow.
- [ ] Write tests proving tokens are compared safely, expired leases are deleted, and revocation changes validation to false.
- [ ] Implement normalized inputs, configurable `maxSessions`, and profile allowlisting.
- [ ] Remove global mutable client identity as the source of request identity; derive client information from the authenticated lease.
- [ ] Run `bun test packages/session-core/test/session.test.ts` and verify all cases pass.
- [ ] Commit with `feat: harden session lifecycle`.

### Task 3: Make policy path checks boundary-safe

**Files:**
- Modify: `packages/policy-adapter/src/index.ts`
- Modify: `packages/policy-adapter/test/policy.test.ts`

**Interfaces:**
- Produces: `PolicyAdapter.evaluate(request)` with path-segment-aware containment and structured denial codes.

- [ ] Add failing tests for `/app-secret` against `/app`, `../` traversal, symlink escape, read-only execution, and disallowed full-local use.
- [ ] Normalize root and target with `realpath` when paths exist, and use `relative()` for containment.
- [ ] Return stable denial codes such as `PATH_OUTSIDE_PROJECT`, `PROFILE_DENIED`, and `COMMAND_DENIED`.
- [ ] Require an explicit server option before accepting `full-local`.
- [ ] Run the policy tests and the complete suite.
- [ ] Commit with `security: enforce project path boundaries`.

### Task 4: Add a typed JSON-RPC protocol boundary

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/test/protocol.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `parseJsonRpcRequest(value)`, `jsonRpcResult(id, result)`, and `jsonRpcError(id, code, message, data?)`.

- [ ] Write failing tests for malformed JSON, missing `jsonrpc`, missing method, invalid params, notification requests, and preserved request IDs.
- [ ] Implement a small parser without accepting unknown top-level request shapes.
- [ ] Map parse, invalid request, method not found, invalid params, and internal errors to standard JSON-RPC codes.
- [ ] Run package tests and root typecheck.
- [ ] Commit with `feat: add json rpc protocol boundary`.

### Task 5: Implement minimal real execution tools

**Files:**
- Create: `packages/execution-local/package.json`
- Create: `packages/execution-local/src/index.ts`
- Create: `packages/execution-local/test/execution.test.ts`

**Interfaces:**
- Consumes: authenticated `SessionLease` and `PolicyAdapter.evaluate()`.
- Produces: `LocalExecutor.execute(toolName, args, lease)` for `fs.readText`, `fs.list`, and `process.run`.

- [ ] Write failing tests for reading an in-project file, listing an in-project directory, and executing a harmless command in the project cwd.
- [ ] Write denial tests for outside paths, excessive output, command timeout, unknown tools, and non-zero exits.
- [ ] Implement bounded UTF-8 output, fixed maximum bytes, fixed timeout, and no shell interpolation by default.
- [ ] Ensure every operation asks the policy adapter before touching the filesystem or spawning a process.
- [ ] Run package tests, security tests, and root typecheck.
- [ ] Commit with `feat: execute allowlisted local tools`.

### Task 6: Secure and orchestrate the daemon

**Files:**
- Modify: `apps/harnessd/src/index.ts`
- Modify: `apps/harnessd/test/daemon.test.ts`
- Create: `tests/integration/daemon-live.test.ts`

**Interfaces:**
- Consumes: protocol parser, session manager, policy adapter, local executor, and redacted logger.
- Produces: authenticated `/mcp/v1/auth`, `/mcp/v1/session/:id`, `/health`, and session revocation endpoints.

- [ ] Add tests requiring `HARNESS_BOOTSTRAP_TOKEN` for lease issuance.
- [ ] Add tests that reject caller-selected `full-local` unless enabled by server configuration.
- [ ] Replace the placeholder `EXECUTED` response with actual JSON-RPC dispatch.
- [ ] Return truthful health data including process ID, version, uptime, active session count, and no raw secrets.
- [ ] Add request size limits, method checks, content-type validation, and consistent JSON responses.
- [ ] Run live integration tests against an ephemeral port.
- [ ] Commit with `feat: wire authenticated tool execution`.

### Task 7: Make harnessctl operate the real daemon

**Files:**
- Modify: `apps/harnessctl/src/index.ts`
- Modify: `apps/harnessctl/test/cli.test.ts`

**Interfaces:**
- Produces: `doctor`, `status`, `connect`, and `disconnect` commands backed by HTTP responses.

- [ ] Add tests with an injected fetch implementation for healthy, unavailable, unauthorized, and revoked-session cases.
- [ ] Make `status` read `/health` instead of printing the CLI PID.
- [ ] Make `connect` call the authenticated lease endpoint and write session metadata to a mode `0600` local state file without printing the token.
- [ ] Make `disconnect` revoke the selected session and remove matching local state.
- [ ] Make `doctor` verify the daemon endpoint and actual log mode instead of hardcoded success.
- [ ] Run CLI tests and root typecheck.
- [ ] Commit with `feat: connect cli to harness daemon`.

### Task 8: Add security and regression gates

**Files:**
- Create: `tests/security/security-gates.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Create: `SECURITY.md`

**Interfaces:**
- Produces: `bun run verify` as the pre-deploy gate.

- [ ] Add tests for bootstrap token rejection, profile escalation, sibling-prefix path escape, symlink escape, command denial, log token leakage, and oversized requests.
- [ ] Add scripts for `typecheck`, `test`, `build`, and `verify`.
- [ ] Document the exact development-to-runtime deployment flow and rollback rule.
- [ ] Document supported trust boundaries and the fact that remote exposure requires a separate authenticated tunnel.
- [ ] Run `bun run verify`; expected result is zero failures.
- [ ] Commit with `test: add secure harness verification gates`.

### Task 9: Deploy with ownership and rollback

**Files:**
- Create: `install.sh`
- Create: `uninstall.sh`
- Create: `integrations/kaku/harness.zsh`
- Modify: `README.md`

**Interfaces:**
- Produces: deterministic installation from a verified Git commit into `/Users/mamdouhaboammar/kaku-chatgpt-harness`.

- [ ] Write a dry-run installer test using a temporary destination.
- [ ] Refuse installation when the Git working tree is dirty or `bun run verify` fails.
- [ ] Record the source commit in the installed runtime manifest.
- [ ] Stop only the daemon owned by the prior runtime manifest, then atomically switch releases.
- [ ] Start the new daemon, probe `/health`, and roll back automatically if the probe fails.
- [ ] Keep the previous release available for explicit rollback.
- [ ] Commit with `feat: add verified runtime deployment`.

## Plan Self-Review

- The milestone covers every P0 finding needed before real tool execution: authentication, policy enforcement, project scope, truthful session state, private logs, and regression gates.
- Long-term worktree management, Keychain integration, remote tunnel identity, subagent orchestration, and durable SQLite journals remain separate milestones after this executable core.
- No task requires editing the installed runtime before verification succeeds.
- All public interfaces are named before downstream tasks consume them.
