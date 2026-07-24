import { describe, expect, test } from "bun:test";
import { HarnessDaemon } from "../src/index";

describe("HarnessDaemon HTTP Gateway", () => {
  const daemon = new HarnessDaemon(0, "/tmp/test_daemon_obs.log");

  test("handles health check endpoint", () => {
    const req = new Request("http://localhost/health");
    const res = daemon.handleRequest(req);
    expect(res.status).toBe(200);
  });

  test("authenticates session and rejects unauthorized request", async () => {
    // 1. Request auth
    const authReq = new Request("http://localhost/mcp/v1/auth", { method: "POST" });
    const authRes = daemon.handleRequest(authReq);
    expect(authRes.status).toBe(200);

    const authData = (await authRes.json()) as { sessionId: string; token: string };
    expect(authData.sessionId).toBeDefined();

    // 2. Reject request with invalid token
    const unauthReq = new Request(`http://localhost/mcp/v1/session/${authData.sessionId}`, {
      headers: { Authorization: "Bearer wrong-token" }
    });
    const unauthRes = daemon.handleRequest(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 3. Accept request with valid token
    const validReq = new Request(`http://localhost/mcp/v1/session/${authData.sessionId}`, {
      headers: { Authorization: `Bearer ${authData.token}` }
    });
    const validRes = daemon.handleRequest(validReq);
    expect(validRes.status).toBe(200);
  });
});
