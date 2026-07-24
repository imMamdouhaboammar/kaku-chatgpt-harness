import { spawn, ChildProcess } from "node:child_process";
import { openSync, closeSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SubagentBackend, SubagentTaskRecord } from "./contract-schema.ts";

export interface SpawnOptions {
  taskId: string;
  goal: string;
  projectRoot: string;
  backend: SubagentBackend;
  logFilePath: string;
}

export class SubagentRunner {
  private activeProcesses: Map<string, { process: ChildProcess; record: SubagentTaskRecord }> = new Map();

  public spawn(options: SpawnOptions): SubagentTaskRecord {
    const subagentId = `sub_${crypto.randomUUID().slice(0, 8)}`;
    this.ensurePrivateLogFile(options.logFilePath);

    const logFd = openSync(options.logFilePath, "a", 0o600);
    const backendCmd = options.backend === "codex" ? "codex" : options.backend;

    const child = spawn("delegate-team", ["delegate", backendCmd, options.goal], {
      cwd: options.projectRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd]
    });

    closeSync(logFd);
    child.unref();

    const record: SubagentTaskRecord = {
      subagentId,
      taskId: options.taskId,
      goal: options.goal,
      backend: options.backend,
      projectRoot: options.projectRoot,
      status: "running",
      pid: child.pid || 0,
      logFilePath: options.logFilePath,
      createdAt: new Date().toISOString()
    };

    this.activeProcesses.set(subagentId, { process: child, record });
    return record;
  }

  public getStatus(subagentId: string): SubagentTaskRecord | null {
    const item = this.activeProcesses.get(subagentId);
    if (!item) return null;
    return item.record;
  }

  public listTasks(): SubagentTaskRecord[] {
    return Array.from(this.activeProcesses.values()).map((i) => i.record);
  }

  public kill(subagentId: string): boolean {
    const item = this.activeProcesses.get(subagentId);
    if (!item) return false;

    try {
      if (item.record.pid > 0) {
        process.kill(item.record.pid, "SIGKILL");
      }
    } catch {
      // Process already exited
    }

    item.record.status = "killed";
    item.record.finishedAt = new Date().toISOString();
    return true;
  }

  private ensurePrivateLogFile(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(filePath)) {
      const fd = openSync(filePath, "a", 0o600);
      closeSync(fd);
    }
    chmodSync(filePath, 0o600);
  }
}
