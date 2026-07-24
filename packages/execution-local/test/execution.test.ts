import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalExecutionError, LocalExecutor } from "../src/index";
import type { SessionLease } from "@kaku-harness/session-core";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "kaku-exec-"));
  fixtures.push(root);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "hello.txt"), "hello harness");
  const lease: SessionLease = {
    sessionId: "session-test",
    client: "chatgpt",
    projectRoot: root,
    profile: "project-write",
    authToken: "harness_test",
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    ttlMs: 60_000,
    processIds: [],
    worktreePaths: []
  };
  return { root, lease };
}

describe("LocalExecutor", () => {
  test("reads a text file inside the project", async () => {
    const { root, lease } = setup();
    const result = await new LocalExecutor().execute("fs.readText", { path: join(root, "src/hello.txt") }, lease);

    expect(result).toEqual({ content: "hello harness", bytes: 13, truncated: false });
  });

  test("lists a directory inside the project", async () => {
    const { root, lease } = setup();
    const result = await new LocalExecutor().execute("fs.list", { path: join(root, "src") }, lease);

    expect(result.entries).toEqual([{ name: "hello.txt", type: "file" }]);
  });

  test("runs an executable without shell interpolation", async () => {
    const { root, lease } = setup();
    const result = await new LocalExecutor().execute("process.run", {
      command: "/bin/echo",
      args: ["hello", "$HOME", ";", "pwd"],
      cwd: root
    }, lease);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello $HOME ; pwd");
    expect(result.stderr).toBe("");
  });

  test("blocks reads outside the project", async () => {
    const { lease } = setup();

    await expect(new LocalExecutor().execute("fs.readText", { path: "/etc/hosts" }, lease)).rejects.toMatchObject({
      code: "PATH_OUTSIDE_PROJECT"
    });
  });

  test("rejects unknown tools", async () => {
    const { lease } = setup();

    await expect(new LocalExecutor().execute("unknown.tool", {}, lease)).rejects.toBeInstanceOf(LocalExecutionError);
  });

  test("returns non-zero process exits without hiding stderr", async () => {
    const { root, lease } = setup();
    const result = await new LocalExecutor().execute("process.run", {
      command: process.execPath,
      args: ["-e", "console.error('bad'); process.exit(3)"],
      cwd: root
    }, lease);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("bad");
  });

  test("kills processes that exceed the output limit", async () => {
    const { root, lease } = setup();
    const executor = new LocalExecutor({ maxOutputBytes: 64 });

    await expect(executor.execute("process.run", {
      command: process.execPath,
      args: ["-e", "console.log('x'.repeat(1024))"],
      cwd: root
    }, lease)).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  });

  test("kills processes that exceed the timeout", async () => {
    const { root, lease } = setup();
    const executor = new LocalExecutor({ commandTimeoutMs: 10 });

    await expect(executor.execute("process.run", {
      command: process.execPath,
      args: ["-e", "await Bun.sleep(100)"],
      cwd: root
    }, lease)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
