import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleCli, parseArgs } from "../src/index";
import type { CliRuntime } from "../src/index";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function runtime(fetchImpl: CliRuntime["fetch"], env: Record<string, string | undefined> = {}) {
  const homeDir = mkdtempSync(join(tmpdir(), "kaku-cli-"));
  fixtures.push(homeDir);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const value: CliRuntime = {
    fetch: fetchImpl,
    env,
    homeDir,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    exists: existsSync,
    fileMode: (path) => {
      try {
        return statSync(path).mode & 0o777;
      } catch {
        return null;
      }
    }
  };
  return { runtime: value, homeDir, stdout, stderr };
}

describe("harnessctl CLI", () => {
  test("parses commands, positionals, and flags", () => {
    const parsed = parseArgs(["connect", "chatgpt", "--project", "/Users/mamdouh/app"]);

    expect(parsed.command).toBe("connect");
    expect(parsed.positionals).toEqual(["chatgpt"]);
    expect(parsed.flags.project).toBe("/Users/mamdouh/app");
  });

  test("status reports daemon health instead of the CLI pid", async () => {
    const mockFetch = (async () => new Response(JSON.stringify({
      status: "ok",
      pid: 321,
      activeSessions: 2,
      currentClient: "chatgpt"
    }), { status: 200 })) as CliRuntime["fetch"];
    const context = runtime(mockFetch);

    const exitCode = await handleCli(["status"], context.runtime);

    expect(exitCode).toBe(0);
    expect(context.stdout.join("\n")).toContain("PID 321");
    expect(context.stdout.join("\n")).toContain("2 active session");
  });

  test("connect creates a real lease and stores its token privately", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        sessionId: "session-123",
        token: "harness_private_token",
        client: "chatgpt",
        profile: "project-write",
        endpoint: "/mcp/v1/session/session-123"
      }), { status: 201 });
    }) as CliRuntime["fetch"];
    const context = runtime(mockFetch, { HARNESS_BOOTSTRAP_TOKEN: "bootstrap-private" });

    const exitCode = await handleCli(["connect", "chatgpt", "--project", "/tmp/project"], context.runtime);
    const statePath = join(context.homeDir, ".kaku-harness", "session.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));

    expect(exitCode).toBe(0);
    expect(calls[0].url).toBe("http://127.0.0.1:8765/mcp/v1/auth");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer bootstrap-private");
    expect(state.token).toBe("harness_private_token");
    expect((statSync(statePath).mode & 0o777).toString(8)).toBe("600");
    expect(context.stdout.join("\n")).not.toContain("harness_private_token");
    expect(context.stdout.join("\n")).toContain("session-123");
  });

  test("disconnect revokes the stored session and removes local state", async () => {
    let deleteRequest: RequestInit | undefined;
    const mockFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({
          sessionId: "session-delete",
          token: "harness_delete_token",
          client: "chatgpt",
          profile: "project-write",
          endpoint: "/mcp/v1/session/session-delete"
        }), { status: 201 });
      }
      deleteRequest = init;
      return new Response(null, { status: 204 });
    }) as CliRuntime["fetch"];
    const context = runtime(mockFetch, { HARNESS_BOOTSTRAP_TOKEN: "bootstrap" });

    await handleCli(["connect", "chatgpt", "--project", "/tmp/project"], context.runtime);
    const exitCode = await handleCli(["disconnect"], context.runtime);

    expect(exitCode).toBe(0);
    expect(deleteRequest?.method).toBe("DELETE");
    expect((deleteRequest?.headers as Record<string, string>).Authorization).toBe("Bearer harness_delete_token");
    expect(() => readFileSync(join(context.homeDir, ".kaku-harness", "session.json"))).toThrow();
  });

  test("connect reads the private bootstrap token file when env is unset", async () => {
    let authorization = "";
    const mockFetch = (async (_input, init) => {
      authorization = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({
        sessionId: "session-file-token",
        token: "harness_session_file_token",
        client: "chatgpt",
        profile: "project-write",
        endpoint: "/mcp/v1/session/session-file-token"
      }), { status: 201 });
    }) as CliRuntime["fetch"];
    const context = runtime(mockFetch);
    const tokenDirectory = join(context.homeDir, ".kaku-harness");
    mkdirSync(tokenDirectory, { recursive: true });
    writeFileSync(join(tokenDirectory, "bootstrap-token"), "bootstrap-from-file\n", { mode: 0o600 });

    const exitCode = await handleCli(["connect", "chatgpt", "--project", "/tmp/project"], context.runtime);

    expect(exitCode).toBe(0);
    expect(authorization).toBe("Bearer bootstrap-from-file");
  });

  test("connect fails when bootstrap authentication is unavailable", async () => {
    const context = runtime((async () => {
      throw new Error("fetch should not run");
    }) as CliRuntime["fetch"]);

    const exitCode = await handleCli(["connect", "chatgpt", "--project", "/tmp/project"], context.runtime);

    expect(exitCode).toBe(1);
    expect(context.stderr.join("\n")).toContain("bootstrap token");
  });

  test("doctor reports an unavailable daemon", async () => {
    const context = runtime((async () => {
      throw new Error("connection refused");
    }) as CliRuntime["fetch"]);

    const exitCode = await handleCli(["doctor"], context.runtime);

    expect(exitCode).toBe(1);
    expect(context.stdout.join("\n")).toContain("Daemon Gateway");
    expect(context.stdout.join("\n")).toContain("FAIL");
  });
});
