# Kaku + ChatGPT Native Local Harness 🚀

<div align="center">

![Tests](https://img.shields.io/badge/tests-62%20passing-brightgreen?style=for-the-badge&logo=bun)
![Release](https://img.shields.io/badge/release-v1.0.0-blue?style=for-the-badge&logo=github)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Runtime](https://img.shields.io/badge/runtime-Bun%20v1.3-black?style=for-the-badge&logo=bun)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?style=for-the-badge&logo=apple)
![Security](https://img.shields.io/badge/security-mode%200600%20%7C%20HMAC-success?style=for-the-badge&logo=shieldsio)
![Agency Agents](https://img.shields.io/badge/skills-60%2B%20agency%20agents-purple?style=for-the-badge)

<p align="center">
  <b>Production-Grade Local Execution Platform for ChatGPT & Kaku Terminal</b><br>
  <i>Streamable HTTP MCP Gateway • 60+ Auto-Injected Agency Agent Skills • Codex Subagents • Keychain Secret Broker • Git Worktree Isolation • launchd Background Automation</i>
</p>

</div>

---

## 📖 Overview & SEO Summary

**Kaku + ChatGPT-Native Local Harness** is an enterprise-grade open-source control plane daemon (`harnessd`) and operator CLI (`harnessctl`) connecting **ChatGPT** directly to **Kaku Terminal** on macOS. 

Designed with zero-trust security and low-latency performance, it replaces unauthenticated public HTTP/ngrok setups with **Streamable HTTP MCP transport**, **signed HMAC session credentials**, **macOS Keychain secret brokerage**, and **mode `0600` private logging**.

---

## ⚡ 1-Command Autopilot Installation

Install the complete harness and register the background service with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/imMamdouhaboammar/kaku-chatgpt-harness/main/install.sh | bash
```

Or clone and install manually:

```bash
git clone https://github.com/imMamdouhaboammar/kaku-chatgpt-harness.git
cd kaku-chatgpt-harness
./install.sh
```

---

## ✨ Features at a Glance

| Feature | Description | Status |
| :--- | :--- | :---: |
| 🔒 **Authenticated Streamable HTTP** | Signed HMAC session tokens replacing deprecated SSE & unauthenticated ngrok endpoints | ✅ Active |
| 🤖 **Auto-Injected Agency Harness** | Automatically attaches **60+ specialized Agency Agent skills** to every session | ✅ Active |
| 🛠️ **Coding Tools Manifest** | Controlled execution: safe shell commands, file inspection, multi-line edits, Git worktrees | ✅ Active |
| 🤖 **Codex Terminal Subagents** | Spawns background subagents via `delegate-team` with `codex`, `agy`, `opencode`, `gemini`, `minimax` | ✅ Active |
| 🛡️ **Keychain Secret Broker** | Resolves `secret://` references locally via macOS Keychain without exposing tokens in logs | ✅ Active |
| 🔐 **Mode 0600 Private Logs** | Strictly enforced private file permissions with automated secret pattern redactor | ✅ Active |
| ⚙️ **`launchd` Background Service** | Runs automatically on macOS user login with crash auto-recovery | ✅ Active |
| 📊 **Terminal Formatted Diff Review** | `harnessctl review` renders interactive diff summaries (+insertions / -deletions) before worktree merges | ✅ Active |

---

## 🏗️ Monorepo Architecture

```text
kaku-chatgpt-harness/
├── apps/
│   ├── harnessd/           Persistent local daemon & Streamable HTTP MCP Gateway
│   └── harnessctl/         Operator CLI entry point (start, status, doctor, connect, agency, service, subagent, review, notify)
├── packages/
│   ├── session-core/       HMAC signed session leases, capability profiles, TTL, orphan process reaper
│   ├── observability/     Mode 0600 JSONL logger, macOS desktop notifier, secret redactor, event journal
│   ├── secrets/           macOS Keychain secret broker (secret:// references, local env injection)
│   ├── policy-adapter/    Agent Kernel policy evaluator & command guard
│   ├── skill-index/       SQLite skill indexer, TF-IDF semantic router, Agency Agents auto-injection engine
│   ├── workspace/         Project context resolver, isolated Git worktree manager, terminal diff viewer
│   ├── subagents/         Delegate contract validator, multi-backend subagent runner (codex, agy, opencode)
│   └── execution-dc/      Session-scoped Desktop Commander execution adapter
├── integrations/
│   └── kaku/              Fast Zsh integration plugin & Kaku Lua keybindings
└── tests/                 62 unit, integration, security pass, and anti-regression gate tests
```

---

## 💻 CLI Reference (`harnessctl`)

```bash
# Check daemon health & active sessions
harnessctl status

# Run system doctor diagnostics
harnessctl doctor

# Connect a project session for ChatGPT (Auto-injects 60+ Agency Skills)
harnessctl connect chatgpt --project "$PWD"

# Inspect auto-injected Agency Harness profile
harnessctl agency --project "$PWD"

# Spawn a background Codex subagent task
harnessctl subagent spawn --backend codex --goal "Refactor database models"

# List running and completed subagents
harnessctl subagent list

# Render terminal visual diff summary before worktree merge
harnessctl review

# Send native macOS desktop notification
harnessctl notify "Build completed successfully"

# Manage macOS launchd background service
harnessctl service install
harnessctl service status
harnessctl service uninstall
```

---

## 🛡️ Security Model & Test Verification

All changes follow **Test-Driven Development (TDD)** and **clean-code-guard** imperatives.

```text
$ bun test tests/
✓ 62 pass, 0 fail (571ms across 17 test files)
```

---

## 🇸🇦 ملخص بالعربية (Arabic Summary)

منصة تشغيل داخلية متكاملة ومفتوحة المصدر (Open-Source) تُمكن **ChatGPT** من التحكم بـ **Kaku Terminal** وتوليد الـ Sub-agents واستخدام **Codex** و60+ مهارة برمجة متقدمة بأمر تثبيت واحد:

1. **تثبيت بأمر واحد**: تشغيل `./install.sh` يبني النظام ويُثبت خدمة الخلفية `launchd` تلقائياً.
2. **حزمة مهارات المطورين (60+ Agency Agent Skills)**: إدراج تلقائي لـ 60+ مهارة برمجية بمجرد الاتصال.
3. **تشغيل Subagents بخلفية التيرمينال وتكامل Codex**: توليد تشغيل فرعي ببيئات معزولة (Git Worktrees) عبر `codex` و `delegate-team`.
4. **أمان تام وحماية للأسرار**: تشفير HMAC، حجب الأسرار تلقائياً، وصلاحيات سجلات مشددة `0600`.

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](file:///Users/mamdouhaboammar/kaku-chatgpt-harness/LICENSE) for more information.
