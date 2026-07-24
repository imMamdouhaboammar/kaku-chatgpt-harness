import { describe, expect, test } from "bun:test";
import { HarnessDaemon } from "../src/index";

describe("HarnessDaemon HTTP Gateway", () => {
  const daemon = new HarnessDaemon(0, "/tmp/test_daemon_obs.log");

  test("handles health check endpoint", async () => {
    const req = new Request("http://localhost/health");
    const res = await daemon.handleRequest(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; currentClient: string };
    expect(data.currentClient).toBe("uninitialized");
  });

  test("authenticates session and rejects unauthorized request", async () => {
    // 1. Request auth
    const authReq = new Request("http://localhost/mcp/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "chatgpt-desktop" })
    });
    const authRes = await daemon.handleRequest(authReq);
    expect(authRes.status).toBe(200);

    const authData = (await authRes.json()) as { sessionId: string; token: string; client: string };
    expect(authData.sessionId).toBeDefined();
    expect(authData.client).toBe("chatgpt-desktop");
    expect(daemon.currentClient).toBe("chatgpt-desktop");

    // Health check after auth reflects client
    const healthReq = new Request("http://localhost/health");
    const healthRes = await daemon.handleRequest(healthReq);
    const healthData = (await healthRes.json()) as { currentClient: string };
    expect(healthData.currentClient).toBe("chatgpt-desktop");

    // 2. Reject request with invalid token
    const unauthReq = new Request(`http://localhost/mcp/v1/session/${authData.sessionId}`, {
      headers: { Authorization: "Bearer wrong-token" }
    });
    const unauthRes = await daemon.handleRequest(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 3. Accept request with valid token
    const validReq = new Request(`http://localhost/mcp/v1/session/${authData.sessionId}`, {
      headers: { Authorization: `Bearer ${authData.token}` }
    });
    const validRes = await daemon.handleRequest(validReq);
    expect(validRes.status).toBe(200);
    const validData = (await validRes.json()) as { result: { client: string } };
    expect(validData.result.client).toBe("chatgpt-desktop");
  });
});
