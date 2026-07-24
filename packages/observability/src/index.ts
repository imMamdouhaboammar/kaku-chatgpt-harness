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
  private secretPatterns: RegExp[] = [
    /sk-[a-zA-Z0-9]{32,}/g, // OpenAI style key
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub PAT
    /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, // Bearer token
    /password["']?\s*[:=]\s*["']?[^"'\s]+/gi, // Password strings
    /api[-_]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi // API keys
  ];

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

  public log(level: LogEvent["level"], message: string, sessionId?: string, context?: Record<string, unknown>): LogEvent {
    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      sessionId,
      message: this.redact(message),
      context: context ? JSON.parse(this.redact(JSON.stringify(context))) : undefined
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
