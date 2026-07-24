import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  test("blocks symlink escapes for file reads and directory listings", async () => {
    const { root, lease } = setup();
    const outside = mkdtempSync(join(tmpdir(), "kaku-outside-"));
    fixtures.push(outside);
    writeFileSync(join(outside, "secret.txt"), "outside secret");
    symlinkSync(join(outside, "secret.txt"), join(root, "linked-secret.txt"));
    symlinkSync(outside, join(root, "linked-directory"));
    const executor = new LocalExecutor();

    await expect(executor.execute("fs.readText", { path: "linked-secret.txt" }, lease)).rejects.toMatchObject({
      code: "PATH_OUTSIDE_PROJECT"
    });
    await expect(executor.execute("fs.list", { path: "linked-directory" }, lease)).rejects.toMatchObject({
      code: "PATH_OUTSIDE_PROJECT"
    });
  });

  test("sandboxes project-scoped processes from host files and secrets", async () => {
    const { root, lease } = setup();
    const outside = mkdtempSync(join(tmpdir(), "kaku-host-"));
    fixtures.push(outside);
    const outsideFile = join(outside, "host-secret.txt");
    writeFileSync(outsideFile, "host secret");
    const previousToken = process.env.HARNESS_BOOTSTRAP_TOKEN;
    process.env.HARNESS_BOOTSTRAP_TOKEN = "bootstrap-should-not-leak";

    try {
      const executor = new LocalExecutor();
      const outsideResult = await executor.execute("process.run", {
        command: "/bin/cat",
        args: [outsideFile],
        cwd: root
      }, lease);
      const environmentResult = await executor.execute("process.run", {
        command: "/usr/bin/env",
        cwd: root
      }, lease);

      expect(outsideResult.exitCode).not.toBe(0);
      expect(outsideResult.stdout).not.toContain("host secret");
      expect(environmentResult.stdout).not.toContain("HARNESS_BOOTSTRAP_TOKEN");
      expect(environmentResult.stdout).not.toContain("bootstrap-should-not-leak");
    } finally {
      if (previousToken === undefined) delete process.env.HARNESS_BOOTSTRAP_TOKEN;
      else process.env.HARNESS_BOOTSTRAP_TOKEN = previousToken;
    }
  });

  test("blocks network access for project-scoped processes", async () => {
    const { root, lease } = setup();
    const server = Bun.serve({ port: 0, fetch: () => new Response("reachable") });

    try {
      expect(await fetch(`http://127.0.0.1:${server.port}`).then((response) => response.text())).toBe("reachable");
      const result = await new LocalExecutor().execute("process.run", {
        command: process.execPath,
        args: ["-e", `console.log(await fetch('http://127.0.0.1:${server.port}').then(r => r.text()))`],
        cwd: root,
        timeoutMs: 2_000
      }, lease);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).not.toContain("reachable");
    } finally {
      server.stop(true);
    }
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

  test("kills descendant processes when a command times out", async () => {
    const { root, lease } = setup();
    const scriptPath = join(root, "spawn-descendant.sh");
    const pidPath = join(root, "descendant.pid");
    writeFileSync(scriptPath, `#!/bin/sh\nsleep 30 >/dev/null 2>&1 &\necho $! > ${pidPath}\nwait\n`, { mode: 0o700 });
    const executor = new LocalExecutor({ commandTimeoutMs: 150 });

    await expect(executor.execute("process.run", {
      command: "/bin/sh",
      args: [scriptPath],
      cwd: root
    }, lease)).rejects.toMatchObject({ code: "TIMEOUT" });

    const descendantPid = Number(readFileSync(pidPath, "utf8").trim());
    try {
      expect(processIsAlive(descendantPid)).toBeFalse();
    } finally {
      if (processIsAlive(descendantPid)) process.kill(descendantPid, "SIGKILL");
    }
  });
});

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
