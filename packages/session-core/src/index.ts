import { timingSafeEqual } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

export type CapabilityProfile = "read-only" | "project-write" | "full-local";

export interface CreateSessionInput {
  client: string;
  projectRoot: string;
  profile?: CapabilityProfile;
  ttlMs?: number;
}

export interface SessionManagerOptions {
  defaultTtlMs?: number;
  maxSessions?: number;
  allowFullLocal?: boolean;
}

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

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 32;
const PROFILES = new Set<CapabilityProfile>(["read-only", "project-write", "full-local"]);

export class SessionManager {
  private readonly sessions = new Map<string, SessionLease>();
  private readonly defaultTtlMs: number;
  private readonly maxSessions: number;
  private readonly allowFullLocal: boolean;

  constructor(options: SessionManagerOptions = {}) {
    this.defaultTtlMs = positiveInteger(options.defaultTtlMs ?? DEFAULT_TTL_MS, "defaultTtlMs");
    this.maxSessions = positiveInteger(options.maxSessions ?? DEFAULT_MAX_SESSIONS, "maxSessions");
    this.allowFullLocal = options.allowFullLocal ?? false;
  }

  public get currentClient(): string {
    this.reapOrphans();
    return Array.from(this.sessions.values()).at(-1)?.client ?? "uninitialized";
  }

  public createSession(input: CreateSessionInput): SessionLease {
    this.reapOrphans();
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Active session capacity of ${this.maxSessions} has been reached.`);
    }

    if (typeof input.client !== "string") throw new Error("Session client identity is required.");
    const client = input.client.trim();
    if (!client) throw new Error("Session client identity is required.");
    if (typeof input.projectRoot !== "string" || !isAbsolute(input.projectRoot)) {
      throw new Error("Session projectRoot must be absolute.");
    }

    const profile = input.profile ?? "project-write";
    if (!PROFILES.has(profile)) throw new Error(`Unsupported capability profile: ${String(profile)}`);
    if (profile === "full-local" && !this.allowFullLocal) {
      throw new Error("The full-local capability profile is disabled.");
    }

    const now = Date.now();
    const lease: SessionLease = {
      sessionId: crypto.randomUUID(),
      client,
      projectRoot: resolve(input.projectRoot),
      profile,
      authToken: `harness_${crypto.randomUUID().replaceAll("-", "")}`,
      createdAt: now,
      lastSeenAt: now,
      ttlMs: positiveInteger(input.ttlMs ?? this.defaultTtlMs, "ttlMs"),
      processIds: [],
      worktreePaths: []
    };

    this.sessions.set(lease.sessionId, lease);
    return lease;
  }

  public validateToken(sessionId: string, token: string): boolean {
    const lease = this.sessions.get(sessionId);
    if (!lease || this.isExpired(lease)) {
      if (lease) this.sessions.delete(sessionId);
      return false;
    }
    if (!secureEqual(lease.authToken, token)) return false;

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

  public getCurrentClient(): string {
    return this.currentClient;
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
    for (const [id, lease] of this.sessions.entries()) {
      if (this.isExpired(lease)) {
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

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function secureEqual(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export * from "./prompt-cache.js";
export * from "./confidence-stepping.js";
export * from "./vector-memory.js";

