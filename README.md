# Kaku + MCP-Start: ChatGPT-Native Local Harness 🚀

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/mamdouhaboammar/Kaku-ChatGPT-Harness)
[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/mamdouhaboammar/Kaku-ChatGPT-Harness)
[![Runtime](https://img.shields.io/badge/runtime-Bun_1.3.14-black.svg?logo=bun)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](./LICENSE)
[![Security Hardened](https://img.shields.io/badge/security-mode_0600_logs-red.svg)](#security--capability-profiles)

> A production-grade, secure, and recoverable local control plane enabling ChatGPT to interact with macOS via Kaku Terminal, Agent Kernel governance, and Model Context Protocol (MCP).

---

## ⚡ Quick Start

```bash
# 1. Clone & install with Bun
git clone https://github.com/mamdouhaboammar/Kaku-ChatGPT-Harness.git
cd Kaku-ChatGPT-Harness
bun install

# 2. Run diagnostics check
bun dev:cli doctor

# 3. Connect current project workspace to ChatGPT
bun dev:cli connect chatgpt --project "$PWD"
```

---

## ✨ Features Matrix

| Feature | Description | Benefit |
| :--- | :--- | :--- |
| **Daemon Architecture** | Persistent local control daemon (`harnessd`) | Eliminates window-dependent state loss |
| **Streamable HTTP MCP** | Production MCP gateway transport | Replaces deprecated SSE with lower latency |
| **Mode 0600 Logging** | Redacted file logging with private file masks | Zero secret leakage in stdout/stderr logs |
| **Agent Kernel Governance**| Project rules & capability profiles | Enforces policy boundaries before execution |
| **Git Worktrees** | Automated isolated mutation boundaries | Prevents accidental overwrites of user work |
| **CLI Management** | `harnessctl` operator interface | Single control point for sessions & health |

---

## 📐 Architecture (C4 Model)

```mermaid
graph TD
    subgraph Remote["Remote Client"]
        ChatGPT["ChatGPT / Custom GPT"]
    end

    subgraph macOS["macOS Local System (Control Plane)"]
        subgraph Gateway["MCP Gateway / Gateway Auth"]
            GatewayAuth["Authenticated Streamable HTTP"]
        end

        subgraph Daemon["harnessd Daemon"]
            SessionMgr["Session & Lease Manager"]
            PolicyAdapter["Agent Kernel Policy Adapter"]
            ObsEngine["Observability & Redacted Log (Mode 0600)"]
        end

        subgraph Adapters["Execution Adapters"]
            DesktopCmd["Desktop Commander MCP"]
            WorktreeMgr["Git Worktree Manager"]
            KeychainBroker["macOS Keychain Broker"]
        end

        subgraph KakuUI["Kaku Operator UI"]
            Kaku["Kaku Terminal (zsh / kaku.lua)"]
        end
    end

    ChatGPT -->|Authenticated Transport| GatewayAuth
    GatewayAuth --> SessionMgr
    SessionMgr --> PolicyAdapter
    PolicyAdapter -->|Policy Passed| DesktopCmd
    PolicyAdapter -->|Isolate Mutation| WorktreeMgr
    PolicyAdapter -->|Resolve Secret Ref| KeychainBroker
    SessionMgr --> ObsEngine
    Kaku -->|Operator CLI (harnessctl)| SessionMgr
```

---

## 🔒 Security & Capability Profiles

The harness default profile enforces project scoping and explicit trust boundaries:

- **Token Authenticated**: Anonymous MCP requests are rejected by default.
- **Redacted Secret Logging**: Credentials are matched locally and replaced with `[REDACTED]`.
- **Private Log Masks**: Session logs are forced to permission mode `0600`.
- **Project Scoping**: File & execution tools are bound to the detected project root directory.

---

## 🤝 Contributing

We welcome community contributions! Please read our [Contributing Guide](./CONTRIBUTING.md) to get started.

---

## 📄 License

Distributed under the [MIT License](./LICENSE).
