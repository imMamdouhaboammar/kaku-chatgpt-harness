import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { HarnessGateway } from "../../apps/harnessd/src/gateway.ts";
import { unlinkSync, existsSync } from "node:fs";

const PORT = 9876;
const STATE_FILE = "/tmp/test_gateway_flow_state.json";
const LOG_FILE = "/tmp/test_gateway_flow.log";
const JOURNAL_FILE = "/tmp/test_gateway_flow_journal.jsonl";

describe("Gateway Integration Flow", () => {
  let gateway: HarnessGateway;

  beforeAll(() => {
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
  });

  afterAll(() => {
    gateway.stop();
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
    if (existsSync(JOURNAL_FILE)) unlinkSync(JOURNAL_FILE);
  });

  test("full_connect_auth_rpc_flow_succeeds", async () => {
    // 1. Health check
    const healthRes = await fetch(`http://127.0.0.1:${PORT}/health`);
    const healthData = await healthRes.json();
    expect(healthRes.status).toBe(200);
    expect(healthData.status).toBe("ok");

    // 2. Connect & get session token
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: "chatgpt",
        projectRoot: "/tmp",
        profile: "write-project"
      })
    });

    const connectData = await connectRes.json();
    expect(connectRes.status).toBe(200);
    expect(connectData.sessionId).toBeDefined();
    expect(connectData.token).toBeDefined();

    const token = connectData.token;

    // 3. Perform RPC command execution
    const rpcRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        method: "exec_command",
        params: {
          command: "echo 'hello harness'",
          cwd: "/tmp"
        }
      })
    });

    const rpcData = await rpcRes.json();
    expect(rpcRes.status).toBe(200);
    expect(rpcData.result.exitCode).toBe(0);
    expect(rpcData.result.stdout).toContain("hello harness");
  });
});
