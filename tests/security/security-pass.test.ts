import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { HarnessGateway } from "../../apps/harnessd/src/gateway.ts";
import { DesktopCommanderAdapter } from "@harness/execution-dc";
import { redactText, HarnessLogger } from "@harness/observability";
import { unlinkSync, existsSync, statSync } from "node:fs";

const PORT = 9877;
const STATE_FILE = "/tmp/test_sec_pass_state.json";
const LOG_FILE = "/tmp/test_sec_pass.log";
const JOURNAL_FILE = "/tmp/test_sec_pass_journal.jsonl";

describe("Security Pass Suite", () => {
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

  test("anonymous_rpc_request_is_rejected_with_401", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "exec_command", params: { command: "whoami" } })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  test("path_traversal_outside_project_root_is_blocked", () => {
    const adapter = new DesktopCommanderAdapter();
    const isAllowed = adapter.validatePathAccess("/etc/passwd", "/tmp/project", "write-project");
    expect(isAllowed).toBeFalse();
  });

  test("destructive_root_command_is_blocked_by_policy", async () => {
    // Obtain token
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt", projectRoot: "/tmp", profile: "write-project" })
    });
    const { token } = await connectRes.json();

    const rpcRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        method: "exec_command",
        params: { command: "rm -rf /", cwd: "/tmp" }
      })
    });

    expect(rpcRes.status).toBe(403);
    const data = await rpcRes.json();
    expect(data.error).toContain("Destructive root filesystem operation blocked");
  });

  test("log_file_permissions_are_strictly_mode_0600", () => {
    const logger = new HarnessLogger(LOG_FILE);
    logger.info("Security audit log");

    const stats = statSync(LOG_FILE);
    const mode = (stats.mode & 0o777).toString(8);
    expect(mode).toBe("600");
  });

  test("sensitive_token_leakage_is_redacted", () => {
    const sensitive = "Authorization: Bearer secret_token_123456789";
    const redacted = redactText(sensitive);
    expect(redacted).not.toContain("secret_token_123456789");
    expect(redacted).toContain("[REDACTED_SECRET]");
  });
});
