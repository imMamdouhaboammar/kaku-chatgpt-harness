import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { HarnessGateway } from "../../apps/harnessd/src/gateway.ts";
import { unlinkSync, existsSync } from "node:fs";

const PORT = 9879;
const STATE_FILE = "/tmp/test_gateway_agency_state.json";
const LOG_FILE = "/tmp/test_gateway_agency.log";
const JOURNAL_FILE = "/tmp/test_gateway_agency_journal.jsonl";

describe("Gateway Agency Harness Integration Flow", () => {
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

  test("connect_auto_injects_agency_harness_into_session_response", async () => {
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: "chatgpt",
        projectRoot: "/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness",
        profile: "write-project"
      })
    });

    const data = await connectRes.json();
    expect(connectRes.status).toBe(200);
    expect(data.agencyHarness).toBeDefined();
    expect(data.agencyHarness.autoInjected).toBeTrue();
    expect(data.agencyHarness.skillsCount).toBeGreaterThan(0);
    expect(data.agencyHarness.codingTools.length).toBeGreaterThanOrEqual(6);
  });

  test("get_agency_harness_rpc_returns_harness_profile", async () => {
    // 1. Connect
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: "chatgpt",
        projectRoot: "/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness",
        profile: "write-project"
      })
    });
    const { token } = await connectRes.json();

    // 2. Query agency harness
    const rpcRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ method: "get_agency_harness" })
    });

    const rpcData = await rpcRes.json();
    expect(rpcRes.status).toBe(200);
    expect(rpcData.result.autoInjected).toBeTrue();
    expect(rpcData.result.skillsCount).toBeGreaterThan(0);
  });

  test("list_tools_rpc_returns_coding_tools_manifest", async () => {
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: "chatgpt",
        projectRoot: "/tmp",
        profile: "write-project"
      })
    });
    const { token } = await connectRes.json();

    const rpcRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ method: "list_tools" })
    });

    const rpcData = await rpcRes.json();
    expect(rpcRes.status).toBe(200);
    expect(rpcData.result.tools.length).toBeGreaterThanOrEqual(6);
  });
});
