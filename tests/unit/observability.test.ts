import { describe, test, expect, afterEach } from "bun:test";
import { redactText, redactValue, HarnessLogger, EventJournal } from "@harness/observability";
import { existsSync, unlinkSync, statSync, readFileSync } from "node:fs";

const TEST_LOG_FILE = "/tmp/test_harness_observability.log";
const TEST_JOURNAL_FILE = "/tmp/test_harness_journal.jsonl";

describe("Observability Unit Suite", () => {
  afterEach(() => {
    if (existsSync(TEST_LOG_FILE)) unlinkSync(TEST_LOG_FILE);
    if (existsSync(TEST_JOURNAL_FILE)) unlinkSync(TEST_JOURNAL_FILE);
  });

  test("redactText_masks_bearer_tokens_and_secrets", () => {
    const raw = "Connecting with Bearer eyJhbGciOiJIUzI1NiJ9 and sk-1234567890abcdef1234567890 and secret://aws/s3/key";
    const redacted = redactText(raw);
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).not.toContain("sk-1234567890abcdef1234567890");
    expect(redacted).not.toContain("secret://aws/s3/key");
    expect(redacted).toContain("[REDACTED_SECRET]");
  });

  test("redactValue_recursively_masks_secret_object_keys", () => {
    const data = {
      user: "alice",
      api_key: "sk-999999999999999999999",
      config: { password: "super-secret-pass" }
    };
    const redacted = redactValue(data) as any;
    expect(redacted.user).toBe("alice");
    expect(redacted.api_key).toBe("[REDACTED_SECRET]");
    expect(redacted.config.password).toBe("[REDACTED_SECRET]");
  });

  test("HarnessLogger_enforces_0600_permissions_and_writes_redacted_entry", () => {
    const logger = new HarnessLogger(TEST_LOG_FILE);
    logger.info("Test log message", { secret_token: "sk-secret123456789" }, "sess-1");

    expect(existsSync(TEST_LOG_FILE)).toBeTrue();
    const stats = statSync(TEST_LOG_FILE);
    const mode = (stats.mode & 0o777).toString(8);
    expect(mode).toBe("600");

    const content = readFileSync(TEST_LOG_FILE, "utf8");
    expect(content).toContain("Test log message");
    expect(content).not.toContain("sk-secret123456789");
  });

  test("EventJournal_records_and_retrieves_session_events", () => {
    const journal = new EventJournal(TEST_JOURNAL_FILE);
    journal.record("worktree_created", "sess-abc", { path: "/tmp/wt1" });
    journal.record("policy_checked", "sess-abc", { allowed: true });

    const events = journal.getEventsForSession("sess-abc");
    expect(events.length).toBe(2);
    expect(events[0].eventType).toBe("worktree_created");
    expect(events[1].eventType).toBe("policy_checked");
  });
});
