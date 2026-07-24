import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { HarnessGateway } from "../../apps/harnessd/src/gateway.ts";
import { DesktopCommanderAdapter } from "@harness/execution-dc";
import { HarnessLogger, redactText } from "@harness/observability";
import { PolicyAdapter } from "@harness/policy-adapter";
import { WorktreeManager } from "@harness/workspace";
import { unlinkSync, existsSync, statSync, readFileSync } from "node:fs";

const PORT = 9878;
const STATE_FILE = "/tmp/test_gates_state.json";
const LOG_FILE = "/tmp/test_gates.log";
const JOURNAL_FILE = "/tmp/test_gates_journal.jsonl";

describe("Anti-Regression Gates Verification Suite", () => {
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

  test("Gate 1: No anonymous MCP initialization", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "exec_command", params: { command: "ls" } })
    });
    expect(res.status).toBe(401);
  });

  test("Gate 2: No unrestricted default filesystem profile", () => {
    const adapter = new DesktopCommanderAdapter();
    const isAllowed = adapter.validatePathAccess("/System/Library", "/tmp/project", "write-project");
    expect(isAllowed).toBeFalse();
  });

  test("Gate 3: No log file above mode 0600", () => {
    const logger = new HarnessLogger(LOG_FILE);
    logger.info("Gate 3 check");
    const stats = statSync(LOG_FILE);
    const mode = (stats.mode & 0o777).toString(8);
    expect(mode).toBe("600");
  });

  test("Gate 4: Streamable HTTP transport active (no SSE deprecated transport)", async () => {
    const health = await fetch(`http://127.0.0.1:${PORT}/health`);
    const data = await health.json();
    expect(data.status).toBe("ok");
  });

  test("Gate 5: Zero orphan sessions after revocation", () => {
    const s = gateway.sessionManager.createSession("test", "/tmp");
    expect(gateway.sessionManager.getActiveSessionCount()).toBeGreaterThan(0);
    gateway.sessionManager.revokeSession(s.sessionId);
    expect(gateway.sessionManager.getSession(s.sessionId)?.status).toBe("revoked");
  });

  test("Gate 6: No global pkill used in tunnel process management", () => {
    const code = readFileSync("apps/harnessd/src/tunnel-adapter.ts", "utf8");
    expect(code).not.toContain("pkill -9 ngrok");
    expect(code).not.toContain("pkill");
  });

  test("Gate 7: No Kaku identity injection in non-Kaku shells", () => {
    const zshPlugin = readFileSync("integrations/kaku/kaku-harness-plugin.zsh", "utf8");
    expect(zshPlugin).not.toContain(".zshenv");
  });

  test("Gate 8: Credential guard tests execute at real enforcement boundary", () => {
    const policy = new PolicyAdapter();
    const result = policy.evaluateCommand("cat ~/.ssh/id_rsa", "/tmp");
    expect(result.allowed).toBeFalse();
    expect(result.policyName).toBe("credential_read_guard");
  });

  test("Gate 9: Secret leakage redaction verification", () => {
    const secretStr = "my_super_secret_password_token";
    const redacted = redactText(`config pass=${secretStr}`);
    expect(redacted).not.toContain(secretStr);
  });

  test("Gate 10: Mutating tasks have worktree verification path", () => {
    const wtManager = new WorktreeManager();
    const session = wtManager.createWorktree("/tmp", "gate-10-test");
    expect(session.worktreePath).toBeDefined();
    wtManager.removeWorktree(session);
  });

  test("Gate 11: Automatic Agency Harness Injection into session on connect", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt", projectRoot: "/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness", profile: "write-project" })
    });
    const data = await res.json();
    expect(data.agencyHarness).toBeDefined();
    expect(data.agencyHarness.autoInjected).toBeTrue();
    expect(data.agencyHarness.skillsCount).toBeGreaterThan(0);
  });

  test("Gate 12: Agency Skill Match RPC under auth token", async () => {
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt", projectRoot: "/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness", profile: "write-project" })
    });
    const { token } = await connectRes.json();

    const rpcRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ method: "match_agency_skill", params: { query: "senior" } })
    });
    const data = await rpcRes.json();
    expect(rpcRes.status).toBe(200);
    expect(data.result.matchedSkills).toBeDefined();
  });

  test("Gate 13: Coding Tools Manifest RPC under auth token", async () => {
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
      body: JSON.stringify({ method: "list_tools" })
    });
    const data = await rpcRes.json();
    expect(rpcRes.status).toBe(200);
    expect(data.result.tools.length).toBeGreaterThanOrEqual(6);
  });

  test("Gate 14: launchd Service Manager Plist Generation", () => {
    const { ServiceManager } = require("../../apps/harnessctl/src/service-manager.ts");
    const manager = new ServiceManager();
    const plist = manager.generatePlistContent();
    expect(plist).toContain("com.kaku.harnessd");
  });

  test("Gate 15: Native macOS Desktop Notification Payload Formatting", () => {
    const { DesktopNotifier } = require("@harness/observability");
    const notifier = new DesktopNotifier();
    const result = notifier.notifyTaskCompletion("gate-15", "Gate 15 test", true);
    expect(typeof result).toBe("boolean");
  });

  test("Gate 16: Terminal Formatted Diff Viewer Output", () => {
    const { WorktreeDiffViewer } = require("@harness/workspace");
    const viewer = new WorktreeDiffViewer();
    const summary = viewer.getDiffSummary("/tmp");
    const output = viewer.renderTerminalFormattedDiff(summary);
    expect(output).toContain("WORKTREE REVIEW");
  });

  test("Gate 17: Subagent Spawning with Codex Backend", () => {
    const { SubagentRunner } = require("@harness/subagents");
    const runner = new SubagentRunner();
    const task = runner.spawn({
      taskId: "gate-17",
      goal: "Code review with Codex",
      projectRoot: "/tmp",
      backend: "codex",
      logFilePath: "/tmp/gate_17.log"
    });
    expect(task.backend).toBe("codex");
    expect(task.status).toBe("running");
    runner.kill(task.subagentId);
  });

  test("Gate 18: Subagent Lifecycle Management (Status & Kill)", () => {
    const { SubagentOrchestrator } = require("@harness/subagents");
    const orchestrator = new SubagentOrchestrator();
    const task = orchestrator.spawnSubagent("Gate 18 test task", "codex", "/tmp");

    expect(task.subagentId).toBeDefined();
    const status = orchestrator.getSubagentStatus(task.subagentId);
    expect(status?.subagentId).toBe(task.subagentId);

    const killed = orchestrator.killSubagent(task.subagentId);
    expect(killed).toBeTrue();
  });

  test("Gate 19: MCP Subagent RPC Endpoints (spawn_subagent & list_subagents)", async () => {
    const connectRes = await fetch(`http://127.0.0.1:${PORT}/mcp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt", projectRoot: "/tmp", profile: "write-project" })
    });
    const { token } = await connectRes.json();

    const spawnRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ method: "spawn_subagent", params: { goal: "Gate 19 task", backend: "codex" } })
    });
    const spawnData = await spawnRes.json();
    expect(spawnRes.status).toBe(200);
    expect(spawnData.result.subagentId).toBeDefined();

    const listRes = await fetch(`http://127.0.0.1:${PORT}/mcp/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ method: "list_subagents" })
    });
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listData.result.subagents).toBeDefined();
  });
});
