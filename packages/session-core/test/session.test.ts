import { describe, expect, test } from "bun:test";
import { SessionManager } from "../src/index";

describe("SessionManager", () => {
  test("creates a valid session lease with token", () => {
    const mgr = new SessionManager();
    const lease = mgr.createSession("chatgpt", "/tmp/project");
    expect(lease.sessionId).toBeDefined();
    expect(lease.authToken).toStartWith("harness_");
    expect(lease.projectRoot).toBe("/tmp/project");
  });

  test("validates tokens correctly and rejects invalid ones", () => {
    const mgr = new SessionManager();
    const lease = mgr.createSession("chatgpt", "/tmp/project");
    expect(mgr.validateToken(lease.sessionId, lease.authToken)).toBeTrue();
    expect(mgr.validateToken(lease.sessionId, "wrong-token")).toBeFalse();
  });

  test("reaps expired orphan sessions", async () => {
    const mgr = new SessionManager(50); // 50ms TTL
    const lease = mgr.createSession("chatgpt", "/tmp/project");
    expect(mgr.listActiveSessions().length).toBe(1);

    await new Promise((res) => setTimeout(res, 60));
    expect(mgr.reapOrphans()).toBe(1);
    expect(mgr.getSession(lease.sessionId)).toBeUndefined();
  });
});
