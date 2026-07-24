import { describe, expect, test, afterEach } from "bun:test";
import { RedactedLogger } from "../src/index";
import { statSync, unlinkSync, existsSync } from "fs";

const TEST_LOG = "/tmp/test_harness_obs.log";

describe("RedactedLogger", () => {
  afterEach(() => {
    if (existsSync(TEST_LOG)) {
      unlinkSync(TEST_LOG);
    }
  });

  test("redacts sensitive tokens in log message", () => {
    const logger = new RedactedLogger(TEST_LOG);
    const result = logger.log("INFO", "Connecting with token Bearer secret-token-12345");
    expect(result.message).not.toContain("secret-token-12345");
    expect(result.message).toContain("[REDACTED_SECRET]");
  });

  test("preserves diagnostic built-ins while redacting nested secrets", () => {
    const logger = new RedactedLogger(TEST_LOG);
    const event = logger.log("ERROR", "Failure", undefined, {
      happenedAt: new Date("2026-07-24T12:00:00.000Z"),
      error: new Error("Bearer private-error-token"),
      metadata: new Map([["authorization", "Bearer private-map-token"]]),
      labels: new Set(["safe", "harness_private-set-token"])
    });

    expect(event.context?.happenedAt).toBe("2026-07-24T12:00:00.000Z");
    expect(event.context?.error).toMatchObject({ name: "Error" });
    expect(JSON.stringify(event.context)).not.toContain("private-error-token");
    expect(JSON.stringify(event.context)).not.toContain("private-map-token");
    expect(JSON.stringify(event.context)).not.toContain("private-set-token");
  });

  test("enforces mode 0600 file permissions", () => {
    const logger = new RedactedLogger(TEST_LOG);
    logger.log("SECURITY", "Auth check performed");
    const stats = statSync(TEST_LOG);
    // 0o600 mode bitmask check (33152 decimal for regular file mode 0600)
    const modeOctal = (stats.mode & 0o777).toString(8);
    expect(modeOctal).toBe("600");
  });
});
