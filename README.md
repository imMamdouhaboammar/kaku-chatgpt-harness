# Kaku ChatGPT Harness

A local control plane for authenticated ChatGPT coding sessions on macOS through Kaku Terminal.

The project separates development source from the installed runtime:

- Development source: the repository root containing this README
- Installed runtime: `${HOME}/kaku-chatgpt-harness` by default, or the path supplied to the installer

Do not edit the installed runtime by hand. Develop and verify changes in the source repository, then install a verified commit.


<!-- project-story:start -->
<details open>
  <summary><strong>Problem to project: Why I built Kaku ChatGPT Harness</strong></summary>
  <br />
  <p align="center"><img src="https://raw.githubusercontent.com/imMamdouhaboammar/imMamdouhaboammar/main/assets/profile/project-badges.svg" width="488" alt="Real friction, building in public, daily pulse" /></p>
  <table>
    <tr>
      <td width="104" align="center" valign="middle"><img src="./assets/readme/project-mark.svg" width="76" alt="Kaku ChatGPT Harness repository mark" /></td>
      <td valign="middle"><strong>Kaku ChatGPT Harness</strong><br />A project-scoped local control plane for authenticated ChatGPT coding sessions through Kaku Terminal on macOS.</td>
    </tr>
  </table>
  <table>
    <tr>
      <td width="50%" valign="top"><strong>Recurring problem</strong><br />Remote terminal access becomes unsafe and unreliable when sessions lack clear authentication, project boundaries, capability policies, and regression tests.</td>
      <td width="50%" valign="top"><strong>Practical goal</strong><br />Give ChatGPT a bounded local coding path with short-lived leases, safe process execution, private logs, verification, and rollback.</td>
    </tr>
    <tr>
      <td width="50%" valign="top"><strong>Built for</strong><br />macOS developers connecting ChatGPT to Kaku Terminal for controlled local repository work.</td>
      <td width="50%" valign="top"><strong>Search terms</strong><br />ChatGPT local coding harness · Kaku Terminal MCP · project scoped terminal access · authenticated coding session</td>
    </tr>
  </table>
  <p><strong>Daily build pulse</strong></p>
  <ul>
      <li>1 commit landed: feat(harness): integrate jcode architecture, ACP state, prompt cache, confidence steppi….</li>
      <li>Daily summary covers 1 public activity item from the last 7 days.</li>
      <li>Documentation and project status remain aligned with the repository’s current public state.</li>
  </ul>
</details>
<!-- project-story:end -->

## Current scope

The executable core currently provides:

- A Bun HTTP daemon bound to `127.0.0.1` by default
- Bootstrap authentication before session creation
- Short-lived project-scoped session leases
- JSON-RPC request validation
- Project boundary and capability policy checks
- Three local tools: `fs.readText`, `fs.list`, and `process.run`
- Process execution without shell interpolation
- macOS sandbox isolation for project-scoped commands, with host-file and network denial, sanitized child environments, and process-group termination
- Bounded process output and command timeouts
- Verified atomic runtime installation, health probing, rollback, and integration restoration
- Redacted mode `0600` JSONL logs
- A real `harnessctl` client for doctor, status, connect, and disconnect
- Unit, integration, and security regression tests

This repository does not yet claim completion of authenticated public tunneling, Keychain-backed secret brokering, durable SQLite session journals, automatic worktree management, or subagent orchestration.

## Requirements

- macOS
- Bun 1.3.14 or newer
- Kaku Terminal at `/Applications/Kaku.app`
- Agent Kernel at `~/.agent-kernel`

## Development setup

```bash
cd /path/to/Kaku-ChatGPT-Harness
bun install --frozen-lockfile
bun run verify
```

`bun run verify` runs strict TypeScript validation, the complete test suite, and Bun-targeted production bundling.

Individual gates:

```bash
bun run typecheck
bun test
bun run test:integration
bun run test:security
bun run build
```

## Start the development daemon

Set a private bootstrap token in the daemon and CLI environment:

```bash
export HARNESS_BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
export HARNESS_LOG_PATH="/tmp/harnessd_daemon.log"
bun run dev:daemon
```

The daemon refuses to start when `HARNESS_BOOTSTRAP_TOKEN` is missing.

## Use harnessctl

In a second terminal with the same bootstrap token:

```bash
bun run apps/harnessctl/src/index.ts doctor
bun run apps/harnessctl/src/index.ts status
bun run apps/harnessctl/src/index.ts connect chatgpt --project "$PWD"
bun run apps/harnessctl/src/index.ts disconnect
```

`connect` stores the active lease in:

```text
~/.kaku-harness/session.json
```

The state file is written atomically with mode `0600`. The CLI never prints the session token.

## HTTP flow

1. `POST /mcp/v1/auth` with the bootstrap bearer token creates a lease.
2. The lease binds one client, one absolute project root, one capability profile, and one expiry.
3. `POST /mcp/v1/session/:sessionId` requires the lease bearer token.
4. JSON-RPC requests are parsed before dispatch.
5. Every filesystem or process operation is evaluated by the policy adapter.
6. `DELETE /mcp/v1/session/:sessionId` revokes the lease.

Supported JSON-RPC methods:

- `ping`
- `notifications/initialized`
- `tools/list`
- `tools/call`

## Capability profiles

- `read-only`: permits file reads and directory listing only
- `project-write`: permits the current tool set inside the authenticated project
- `full-local`: disabled unless the daemon starts with `HARNESS_ALLOW_FULL_LOCAL=1`

`full-local` must not be enabled for a publicly reachable endpoint.

## Security model

The daemon is a high-trust local service. Its main boundaries are:

- Loopback binding by default
- Bootstrap authentication before lease issuance
- Separate random token for each lease
- Absolute project scope stored on the lease
- Symlink-aware path containment
- No shell expansion for process arguments
- Output and request size limits
- Redacted private logs

A tunnel is not a security boundary by itself. Any remote exposure must add authenticated transport, endpoint ownership, expiry, and explicit project scope before forwarding traffic to the daemon.

See [`SECURITY.md`](./SECURITY.md) for reporting and operational guidance.

## Development to runtime flow

Keep development and runtime separate. The installer refuses a dirty Git tree, runs `bun run verify`, records the exact source commit, swaps releases atomically, starts the managed LaunchAgent, and checks that `/health` reports the same commit.

Install or update the runtime:

```bash
./install.sh
```

Preview verification without changing the runtime:

```bash
./install.sh --dry-run --no-start
```

Roll back by swapping the current and previous managed releases:

```bash
./install.sh --rollback
```

Remove the current runtime, previous release, managed LaunchAgents, Kaku plugin, CLI wrapper, and private session state:

```bash
./uninstall.sh
```

Optional location flags are `--destination`, `--home`, and `--port`. Bootstrap secrets are accepted only through `HARNESS_BOOTSTRAP_TOKEN` or the private file `~/.kaku-harness/bootstrap-token`; they are intentionally rejected as command-line arguments.

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the container and request sequence diagrams.

## License

MIT. See [`LICENSE`](./LICENSE).
