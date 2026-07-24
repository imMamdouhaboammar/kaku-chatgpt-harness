import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessDaemon } from "../../apps/harnessd/src/index";

const fixtures: string[] = [];
const servers: Array<{ stop(closeActiveConnections?: boolean): void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("live harness daemon", () => {
  test("authenticates and executes a tool over HTTP", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "kaku-live-"));
    fixtures.push(projectRoot);
    writeFileSync(join(projectRoot, "live.txt"), "live result");

    const daemon = new HarnessDaemon({
      port: 0,
      bootstrapToken: "live-bootstrap",
      logPath: join(projectRoot, "live.log")
    });
    const server = daemon.startServer();
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);

    const auth = await fetch(`${baseUrl}/mcp/v1/auth`, {
      method: "POST",
      headers: {
        Authorization: "Bearer live-bootstrap",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ client: "chatgpt-live", projectRoot })
    });
    expect(auth.status).toBe(201);
    const lease = await auth.json() as { sessionId: string; token: string };

    const toolResponse = await fetch(`${baseUrl}/mcp/v1/session/${lease.sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lease.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "live-read",
        method: "tools/call",
        params: { name: "fs.readText", arguments: { path: "live.txt" } }
      })
    });
    const toolResult = await toolResponse.json() as { result: { content: string } };

    expect(toolResponse.status).toBe(200);
    expect(toolResult.result.content).toBe("live result");
  });
});
