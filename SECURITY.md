# Security Policy

## Security Model

The **Kaku ChatGPT Native Harness** enforces explicit trust boundaries for remote AI execution:
- **Authentication**: All MCP RPC calls require signed HMAC session bearer tokens.
- **Path Boundaries**: Execution and file operations are strictly bound to the active session project root unless `full-local` profile is granted.
- **Secret Protection**: macOS Keychain references (`secret://`) inject credentials into target environments without exposing values to logs or ChatGPT.
- **Private Logs**: Log files enforce mode `0600` file permissions.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it confidentially via GitHub Security Advisories or by contacting the maintainer.
