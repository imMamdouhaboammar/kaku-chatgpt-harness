# Architecture & Design Specifications

This document outlines the software architecture for the **Kaku + MCP-Start ChatGPT-Native Local Harness** using the C4 Model.

## C4 Container Diagram

```mermaid
C4Container
    title Container Diagram for Kaku ChatGPT Harness

    Person(user, "Developer / Operator", "Uses Kaku Terminal to monitor and control local agent execution.")
    System_Ext(chatgpt, "ChatGPT Agent", "Remote LLM sending MCP tool requests over tunnel.")

    System_Boundary(harness_boundary, "Local Harness System") {
        Container(harnessctl, "harnessctl CLI", "TypeScript / Bun Commander", "Operator command line interface for managing sessions, status, and health.")
        Container(harnessd, "harnessd Daemon", "TypeScript / Bun", "Persistent daemon managing gateway, auth, session leases, and process trees.")
        ContainerDb(session_store, "Session & Policy Store", "In-Memory / SQLite", "Stores active leases, capabilities, and policy decision history.")
        Container(observability, "Observability Engine", "TypeScript Log Redactor", "Writes mode 0600 redacted structured event logs.")
    }

    System_Ext(agent_kernel, "Agent Kernel", "Governance & memory engine enforcing policies.")
    System_Ext(desktop_cmd, "Desktop Commander", "Execution adapter for shell and file operations.")

    Rel(chatgpt, harnessd, "Sends MCP tool requests", "Streamable HTTP / Auth Token")
    Rel(user, harnessctl, "Executes CLI commands", "sh / bun")
    Rel(harnessctl, harnessd, "IPC control & queries", "Local Unix Socket / HTTP")
    Rel(harnessd, session_store, "Reads/writes session state")
    Rel(harnessd, agent_kernel, "Validates execution policy")
    Rel(harnessd, desktop_cmd, "Dispatches approved actions")
    Rel(harnessd, observability, "Logs redacted events")
```

## C4 Sequence Diagram: Authenticated Execution Flow

```mermaid
sequenceDiagram
    autonumber
    participant ChatGPT as ChatGPT
    participant Gateway as harnessd (Gateway)
    participant Session as Session Core
    participant Policy as Policy Adapter (Agent Kernel)
    participant Obs as Observability Logger
    participant Exec as Desktop Commander

    ChatGPT->>Gateway: POST /mcp/v1/tools/call (Bearer Token)
    Gateway->>Session: Validate Lease & Token
    alt Invalid / Expired Token
        Session-->>Gateway: Unauthorized
        Gateway-->>ChatGPT: 401 Unauthorized
    else Valid Token
        Session-->>Gateway: Lease Active (Project Scoped)
        Gateway->>Policy: Evaluate Tool Call Policy
        alt Policy Rejected
            Policy-->>Gateway: Action Denied (Security Policy)
            Gateway->>Obs: Log Security Denial (Mode 0600)
            Gateway-->>ChatGPT: Tool Result: Denied
        else Policy Approved
            Policy-->>Gateway: Action Approved
            Gateway->>Exec: Dispatch Execution Command
            Exec-->>Gateway: Return Command Output
            Gateway->>Obs: Write Redacted Log Entry (Mode 0600)
            Gateway-->>ChatGPT: Tool Result: Success (Redacted)
        end
    end
```
