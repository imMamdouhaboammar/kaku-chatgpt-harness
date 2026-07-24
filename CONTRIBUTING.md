# Contributing to Kaku ChatGPT Harness

Thank you for your interest in contributing to the **Kaku ChatGPT Native Local Harness**!

## Development Setup

1. Prerequisites:
   - macOS (Ventura or newer recommended)
   - [Bun](https://bun.sh) `v1.1+` (Mandatory runtime & package manager)
   - Kaku Terminal Application (`/Applications/Kaku.app`)

2. Clone & Install:
   ```bash
   git clone https://github.com/mamdouhaboammar/Kaku-ChatGPT-Harness.git
   cd Kaku-ChatGPT-Harness
   bun install
   ```

3. Run Tests:
   ```bash
   bun test
   ```

## Pull Request Guidelines

- All PRs must maintain 100% test passing status.
- Follow **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`).
- Code changes must adhere to security constraints (redacted mode `0600` logs, project-bound capabilities).
- PR reviews are responded to within 24 hours.

## Security Disclosures

If you discover a security vulnerability, please do NOT create a public issue. Report it directly to the maintainer via private security advisory.
