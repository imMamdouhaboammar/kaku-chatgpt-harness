import { chmodSync, existsSync, openSync, writeFileSync } from "fs";

export interface LogEvent {
  timestamp: string;
  sessionId?: string;
  level: "INFO" | "WARN" | "ERROR" | "SECURITY";
  message: string;
  context?: Record<string, unknown>;
}

export class RedactedLogger {
  private logFilePath: string;
  private readonly secretPatterns: RegExp[] = [
    /sk-[a-zA-Z0-9]{32,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /harness_[a-zA-Z0-9_-]{16,}/g,
    /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
    /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
    /api[-_]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi
  ];
  private readonly sensitiveKeyPattern = /(token|secret|password|authorization|api[-_]?key)/i;

  constructor(logFilePath: string) {
    this.logFilePath = logFilePath;
    this.ensureSecureFile();
  }

  private ensureSecureFile(): void {
    if (!existsSync(this.logFilePath)) {
      const fd = openSync(this.logFilePath, "w", 0o600);
      writeFileSync(fd, "");
    } else {
      chmodSync(this.logFilePath, 0o600);
    }
  }

  public redact(text: string): string {
    let sanitized = text;
    for (const pattern of this.secretPatterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED_SECRET]");
    }
    return sanitized;
  }

  public redactValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
    if (key && this.sensitiveKeyPattern.test(key)) return "[REDACTED_SECRET]";
    if (typeof value === "string") return this.redact(value);
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    if (value instanceof Date) return this.redact(value.toISOString());
    if (value instanceof Error) {
      return {
        name: value.name,
        message: this.redact(value.message),
        stack: value.stack ? this.redact(value.stack) : undefined,
        cause: value.cause === undefined ? undefined : this.redactValue(value.cause, "cause", seen)
      };
    }
    if (value instanceof Map) {
      return {
        type: "Map",
        entries: Array.from(value.entries()).map(([entryKey, entryValue]) => [
          this.redactValue(entryKey, undefined, seen),
          this.redactValue(entryValue, typeof entryKey === "string" ? entryKey : undefined, seen)
        ])
      };
    }
    if (value instanceof Set) {
      return { type: "Set", values: Array.from(value.values()).map((item) => this.redactValue(item, undefined, seen)) };
    }
    if (Array.isArray(value)) return value.map((item) => this.redactValue(item, undefined, seen));

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        type: value.constructor?.name ?? "Object",
        value: this.redact(String(value))
      };
    }

    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        this.redactValue(childValue, childKey, seen)
      ])
    );
  }

  public log(level: LogEvent["level"], message: string, sessionId?: string, context?: Record<string, unknown>): LogEvent {
    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      sessionId,
      message: this.redact(message),
      context: context ? this.redactValue(context) as Record<string, unknown> : undefined
    };

    const line = JSON.stringify(event) + "\n";
    writeFileSync(this.logFilePath, line, { flag: "a" });
    this.ensureSecureFile();
    return event;
  }

  public getLogPath(): string {
    return this.logFilePath;
  }
}
