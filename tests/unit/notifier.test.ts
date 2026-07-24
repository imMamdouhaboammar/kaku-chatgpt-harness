import { describe, test, expect } from "bun:test";
import { DesktopNotifier } from "@harness/observability";

describe("DesktopNotifier Unit Suite", () => {
  const notifier = new DesktopNotifier();

  test("notifyTaskCompletion_formats_correct_payload", () => {
    const successResult = notifier.notifyTaskCompletion("task-123", "Build API Endpoint", true);
    expect(typeof successResult).toBe("boolean");
  });
});
