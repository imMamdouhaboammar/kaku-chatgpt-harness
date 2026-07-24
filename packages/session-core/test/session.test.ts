import { describe, expect, test } from "bun:test";
import { SessionManager } from "../src/index";

const projectRoot = "/tmp/kaku-session-project";

describe("SessionManager", () => {
  test("creates a normalized session lease", () => {
    const mgr = new SessionManager();
    const lease = mgr.createSession({ client: "chatgpt", projectRoot });

    expect(lease.client).toBe("chatgpt");
    expect(lease.authToken).toStartWith("harness_");
    expect(lease.projectRoot).toBe(projectRoot);
    expect(lease.profile).toBe("project-write");
    expect(mgr.currentClient).toBe("chatgpt");
  });

  test("rejects empty client identities", () => {
    const mgr = new SessionManager();

    expect(() => mgr.createSession({ client: "   ", projectRoot })).toThrow("client");
  });

  test("rejects relative project roots", () => {
    const mgr = new SessionManager();

    expect(() => mgr.createSession({ client: "chatgpt", projectRoot: "relative/project" })).toThrow("absolute");
  });

  test("rejects full-local unless explicitly enabled", () => {
    const mgr = new SessionManager();

    expect(() => mgr.createSession({ client: "chatgpt", projectRoot, profile: "full-local" })).toThrow("full-local");
  });

  test("allows full-local only when configured", () => {
    const mgr = new SessionManager({ allowFullLocal: true });
    const lease = mgr.createSession({ client: "operator", projectRoot: "/", profile: "full-local" });

    expect(lease.profile).toBe("full-local");
  });

  test("enforces the active session capacity", () => {
    const mgr = new SessionManager({ maxSessions: 1 });
    mgr.createSession({ client: "chatgpt", projectRoot });

    expect(() => mgr.createSession({ client: "claude", projectRoot })).toThrow("capacity");
  });

  test("validates tokens and revokes sessions", () => {
    const mgr = new SessionManager();
    const lease = mgr.createSession({ client: "chatgpt", projectRoot });

    expect(mgr.validateToken(lease.sessionId, lease.authToken)).toBeTrue();
    expect(mgr.validateToken(lease.sessionId, "wrong-token")).toBeFalse();
    expect(mgr.revokeSession(lease.sessionId)).toBeTrue();
    expect(mgr.validateToken(lease.sessionId, lease.authToken)).toBeFalse();
    expect(mgr.currentClient).toBe("uninitialized");
  });

  test("reaps expired orphan sessions", async () => {
    const mgr = new SessionManager({ defaultTtlMs: 40 });
    const lease = mgr.createSession({ client: "chatgpt", projectRoot });
    expect(mgr.listActiveSessions()).toHaveLength(1);

    await Bun.sleep(50);

    expect(mgr.reapOrphans()).toBe(1);
    expect(mgr.getSession(lease.sessionId)).toBeUndefined();
    expect(mgr.currentClient).toBe("uninitialized");
  });
});
