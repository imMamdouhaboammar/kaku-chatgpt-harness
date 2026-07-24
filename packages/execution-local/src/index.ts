import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { PolicyAdapter } from "@kaku-harness/policy-adapter";
import type { PolicyEvaluationRequest } from "@kaku-harness/policy-adapter";
import type { SessionLease } from "@kaku-harness/session-core";

export interface LocalExecutorOptions {
  policy?: PolicyAdapter;
  maxOutputBytes?: number;
  commandTimeoutMs?: number;
  maxDirectoryEntries?: number;
}

export interface ReadTextResult {
  content: string;
  bytes: number;
  truncated: boolean;
}

export interface ListResult {
  entries: Array<{ name: string; type: "file" | "directory" | "symlink" | "other" }>;
  truncated: boolean;
}

export interface ProcessRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type LocalToolResult = ReadTextResult | ListResult | ProcessRunResult;

export class LocalExecutionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LocalExecutionError";
  }
}

export class LocalExecutor {
  private readonly policy: PolicyAdapter;
  private readonly maxOutputBytes: number;
  private readonly commandTimeoutMs: number;
  private readonly maxDirectoryEntries: number;

  constructor(options: LocalExecutorOptions = {}) {
    this.policy = options.policy ?? new PolicyAdapter();
    this.maxOutputBytes = positiveInteger(options.maxOutputBytes ?? 256 * 1024, "maxOutputBytes");
    this.commandTimeoutMs = positiveInteger(options.commandTimeoutMs ?? 30_000, "commandTimeoutMs");
    this.maxDirectoryEntries = positiveInteger(options.maxDirectoryEntries ?? 1_000, "maxDirectoryEntries");
  }

  public execute(toolName: "fs.readText", args: { path: string }, lease: SessionLease): Promise<ReadTextResult>;
  public execute(toolName: "fs.list", args: { path: string }, lease: SessionLease): Promise<ListResult>;
  public execute(toolName: "process.run", args: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }, lease: SessionLease): Promise<ProcessRunResult>;
  public execute(toolName: string, args: Record<string, unknown>, lease: SessionLease): Promise<LocalToolResult>;
  public async execute(toolName: string, args: Record<string, unknown>, lease: SessionLease): Promise<LocalToolResult> {
    switch (toolName) {
      case "fs.readText":
        return this.readText(requireString(args.path, "path"), lease);
      case "fs.list":
        return this.list(requireString(args.path, "path"), lease);
      case "process.run":
        return this.runProcess(args, lease);
      default:
        throw new LocalExecutionError("TOOL_NOT_FOUND", `Unknown local tool: ${toolName}`);
    }
  }

  private async readText(inputPath: string, lease: SessionLease): Promise<ReadTextResult> {
    const targetPath = resolveForLease(inputPath, lease);
    this.assertPolicy({ action: "read", targetPath, projectRoot: lease.projectRoot, profile: lease.profile });

    const handle = await open(targetPath, "r");
    try {
      const buffer = Buffer.alloc(this.maxOutputBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const truncated = bytesRead > this.maxOutputBytes;
      const visibleBytes = Math.min(bytesRead, this.maxOutputBytes);
      return {
        content: buffer.subarray(0, visibleBytes).toString("utf8"),
        bytes: visibleBytes,
        truncated
      };
    } finally {
      await handle.close();
    }
  }

  private async list(inputPath: string, lease: SessionLease): Promise<ListResult> {
    const targetPath = resolveForLease(inputPath, lease);
    this.assertPolicy({ action: "read", targetPath, projectRoot: lease.projectRoot, profile: lease.profile });

    const directoryEntries = await readdir(targetPath, { withFileTypes: true });
    const truncated = directoryEntries.length > this.maxDirectoryEntries;
    const entries = directoryEntries
      .slice(0, this.maxDirectoryEntries)
      .map((entry) => ({ name: entry.name, type: entryType(entry) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { entries, truncated };
  }


  private runProcess(args: Record<string, unknown>, lease: SessionLease): Promise<ProcessRunResult> {
    const command = requireString(args.command, "command");
    const commandArgs = optionalStringArray(args.args, "args");
    const cwdInput = args.cwd === undefined ? lease.projectRoot : requireString(args.cwd, "cwd");
    const cwd = resolveForLease(cwdInput, lease);
    const requestedTimeout = args.timeoutMs === undefined
      ? this.commandTimeoutMs
      : positiveInteger(args.timeoutMs, "timeoutMs");
    const timeoutMs = Math.min(requestedTimeout, this.commandTimeoutMs);

    this.assertPolicy({
      action: "execute",
      targetPath: cwd,
      command: [command, ...commandArgs].join(" "),
      projectRoot: lease.projectRoot,
      profile: lease.profile
    });

    return new Promise((resolvePromise, rejectPromise) => {
      const startedAt = Date.now();
      const child = spawn(command, commandArgs, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let totalBytes = 0;
      let timedOut = false;
      let outputExceeded = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      timer.unref();

      const capture = (target: Buffer[], chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += bytes.length;
        if (totalBytes > this.maxOutputBytes) {
          outputExceeded = true;
          child.kill("SIGKILL");
          return;
        }
        target.push(bytes);
      };

      child.stdout?.on("data", (chunk) => capture(stdout, chunk));
      child.stderr?.on("data", (chunk) => capture(stderr, chunk));
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(new LocalExecutionError("SPAWN_FAILED", error.message));
      });
      child.once("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (outputExceeded) {
          rejectPromise(new LocalExecutionError("OUTPUT_LIMIT", `Process output exceeded ${this.maxOutputBytes} bytes.`));
          return;
        }

        if (timedOut) {
          rejectPromise(new LocalExecutionError("TIMEOUT", `Process exceeded the ${timeoutMs}ms timeout.`));
          return;
        }
        resolvePromise({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          durationMs: Date.now() - startedAt
        });
      });
    });
  }

  private assertPolicy(request: PolicyEvaluationRequest): void {
    const decision = this.policy.evaluate(request);
    if (!decision.allowed) {
      throw new LocalExecutionError(decision.code ?? "POLICY_DENIED", decision.reason ?? "Operation denied by policy.");
    }
  }
}

function resolveForLease(inputPath: string, lease: SessionLease): string {
  return isAbsolute(inputPath) ? resolve(inputPath) : resolve(lease.projectRoot, inputPath);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new LocalExecutionError("INVALID_ARGUMENT", `${name} must be a non-empty string.`);
  }
  return value;
}

function optionalStringArray(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new LocalExecutionError("INVALID_ARGUMENT", `${name} must be an array of strings.`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new LocalExecutionError("INVALID_ARGUMENT", `${name} must be a positive integer.`);
  }
  return value;
}

function entryType(entry: Dirent): "file" | "directory" | "symlink" | "other" {
  if (entry.isFile()) return "file";
  if (entry.isDirectory()) return "directory";
  if (entry.isSymbolicLink()) return "symlink";
  return "other";
}
