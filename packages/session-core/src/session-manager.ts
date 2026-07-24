import { CapabilityProfile, SessionRecord } from "./types.ts";
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export class SessionManager {
  private sessions: Map<string, SessionRecord> = new Map();
  private readonly maxSessions: number;
  private readonly defaultTtlMs: number;
  private readonly stateFilePath: string;

  constructor(stateFilePath: string, maxSessions = 5, defaultTtlMs = 3600000) {
    this.stateFilePath = stateFilePath;
    this.maxSessions = maxSessions;
    this.defaultTtlMs = defaultTtlMs;
    this.loadState();
  }

  public createSession(client: string, projectRoot: string, profile: CapabilityProfile = "write-project"): SessionRecord {
    this.reapOrphans();

    if (this.getActiveSessionCount() >= this.maxSessions) {
      throw new Error(`Maximum concurrent session cap of ${this.maxSessions} reached.`);
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultTtlMs);

    const record: SessionRecord = {
      sessionId,
      client,
      projectRoot,
      profile,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      processIds: [],
      worktreePaths: [],
      approvalState: {},
      status: "active"
    };

    this.sessions.set(sessionId, record);
    this.saveState();
    return record;
  }

  public heartbeat(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return false;

    const now = new Date();
    if (now.getTime() > new Date(session.expiresAt).getTime()) {
      this.expireSession(sessionId);
      return false;
    }

    session.lastSeenAt = now.toISOString();
    session.expiresAt = new Date(now.getTime() + this.defaultTtlMs).toISOString();
    this.saveState();
    return true;
  }

  public registerProcess(sessionId: string, pid: number): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.processIds.includes(pid)) {
      session.processIds.push(pid);
      this.saveState();
    }
  }

  public registerWorktree(sessionId: string, worktreePath: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.worktreePaths.includes(worktreePath)) {
      session.worktreePaths.push(worktreePath);
      this.saveState();
    }
  }

  public getSession(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }

  public revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = "revoked";
    this.killSessionProcesses(session);
    this.cleanupSessionWorktrees(session);
    this.saveState();
    return true;
  }

  public expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.status = "expired";
    this.killSessionProcesses(session);
    this.cleanupSessionWorktrees(session);
    this.saveState();
  }

  public reapOrphans(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.status === "active" && now > new Date(session.expiresAt).getTime()) {
        this.expireSession(session.sessionId);
      }
    }
  }

  public getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter((s) => s.status === "active").length;
  }

  private killSessionProcesses(session: SessionRecord): void {
    for (const pid of session.processIds) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process already stopped
      }
    }
    session.processIds = [];
  }

  private cleanupSessionWorktrees(session: SessionRecord): void {
    for (const wtPath of session.worktreePaths) {
      try {
        if (existsSync(wtPath)) {
          rmSync(wtPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore removal error
      }
    }
    session.worktreePaths = [];
  }

  private saveState(): void {
    try {
      const dir = dirname(this.stateFilePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const records = Array.from(this.sessions.values());
      writeFileSync(this.stateFilePath, JSON.stringify(records, null, 2), "utf8");
    } catch {
      // Failed to persist state file
    }
  }

  private loadState(): void {
    if (!existsSync(this.stateFilePath)) return;
    try {
      const content = readFileSync(this.stateFilePath, "utf8");
      const records = JSON.parse(content) as SessionRecord[];
      for (const rec of records) {
        this.sessions.set(rec.sessionId, rec);
      }
    } catch {
      // Ignore corrupted state
    }
  }
}
