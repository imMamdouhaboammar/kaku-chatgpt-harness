# Security Policy

## Supported code

Security fixes are accepted against the current default branch and active release branch. The installed runtime must identify the exact source commit used to create it.

## Reporting a vulnerability

Do not open a public issue for credentials exposure, authentication bypass, path escape, command injection, unsafe tunnel access, or arbitrary local execution.

Report the issue through a private GitHub security advisory for `imMamdouhaboammar/Kaku-ChatGPT-Harness`. Include:

- Affected commit or installed runtime manifest
- Reproduction steps
- Expected and observed behavior
- Required local access or network position
- Whether secrets, files, or process execution were exposed
- A minimal proof that does not damage user data

## Security invariants

The following conditions are release blockers:

- The daemon must bind to `127.0.0.1` unless an operator explicitly changes it.
- Session creation must require a configured bootstrap token.
- Session tokens must never be printed or stored in logs.
- Log files and CLI session state must use mode `0600`.
- Project-scoped profiles must reject sibling-prefix and symlink path escapes.
- Process execution must use executable and argument arrays without shell interpolation.
- Project-scoped process execution must fail closed without the macOS sandbox, deny network access, strip daemon credentials from child environments, and terminate whole process groups on limits.
- Every tool call must pass authentication, protocol validation, and policy evaluation.
- `full-local` must remain disabled by default.
- The installed runtime must come from a clean commit that passed `bun run verify`.

## Required verification

Run all gates before installation or release:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test:security
bun run test:integration
bun test
bun run build
```

The combined command is:

```bash
bun run verify
```

## Operational guidance

- Generate the bootstrap token locally and keep it out of shell history where possible.
- Do not place bootstrap or session tokens in command arguments, screenshots, tickets, or chat messages.
- Do not expose port `8765` directly to a public interface.
- Do not enable `HARNESS_ALLOW_FULL_LOCAL=1` for remote sessions.
- Revoke sessions after use and remove stale session state.
- Inspect `/tmp/harnessd_daemon.log` permissions and redaction behavior during incident review.

## Known scope limits

The current executable core does not yet provide a Keychain broker, authenticated public tunnel, durable session database, automatic process-tree recovery, or remote approval UI. Treat these as unavailable security controls, not implied features.
