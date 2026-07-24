import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ProjectContextResolver, WorktreeManager } from "@harness/workspace";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_REPO_DIR = "/tmp/test_harness_workspace_repo";

describe("Workspace Unit Suite", () => {
  beforeEach(() => {
    if (existsSync(TEST_REPO_DIR)) rmSync(TEST_REPO_DIR, { recursive: true, force: true });
    mkdirSync(TEST_REPO_DIR, { recursive: true });
    writeFileSync(join(TEST_REPO_DIR, "package.json"), JSON.stringify({ name: "dummy" }));
    writeFileSync(join(TEST_REPO_DIR, "AGENTS.md"), "# Project Instructions");
  });

  afterEach(() => {
    if (existsSync(TEST_REPO_DIR)) rmSync(TEST_REPO_DIR, { recursive: true, force: true });
  });

  test("ProjectContextResolver_detects_project_root_and_instructions", () => {
    const resolver = new ProjectContextResolver();
    const snapshot = resolver.resolveContext(TEST_REPO_DIR);

    expect(snapshot.projectRoot).toBe(TEST_REPO_DIR);
    expect(snapshot.packageManager).toBe("bun");
    expect(snapshot.instructionsPath).toBe(join(TEST_REPO_DIR, "AGENTS.md"));
    expect(snapshot.instructionSummary).toContain("Project Instructions");
  });

  test("WorktreeManager_handles_fallback_creation_and_removal", () => {
    const manager = new WorktreeManager();
    const session = manager.createWorktree(TEST_REPO_DIR, "wt-test-1");

    expect(session.worktreeId).toBe("wt-test-1");
    expect(existsSync(session.worktreePath)).toBeTrue();

    manager.removeWorktree(session);
    expect(existsSync(session.worktreePath)).toBeFalse();
  });
});
