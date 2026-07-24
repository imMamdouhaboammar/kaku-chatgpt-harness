import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { HarnessGateway } from "../../apps/harnessd/src/gateway.ts";
import { unlinkSync, existsSync } from "node:fs";

const PORT = 9880;
const STATE_FILE = "/tmp/test_gateway_subagent_state.json";
const LOG_FILE = "/tmp/test_gateway_subagent.log";
const JOURNAL_FILE = "/tmp/test_gateway_subagent_journal.jsonl";

describe("Gateway Subagent Integration Flow (TDD)", () => {
  let gateway: HarnessGateway;
  let token: string;

  beforeAll(async () => {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
    if (existsSync(JOURNAL_FILE)) unlinkSync(JOURNAL_FILE);

    gateway = new HarnessGateway({
      port: PORT,
      stateFilePath: STATE_FILE,
      logFilePath: LOG_FILE,
      journalFilePath: JOURNAL_FILE
    });
    gateway.start();

    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt", projectRoot: "/tmp", profile: "write-project" })
    });
    const connectData = await connectRes.json();
    token = connectData.token;
  });

  afterAll(() => {
    gateway.stop();
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
    if (existsSync(JOURNAL_FILE)) unlinkSync(JOURNAL_FILE);
  });

  test("spawn_subagent_rpc_creates_background_task", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        method: "spawn_subagent",
        params: {
          goal: "Run test build",
          backend: "codex",
          mode: "read-only"
        }
      })
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.result.subagentId).toBeDefined();
    expect(data.result.backend).toBe("codex");
  });

  test("list_subagents_rpc_returns_active_tasks", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ method: "list_subagents" })
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.result.subagents).toBeDefined();
  });
});
