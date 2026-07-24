import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessDaemon } from "../src/index";

const fixtures: string[] = [];
const bootstrapToken = "bootstrap-test-token";

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function setup(maxRequestBytes = 1024 * 1024) {
  const projectRoot = mkdtempSync(join(tmpdir(), "kaku-daemon-"));
  fixtures.push(projectRoot);
  writeFileSync(join(projectRoot, "hello.txt"), "hello daemon");
  const logPath = join(projectRoot, "harness.log");
  const daemon = new HarnessDaemon({
    port: 0,
    logPath,
    bootstrapToken,
    maxRequestBytes
  });
  return { daemon, projectRoot, logPath };
}

async function createSession(daemon: HarnessDaemon, projectRoot: string) {
  const response = await daemon.handleRequest(new Request("http://localhost/mcp/v1/auth", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bootstrapToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ client: "chatgpt-desktop", projectRoot })
  }));
  expect(response.status).toBe(201);
  return response.json() as Promise<{ sessionId: string; token: string; client: string; endpoint: string }>;
}

function sessionRequest(sessionId: string, token: string, body: unknown) {
  return new Request(`http://localhost/mcp/v1/session/${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

describe("HarnessDaemon HTTP Gateway", () => {
  test("reports truthful health metadata", async () => {
    const { daemon } = setup();
    const response = await daemon.handleRequest(new Request("http://localhost/health"));
    const data = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.pid).toBe(process.pid);
    expect(data.activeSessions).toBe(0);
    expect(typeof data.uptimeSeconds).toBe("number");
  });

  test("requires bootstrap authentication before issuing a lease", async () => {
    const { daemon, projectRoot } = setup();
    const response = await daemon.handleRequest(new Request("http://localhost/mcp/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt", projectRoot })
    }));

    expect(response.status).toBe(401);
  });

  test("rejects full-local profile escalation", async () => {
    const { daemon, projectRoot } = setup();
    const response = await daemon.handleRequest(new Request("http://localhost/mcp/v1/auth", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bootstrapToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ client: "chatgpt", projectRoot, profile: "full-local" })
    }));

    expect(response.status).toBe(403);
  });

  test("issues a project-scoped lease without logging tokens", async () => {
    const { daemon, projectRoot, logPath } = setup();
    const lease = await createSession(daemon, projectRoot);
    const log = readFileSync(logPath, "utf8");

    expect(lease.client).toBe("chatgpt-desktop");
    expect(lease.endpoint).toBe(`/mcp/v1/session/${lease.sessionId}`);
    expect(log).not.toContain(bootstrapToken);
    expect(log).not.toContain(lease.token);
  });

  test("rejects invalid session tokens", async () => {
    const { daemon, projectRoot } = setup();
    const lease = await createSession(daemon, projectRoot);
    const response = await daemon.handleRequest(sessionRequest(lease.sessionId, "wrong-token", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    }));

    expect(response.status).toBe(401);
  });

  test("lists the allowlisted tools", async () => {
    const { daemon, projectRoot } = setup();
    const lease = await createSession(daemon, projectRoot);
    const response = await daemon.handleRequest(sessionRequest(lease.sessionId, lease.token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }));
    const data = await response.json() as { result: { tools: Array<{ name: string }> } };

    expect(response.status).toBe(200);
    expect(data.result.tools.map((tool) => tool.name)).toEqual(["fs.readText", "fs.list", "process.run"]);
  });

  test("executes an authenticated file read", async () => {
    const { daemon, projectRoot } = setup();
    const lease = await createSession(daemon, projectRoot);
    const response = await daemon.handleRequest(sessionRequest(lease.sessionId, lease.token, {
      jsonrpc: "2.0",
      id: "read-1",
      method: "tools/call",
      params: {
        name: "fs.readText",
        arguments: { path: "hello.txt" }
      }
    }));
    const data = await response.json() as { result: { content: string } };

    expect(response.status).toBe(200);
    expect(data.result.content).toBe("hello daemon");
  });

  test("returns a structured policy error for outside paths", async () => {
    const { daemon, projectRoot } = setup();
    const lease = await createSession(daemon, projectRoot);
    const response = await daemon.handleRequest(sessionRequest(lease.sessionId, lease.token, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "fs.readText",
        arguments: { path: "/etc/hosts" }
      }
    }));
    const data = await response.json() as { error: { code: number; data: { code: string } } };

    expect(response.status).toBe(200);
    expect(data.error.code).toBe(-32001);
    expect(data.error.data.code).toBe("PATH_OUTSIDE_PROJECT");
  });

  test("revokes an authenticated session", async () => {
    const { daemon, projectRoot } = setup();
    const lease = await createSession(daemon, projectRoot);
    const revoke = await daemon.handleRequest(new Request(`http://localhost/mcp/v1/session/${lease.sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${lease.token}` }
    }));
    const afterRevoke = await daemon.handleRequest(sessionRequest(lease.sessionId, lease.token, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list"
    }));

    expect(revoke.status).toBe(204);
    expect(afterRevoke.status).toBe(401);
  });

  test("returns a JSON-RPC parse error for malformed JSON", async () => {
    const { daemon, projectRoot } = setup();
    const lease = await createSession(daemon, projectRoot);
    const response = await daemon.handleRequest(new Request(`http://localhost/mcp/v1/session/${lease.sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lease.token}`,
        "Content-Type": "application/json"
      },
      body: "{bad"
    }));
    const data = await response.json() as { error: { code: number } };

    expect(data.error.code).toBe(-32700);
  });

  test("rejects oversized request bodies", async () => {
    const { daemon, projectRoot } = setup(192);
    const lease = await createSession(daemon, projectRoot);
    const response = await daemon.handleRequest(sessionRequest(lease.sessionId, lease.token, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "fs.readText", arguments: { path: "x".repeat(200) } }
    }));

    expect(response.status).toBe(413);
  });
});
