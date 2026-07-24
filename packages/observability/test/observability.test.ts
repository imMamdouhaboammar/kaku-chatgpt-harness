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

  test("enforces mode 0600 file permissions", () => {
    const logger = new RedactedLogger(TEST_LOG);
    logger.log("SECURITY", "Auth check performed");
    const stats = statSync(TEST_LOG);
    // 0o600 mode bitmask check (33152 decimal for regular file mode 0600)
    const modeOctal = (stats.mode & 0o777).toString(8);
    expect(modeOctal).toBe("600");
  });
});
