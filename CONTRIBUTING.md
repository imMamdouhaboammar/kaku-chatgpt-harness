# Contributing to Kaku ChatGPT Harness

Thank you for your interest in contributing to the **Kaku ChatGPT Native Harness**!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/mamdouhaboammar/kaku-chatgpt-harness.git
   cd kaku-chatgpt-harness
   ```

2. Install dependencies using **Bun**:
   ```bash
   bun install
   ```

3. Run the test suite:
   ```bash
   bun test tests/
   ```

## Development Guidelines

- **Clean Code Guard**: All pull requests must adhere to `clean-code-guard` rules (functions ≤ 20 lines, max 4 parameters, intent-revealing names, specific error handling).
- **Test-Driven Development (TDD)**: Write a failing test before implementing new features or bug fixes.
- **Log Security**: All session log files must use strict `0600` permissions, and secrets must be redacted using `@harness/observability`.
