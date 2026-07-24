export type CapabilityProfile = "read-only" | "project-write" | "full-local";

export interface SessionLease {
  sessionId: string;
  client: string;
  projectRoot: string;
  profile: CapabilityProfile;
  authToken: string;
  createdAt: number;
  lastSeenAt: number;
  ttlMs: number;
  processIds: number[];
  worktreePaths: string[];
}

export class SessionManager {
  private sessions: Map<string, SessionLease> = new Map();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 3600 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  public createSession(client: string, projectRoot: string, profile: CapabilityProfile = "project-write"): SessionLease {
    const sessionId = crypto.randomUUID();
    const authToken = "harness_" + crypto.randomUUID().replace(/-/g, "");
    const now = Date.now();

    const lease: SessionLease = {
      sessionId,
      client,
      projectRoot,
      profile,
      authToken,
      createdAt: now,
      lastSeenAt: now,
      ttlMs: this.defaultTtlMs,
      processIds: [],
      worktreePaths: []
    };

    this.sessions.set(sessionId, lease);
    return lease;
  }

  public validateToken(sessionId: string, token: string): boolean {
    const lease = this.sessions.get(sessionId);
    if (!lease) return false;
    if (this.isExpired(lease)) {
      this.sessions.delete(sessionId);
      return false;
    }
    if (lease.authToken !== token) return false;

    lease.lastSeenAt = Date.now();
    return true;
  }

  public getSession(sessionId: string): SessionLease | undefined {
    const lease = this.sessions.get(sessionId);
    if (lease && this.isExpired(lease)) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return lease;
  }

  public listActiveSessions(): SessionLease[] {
    this.reapOrphans();
    return Array.from(this.sessions.values());
  }

  public revokeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  public reapOrphans(): number {
    let reaped = 0;
    const now = Date.now();
    for (const [id, lease] of this.sessions.entries()) {
      if (now - lease.lastSeenAt > lease.ttlMs) {
        this.sessions.delete(id);
        reaped++;
      }
    }
    return reaped;
  }

  private isExpired(lease: SessionLease): boolean {
    return Date.now() - lease.lastSeenAt > lease.ttlMs;
  }
}
