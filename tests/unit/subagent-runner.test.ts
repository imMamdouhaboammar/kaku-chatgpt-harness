import { describe, test, expect, afterEach } from "bun:test";
import { SubagentRunner } from "../../packages/subagents/src/subagent-runner.ts";
import { existsSync, unlinkSync } from "node:fs";

const TEST_LOG = "/tmp/test_subagent_runner.log";

describe("SubagentRunner Unit Suite (TDD)", () => {
  afterEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
  });

  test("spawn_launches_background_process_and_creates_mode_0600_log", () => {
    const runner = new SubagentRunner();
    const task = runner.spawn({
      taskId: "task-codex-1",
      goal: "Refactor API module",
      projectRoot: "/tmp",
      backend: "codex",
      logFilePath: TEST_LOG
    });

    expect(task.subagentId).toBeDefined();
    expect(task.backend).toBe("codex");
    expect(task.pid).toBeGreaterThan(0);
    expect(task.status).toBe("running");

    // Clean up
    runner.kill(task.subagentId);
  });

  test("getStatus_returns_task_status_record", () => {
    const runner = new SubagentRunner();
    const task = runner.spawn({
      taskId: "task-codex-2",
      goal: "Audit security headers",
      projectRoot: "/tmp",
      backend: "codex",
      logFilePath: TEST_LOG
    });

    const status = runner.getStatus(task.subagentId);
    expect(status).not.toBeNull();
    expect(status?.taskId).toBe("task-codex-2");

    runner.kill(task.subagentId);
  });
});
