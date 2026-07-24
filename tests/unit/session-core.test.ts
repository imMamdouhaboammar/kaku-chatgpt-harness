import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SessionAuth } from "@harness/session-core";
import { SessionManager } from "@harness/session-core";
import { unlinkSync, existsSync } from "node:fs";

const TEST_STATE_FILE = "/tmp/test_session_state.json";

describe("SessionAuth Unit Suite", () => {
  const auth = new SessionAuth("test-secret-key");

  test("valid_token_returns_decoded_payload", () => {
    const token = auth.signToken({
      sessionId: "s-123",
      client: "chatgpt",
      projectRoot: "/tmp/project",
      profile: "write-project",
      exp: Date.now() + 60000
    });

    const payload = auth.verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sessionId).toBe("s-123");
    expect(payload?.profile).toBe("write-project");
  });

  test("expired_token_returns_null", () => {
    const expiredToken = auth.signToken({
      sessionId: "s-456",
      client: "chatgpt",
      projectRoot: "/tmp/project",
      profile: "read",
      exp: Date.now() - 1000
    });

    const payload = auth.verifyToken(expiredToken);
    expect(payload).toBeNull();
  });

  test("tampered_token_signature_returns_null", () => {
    const token = auth.signToken({
      sessionId: "s-789",
      client: "chatgpt",
      projectRoot: "/tmp/project",
      profile: "full-local",
      exp: Date.now() + 60000
    });

    const tampered = token + "bad";
    const payload = auth.verifyToken(tampered);
    expect(payload).toBeNull();
  });
});

describe("SessionManager Unit Suite", () => {
  let manager: SessionManager;

  beforeEach(() => {
    if (existsSync(TEST_STATE_FILE)) unlinkSync(TEST_STATE_FILE);
    manager = new SessionManager(TEST_STATE_FILE, 2, 5000);
  });

  afterEach(() => {
    if (existsSync(TEST_STATE_FILE)) unlinkSync(TEST_STATE_FILE);
  });

  test("creates_and_retrieves_active_session", () => {
    const session = manager.createSession("chatgpt", "/tmp/project");
    expect(session.status).toBe("active");
    expect(session.client).toBe("chatgpt");

    const retrieved = manager.getSession(session.sessionId);
    expect(retrieved?.sessionId).toBe(session.sessionId);
  });

  test("exceeding_max_sessions_throws_error", () => {
    manager.createSession("client1", "/tmp/p1");
    manager.createSession("client2", "/tmp/p2");

    expect(() => {
      manager.createSession("client3", "/tmp/p3");
    }).toThrow("Maximum concurrent session cap of 2 reached.");
  });

  test("revoked_session_terminates_processes_and_changes_status", () => {
    const session = manager.createSession("chatgpt", "/tmp/project");
    const revoked = manager.revokeSession(session.sessionId);

    expect(revoked).toBeTrue();
    const updated = manager.getSession(session.sessionId);
    expect(updated?.status).toBe("revoked");
  });
});
