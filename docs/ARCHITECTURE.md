# Architecture

## Current executable core

```text
ChatGPT or harnessctl
  -> loopback HTTP gateway
  -> bootstrap or lease authentication
  -> JSON-RPC protocol boundary
  -> session lease lookup
  -> policy adapter
  -> local execution adapter
       - fs.readText
       - fs.list
       - process.run
  -> redacted mode 0600 event log
```

Kaku Terminal is the operator interface. `harnessd` is the local control plane. `harnessctl` is an HTTP client for lifecycle and diagnostics.

## Components

### harnessd

`apps/harnessd` owns HTTP routing, authentication, request size limits, JSON-RPC dispatch, session revocation, and health reporting. It does not implement filesystem or process operations directly.

### harnessctl

`apps/harnessctl` performs real health checks and lease operations. It stores the active lease under `~/.kaku-harness/session.json` with mode `0600` and never prints the session token.

### session-core

`packages/session-core` issues bounded leases with one client, project root, profile, expiry, and random token. It enforces session capacity, token validation, revocation, and expiry cleanup.

### protocol

`packages/protocol` validates JSON-RPC 2.0 requests and produces standard success and error envelopes.

### policy-adapter

`packages/policy-adapter` evaluates profiles, command rules, and project path containment. Existing paths are resolved through `realpath`; missing targets are anchored to their nearest existing ancestor. This blocks sibling-prefix and symlink escapes.

### execution-local

`packages/execution-local` implements the current tool allowlist. Process execution uses an executable plus an argument array with `shell: false`. Project-scoped commands run inside a macOS `sandbox-exec` profile that limits filesystem access to the authenticated project and an isolated temporary directory, strips daemon secrets from the child environment, and terminates the entire process group on timeout or output overflow.

### runtime deployment

`scripts/runtime-manager.ts` verifies clean committed source, runs all release gates, records the source commit, swaps runtime releases atomically, manages the Kaku and launchd integrations, verifies the deployed commit through `/health`, and restores the previous release and integrations when activation fails.

### observability

`packages/observability` writes structured JSONL events with mode `0600`. Sensitive values are removed from messages and recursively from context keys such as token, secret, password, authorization, and API key.

## Request sequence

```text
1. Client requests a lease with the bootstrap bearer token.
2. Daemon validates content type, size, input shape, project root, and profile.
3. Daemon returns a random session token and scoped endpoint.
4. Client sends a JSON-RPC request with the session bearer token.
5. Daemon validates the lease and JSON-RPC envelope.
6. Policy evaluates the requested path, command, and capability profile.
7. The local executor performs the allowlisted action.
8. Daemon returns a JSON-RPC result or structured error.
9. Security-relevant events are written without credentials.
```

## Trust boundaries

- Loopback HTTP is a transport boundary, not proof of user identity.
- The bootstrap token authorizes lease creation.
- The lease token authorizes one scoped session.
- Project scope and profile are server-enforced, not client hints.
- A public tunnel requires an additional authenticated gateway before traffic reaches `harnessd`.

## Planned layers

The following are separate milestones and are not represented as completed components:

- Durable SQLite session and recovery journal
- macOS Keychain secret broker
- Authenticated remote tunnel identity
- Worktree ownership and cleanup manager
- Structured subagent task contracts
- Operator approval UI for elevated operations
