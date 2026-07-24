import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_ENDPOINT = "http://127.0.0.1:8765";

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string>;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CliRuntime {
  fetch: FetchLike;
  env: Record<string, string | undefined>;
  homeDir: string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exists: (path: string) => boolean;
  fileMode: (path: string) => number | null;
}

interface StoredSession {
  baseUrl: string;
  endpoint: string;
  sessionId: string;
  token: string;
  client: string;
  profile: string;
  projectRoot: string;
  createdAt: string;
}

export function parseArgs(args: string[]): ParsedArgs {
  const command = args[0] || "help";
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let index = 1; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    const raw = argument.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      flags[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      index++;
    } else {
      flags[raw] = "true";
    }
  }

  return { command, positionals, flags };
}

export async function handleCli(args: string[], runtime: CliRuntime = defaultRuntime()): Promise<number> {
  const parsed = parseArgs(args);
  const baseUrl = normalizeEndpoint(parsed.flags.endpoint ?? runtime.env.HARNESS_ENDPOINT ?? DEFAULT_ENDPOINT);

  try {
    switch (parsed.command) {
      case "doctor":
        return runDoctor(runtime, baseUrl);
      case "status":
        return runStatus(runtime, baseUrl);
      case "connect":
        return runConnect(parsed, runtime, baseUrl);
      case "disconnect":
        return runDisconnect(runtime);
      case "help":
      default:
        printHelp(runtime);
        return parsed.command === "help" ? 0 : 1;
    }
  } catch (error) {
    runtime.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function runDoctor(runtime: CliRuntime, baseUrl = DEFAULT_ENDPOINT): Promise<number> {
  const logPath = runtime.env.HARNESS_LOG_PATH ?? "/tmp/harnessd_daemon.log";
  const checks = [
    {
      name: "Kaku Application Installation",
      status: runtime.exists("/Applications/Kaku.app"),
      detail: "/Applications/Kaku.app"
    },
    {
      name: "Bun JavaScript Runtime",
      status: typeof Bun !== "undefined",
      detail: typeof Bun !== "undefined" ? `Bun ${Bun.version}` : "Bun is unavailable"
    },
    {
      name: "Agent Kernel Directory",
      status: runtime.exists(join(runtime.homeDir, ".agent-kernel")),
      detail: join(runtime.homeDir, ".agent-kernel")
    }
  ];

  try {
    const response = await runtime.fetch(`${baseUrl}/health`);
    checks.push({
      name: "Daemon Gateway",
      status: response.ok,
      detail: response.ok ? `${baseUrl}/health` : `HTTP ${response.status}`
    });
  } catch (error) {
    checks.push({
      name: "Daemon Gateway",
      status: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const logMode = runtime.fileMode(logPath);
  checks.push({
    name: "Log Mask Security Boundary",
    status: runtime.exists(logPath) && logMode === 0o600,
    detail: runtime.exists(logPath) ? `${logPath} mode ${(logMode ?? 0).toString(8)}` : `${logPath} missing`
  });

  const ok = checks.every((check) => check.status);
  runtime.stdout(`[harnessctl doctor] Status: ${ok ? "OK" : "ERROR"}`);
  for (const check of checks) {
    runtime.stdout(` - [${check.status ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
  }
  return ok ? 0 : 1;
}

async function runStatus(runtime: CliRuntime, baseUrl: string): Promise<number> {
  try {
    const response = await runtime.fetch(`${baseUrl}/health`);
    if (!response.ok) {
      runtime.stderr(`[harnessctl status] Daemon unavailable: HTTP ${response.status}`);
      return 1;
    }
    const health = await response.json() as {
      status?: string;
      pid?: number;
      activeSessions?: number;
      currentClient?: string;
      version?: string;
    };
    runtime.stdout(`[harnessctl status] Daemon: ${health.status ?? "unknown"} (PID ${health.pid ?? "unknown"})`);
    runtime.stdout(`[harnessctl status] Sessions: ${health.activeSessions ?? 0} active session(s)`);
    runtime.stdout(`[harnessctl status] Current client: ${health.currentClient ?? "uninitialized"}`);
    runtime.stdout(`[harnessctl status] Version: ${health.version ?? "unknown"}`);
    return 0;
  } catch (error) {
    runtime.stderr(`[harnessctl status] Daemon unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function runConnect(parsed: ParsedArgs, runtime: CliRuntime, baseUrl: string): Promise<number> {
  const bootstrapToken = runtime.env.HARNESS_BOOTSTRAP_TOKEN;
  if (!bootstrapToken) {
    runtime.stderr("HARNESS_BOOTSTRAP_TOKEN is required to create a session.");
    return 1;
  }

  const client = parsed.positionals[0] ?? "chatgpt";
  const projectRoot = parsed.flags.project ?? process.cwd();
  const profile = parsed.flags.profile ?? "project-write";
  const response = await runtime.fetch(`${baseUrl}/mcp/v1/auth`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bootstrapToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ client, projectRoot, profile })
  });

  if (!response.ok) {
    const detail = await responseMessage(response);
    runtime.stderr(`[harnessctl connect] Lease request failed: HTTP ${response.status} ${detail}`.trim());
    return 1;
  }

  const lease = await response.json() as Partial<StoredSession> & { endpoint?: string };
  if (!lease.sessionId || !lease.token || !lease.client || !lease.endpoint) {
    runtime.stderr("[harnessctl connect] Daemon returned an invalid lease response.");
    return 1;
  }

  const state: StoredSession = {
    baseUrl,
    endpoint: lease.endpoint,
    sessionId: lease.sessionId,
    token: lease.token,
    client: lease.client,
    profile: lease.profile ?? profile,
    projectRoot,
    createdAt: new Date().toISOString()
  };
  writeSessionState(runtime.homeDir, state);

  runtime.stdout(`[harnessctl connect] Session active: ${state.sessionId}`);
  runtime.stdout(`[harnessctl connect] Client: ${state.client}`);
  runtime.stdout(`[harnessctl connect] Project: ${state.projectRoot}`);
  runtime.stdout(`[harnessctl connect] Endpoint: ${state.baseUrl}${state.endpoint}`);
  return 0;
}

async function runDisconnect(runtime: CliRuntime): Promise<number> {
  const statePath = sessionStatePath(runtime.homeDir);
  const state = readSessionState(statePath);
  if (!state) {
    runtime.stderr("[harnessctl disconnect] No stored session was found.");
    return 1;
  }

  const response = await runtime.fetch(`${state.baseUrl}${state.endpoint}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${state.token}` }
  });

  if (response.status !== 204 && response.status !== 401 && !response.ok) {
    runtime.stderr(`[harnessctl disconnect] Revoke failed: HTTP ${response.status}`);
    return 1;
  }

  unlinkSync(statePath);
  runtime.stdout(`[harnessctl disconnect] Session revoked: ${state.sessionId}`);
  return 0;
}

function sessionStatePath(homeDir: string): string {
  return join(homeDir, ".kaku-harness", "session.json");
}

function writeSessionState(homeDir: string, state: StoredSession): void {
  const statePath = sessionStatePath(homeDir);
  const stateDirectory = dirname(statePath);
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporaryPath, statePath);
  chmodSync(statePath, 0o600);
}

function readSessionState(path: string): StoredSession | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredSession>;
    if (!value.baseUrl || !value.endpoint || !value.sessionId || !value.token || !value.client) return null;
    return value as StoredSession;
  } catch {
    return null;
  }
}

function normalizeEndpoint(value: string): string {
  return value.replace(/\/+$/, "");
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const value = await response.json() as { error?: string };
    return value.error ?? "";
  } catch {
    return "";
  }
}

function defaultRuntime(): CliRuntime {
  return {
    fetch,
    env: process.env,
    homeDir: homedir(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
    exists: existsSync,
    fileMode: (path) => {
      try {
        return statSync(path).mode & 0o777;
      } catch {
        return null;
      }
    }
  };
}

function printHelp(runtime: CliRuntime): void {
  runtime.stdout("Kaku ChatGPT Harness CLI (harnessctl)");
  runtime.stdout("Usage: harnessctl <command> [options]");
  runtime.stdout("");
  runtime.stdout("Commands:");
  runtime.stdout("  connect [client] --project <dir> [--profile <profile>]");
  runtime.stdout("  status [--endpoint <url>]");
  runtime.stdout("  doctor [--endpoint <url>]");
  runtime.stdout("  disconnect");
}

if (import.meta.main) {
  const exitCode = await handleCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
