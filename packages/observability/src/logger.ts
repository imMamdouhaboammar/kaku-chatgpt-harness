import { appendFileSync, chmodSync, existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import { redactValue } from "./redactor.ts";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  sessionId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class HarnessLogger {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensurePrivateFile();
  }

  private ensurePrivateFile(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      const fd = openSync(this.filePath, "a", 0o600);
      closeSync(fd);
    }
    chmodSync(this.filePath, 0o600);
  }

  public log(level: "info" | "warn" | "error" | "debug", message: string, metadata?: Record<string, unknown>, sessionId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      sessionId,
      message: redactValue(message) as string,
      metadata: redactValue(metadata) as Record<string, unknown> | undefined
    };
    appendFileSync(this.filePath, JSON.stringify(entry) + "\n", "utf8");
  }

  public info(message: string, metadata?: Record<string, unknown>, sessionId?: string): void {
    this.log("info", message, metadata, sessionId);
  }

  public warn(message: string, metadata?: Record<string, unknown>, sessionId?: string): void {
    this.log("warn", message, metadata, sessionId);
  }

  public error(message: string, metadata?: Record<string, unknown>, sessionId?: string): void {
    this.log("error", message, metadata, sessionId);
  }

  public debug(message: string, metadata?: Record<string, unknown>, sessionId?: string): void {
    this.log("debug", message, metadata, sessionId);
  }
}
