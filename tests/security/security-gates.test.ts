import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessDaemon } from "../../apps/harnessd/src/index";
import { LocalExecutor } from "../../packages/execution-local/src/index";
import { RedactedLogger } from "../../packages/observability/src/index";
import type { SessionLease } from "../../packages/session-core/src/index";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kaku-security-"));
  fixtures.push(root);
  return root;
}

describe("secure harness gates", () => {
  test("redacts session credentials from messages and nested context", () => {
    const root = fixture();
    const logPath = join(root, "security.log");
    const logger = new RedactedLogger(logPath);
    const sessionToken = "harness_1234567890abcdef1234567890abcdef";

    logger.log("SECURITY", `Rejected Bearer ${sessionToken}`, "session-1", {
      auth: { token: sessionToken },
      request: { authorization: `Bearer ${sessionToken}` }
    });

    const log = readFileSync(logPath, "utf8");
    expect(log).not.toContain(sessionToken);
    expect(log).toContain("[REDACTED_SECRET]");
    expect((statSync(logPath).mode & 0o777).toString(8)).toBe("600");
  });

  test("refuses to start without bootstrap authentication", () => {
    const root = fixture();
    const daemon = new HarnessDaemon({ port: 0, bootstrapToken: "", logPath: join(root, "daemon.log") });

    expect(() => daemon.startServer()).toThrow("HARNESS_BOOTSTRAP_TOKEN");
  });

  test("rejects bootstrap token mismatch and full-local escalation", async () => {
    const root = fixture();
    const daemon = new HarnessDaemon({
      bootstrapToken: "expected-bootstrap",
      logPath: join(root, "daemon.log")
    });
    const wrongToken = await daemon.handleRequest(new Request("http://localhost/mcp/v1/auth", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-bootstrap",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ client: "chatgpt", projectRoot: root })
    }));
    const escalation = await daemon.handleRequest(new Request("http://localhost/mcp/v1/auth", {
      method: "POST",
      headers: {
        Authorization: "Bearer expected-bootstrap",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ client: "chatgpt", projectRoot: root, profile: "full-local" })
    }));

    expect(wrongToken.status).toBe(401);
    expect(escalation.status).toBe(403);
  });

  test("does not interpret process arguments as shell syntax", async () => {
    const root = fixture();
    const lease: SessionLease = {
      sessionId: "security-session",
      client: "chatgpt",
      projectRoot: root,
      profile: "project-write",
      authToken: "harness_security",
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      ttlMs: 60_000,
      processIds: [],
      worktreePaths: []
    };

    const result = await new LocalExecutor().execute("process.run", {
      command: "/bin/echo",
      args: ["safe", ";", "touch", join(root, "pwned")],
      cwd: root
    }, lease);

    expect(result.stdout.trim()).toContain("; touch");
    expect(() => readFileSync(join(root, "pwned"))).toThrow();
  });
});
