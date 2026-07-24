import { timingSafeEqual } from "node:crypto";
import { LocalExecutionError, LocalExecutor } from "@kaku-harness/execution-local";
import { RedactedLogger } from "@kaku-harness/observability";
import { PolicyAdapter } from "@kaku-harness/policy-adapter";
import {
  JsonRpcProtocolError,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpcRequest
} from "@kaku-harness/protocol";
import type { JsonRpcId, JsonRpcRequest } from "@kaku-harness/protocol";
import { SessionManager } from "@kaku-harness/session-core";
import type { CapabilityProfile, SessionLease } from "@kaku-harness/session-core";

const HARNESS_VERSION = "0.0.1";
const DEFAULT_PORT = 8765;
const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;

export interface HarnessDaemonOptions {
  port?: number;
  hostname?: string;
  logPath?: string;
  bootstrapToken?: string;
  buildCommit?: string;
  allowFullLocal?: boolean;
  maxRequestBytes?: number;
  sessionTtlMs?: number;
  maxSessions?: number;
}

export class HarnessDaemon {
  public readonly sessionMgr: SessionManager;
  public readonly policyAdapter: PolicyAdapter;
  public readonly logger: RedactedLogger;
  public readonly executor: LocalExecutor;
  private readonly port: number;
  private readonly hostname: string;
  private readonly bootstrapToken: string;
  private readonly buildCommit: string;
  private readonly maxRequestBytes: number;
  private readonly startedAt = Date.now();

  constructor(options: HarnessDaemonOptions = {}) {
    const allowFullLocal = options.allowFullLocal ?? false;
    this.port = options.port ?? DEFAULT_PORT;
    this.hostname = options.hostname ?? "127.0.0.1";
    this.bootstrapToken = options.bootstrapToken ?? process.env.HARNESS_BOOTSTRAP_TOKEN ?? "";
    this.buildCommit = options.buildCommit ?? process.env.HARNESS_BUILD_COMMIT ?? "development";
    this.maxRequestBytes = positiveInteger(options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES, "maxRequestBytes");
    this.sessionMgr = new SessionManager({
      defaultTtlMs: options.sessionTtlMs,
      maxSessions: options.maxSessions,
      allowFullLocal
    });
    this.policyAdapter = new PolicyAdapter({ allowFullLocal });
    this.executor = new LocalExecutor({ policy: this.policyAdapter });
    this.logger = new RedactedLogger(options.logPath ?? "/tmp/harnessd_daemon.log");
  }

  public get currentClient(): string {
    return this.sessionMgr.currentClient;
  }

  public async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") {
        if (request.method !== "GET") return methodNotAllowed(["GET"]);
        return this.healthResponse();
      }

      if (url.pathname === "/mcp/v1/auth") {
        if (request.method !== "POST") return methodNotAllowed(["POST"]);
        return await this.handleAuth(request);
      }

      const sessionMatch = url.pathname.match(/^\/mcp\/v1\/session\/([^/]+)$/);
      if (sessionMatch) {
        return await this.handleSession(request, decodeURIComponent(sessionMatch[1]));
      }

      return jsonResponse({ error: "Not Found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
      this.logger.log("ERROR", "Unhandled daemon request failure", undefined, {
        error: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  }

  private healthResponse(): Response {
    const sessions = this.sessionMgr.listActiveSessions();
    return jsonResponse({
      status: "ok",
      version: HARNESS_VERSION,
      buildCommit: this.buildCommit,
      pid: process.pid,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      activeSessions: sessions.length,
      currentClient: this.currentClient,
      clients: Array.from(new Set(sessions.map((session) => session.client)))
    });
  }

  private async handleAuth(request: Request): Promise<Response> {
    if (!this.bootstrapToken) {
      return jsonResponse({ error: "Harness bootstrap authentication is not configured." }, 503);
    }
    if (!secureEqual(this.bootstrapToken, bearerToken(request))) {
      this.logger.log("SECURITY", "Rejected unauthorized lease request");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await this.readJsonObject(request);
    const client = requireHttpString(body.client, "client");
    const projectRoot = requireHttpString(body.projectRoot, "projectRoot");
    const profile = optionalProfile(body.profile);

    try {
      const lease = this.sessionMgr.createSession({ client, projectRoot, profile });
      this.logger.log("INFO", `Created session ${lease.sessionId} for client '${lease.client}'`, lease.sessionId, {
        projectRoot: lease.projectRoot,
        profile: lease.profile
      });
      return jsonResponse({
        sessionId: lease.sessionId,
        client: lease.client,
        profile: lease.profile,
        expiresAt: new Date(lease.lastSeenAt + lease.ttlMs).toISOString(),
        token: lease.authToken,
        endpoint: `/mcp/v1/session/${lease.sessionId}`
      }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session creation failed.";
      const status = message.includes("full-local") ? 403 : message.includes("capacity") ? 429 : 400;
      this.logger.log("SECURITY", "Rejected lease request", undefined, { reason: message });
      return jsonResponse({ error: message }, status);
    }
  }

  private async handleSession(request: Request, sessionId: string): Promise<Response> {
    const token = bearerToken(request);
    if (!token || !this.sessionMgr.validateToken(sessionId, token)) {
      this.logger.log("SECURITY", `Rejected unauthorized session request for ${sessionId}`);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (request.method === "DELETE") {
      this.sessionMgr.revokeSession(sessionId);
      this.logger.log("INFO", `Revoked session ${sessionId}`, sessionId);
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST") return methodNotAllowed(["POST", "DELETE"]);

    return this.handleRpcRequest(request, this.sessionMgr.getSession(sessionId)!);
  }

  private async handleRpcRequest(request: Request, lease: SessionLease): Promise<Response> {
    let body: unknown;
    try {
      body = await this.readJsonValue(request);
    } catch (error) {
      if (error instanceof HttpError && error.status === 400) {
        return jsonResponse(jsonRpcError(null, -32700, "Parse error"));
      }
      throw error;
    }

    let rpcRequest: JsonRpcRequest;
    try {
      rpcRequest = parseJsonRpcRequest(body);
    } catch (error) {
      if (error instanceof JsonRpcProtocolError) {
        return jsonResponse(jsonRpcError(extractRequestId(body), error.code, error.message, error.data));
      }
      throw error;
    }

    try {
      const result = await this.dispatchRpc(rpcRequest, lease);
      if (rpcRequest.id === undefined) return new Response(null, { status: 204 });
      return jsonResponse(jsonRpcResult(rpcRequest.id, result));
    } catch (error) {
      if (rpcRequest.id === undefined) return new Response(null, { status: 204 });
      if (error instanceof RpcApplicationError) {
        return jsonResponse(jsonRpcError(rpcRequest.id, error.rpcCode, error.message, error.data));
      }
      if (error instanceof LocalExecutionError) {
        this.logger.log("SECURITY", `Tool execution rejected for session ${lease.sessionId}`, lease.sessionId, {
          code: error.code
        });
        return jsonResponse(jsonRpcError(rpcRequest.id, -32001, "Tool execution denied", { code: error.code }));
      }
      this.logger.log("ERROR", `Tool execution failed for session ${lease.sessionId}`, lease.sessionId, {
        error: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(jsonRpcError(rpcRequest.id, -32603, "Internal error"));
    }
  }

  private async dispatchRpc(request: JsonRpcRequest, lease: SessionLease): Promise<unknown> {
    if (request.method === "ping") return { status: "ok" };
    if (request.method === "notifications/initialized") return null;
    if (request.method === "tools/list") return { tools: TOOL_DESCRIPTORS };
    if (request.method !== "tools/call") {
      throw new RpcApplicationError(-32601, "Method not found");
    }

    const params = requireRecord(request.params, "params");
    const name = requireRpcString(params.name, "params.name");
    const argumentsValue = params.arguments === undefined ? {} : requireRecord(params.arguments, "params.arguments");
    return this.executor.execute(name, argumentsValue, lease);
  }

  private async readJsonObject(request: Request): Promise<Record<string, unknown>> {
    const value = await this.readJsonValue(request);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new HttpError(400, "body must be a JSON object.");
    }
    return value as Record<string, unknown>;
  }

  private async readJsonValue(request: Request): Promise<unknown> {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new HttpError(415, "Content-Type must be application/json.");
    }

    const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > this.maxRequestBytes) {
      throw new HttpError(413, "Request body is too large.");
    }

    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > this.maxRequestBytes) {
      throw new HttpError(413, "Request body is too large.");
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, "Request body is not valid JSON.");
    }
  }

  public startServer() {
    if (!this.bootstrapToken) {
      throw new Error("HARNESS_BOOTSTRAP_TOKEN is required before starting harnessd.");
    }
    this.logger.log("INFO", `Starting harnessd server on ${this.hostname}:${this.port}`);
    return Bun.serve({
      hostname: this.hostname,
      port: this.port,
      fetch: (request) => this.handleRequest(request)
    });
  }
}

const TOOL_DESCRIPTORS = [
  {
    name: "fs.readText",
    description: "Read bounded UTF-8 text from a file inside the authenticated project.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "fs.list",
    description: "List bounded directory entries inside the authenticated project.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "process.run",
    description: "Run an executable with an argument array and no shell interpolation.",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      additionalProperties: false
    }
  }
] as const;

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

class RpcApplicationError extends Error {
  constructor(
    public readonly rpcCode: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "RpcApplicationError";
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function methodNotAllowed(allowed: string[]): Response {
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Allow: allowed.join(", ")
    }
  });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

function secureEqual(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RpcApplicationError(-32602, `${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}


function requireHttpString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function requireRpcString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RpcApplicationError(-32602, `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalProfile(value: unknown): CapabilityProfile | undefined {
  if (value === undefined) return undefined;
  if (value === "read-only" || value === "project-write" || value === "full-local") return value;
  throw new HttpError(400, "profile must be read-only, project-write, or full-local.");
}

function extractRequestId(value: unknown): JsonRpcId {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return id === null || typeof id === "string" || (typeof id === "number" && Number.isFinite(id)) ? id : null;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

if (import.meta.main) {
  try {
    const configuredPort = process.env.HARNESS_PORT ? Number(process.env.HARNESS_PORT) : undefined;
    const daemon = new HarnessDaemon({
      port: configuredPort,
      hostname: process.env.HARNESS_HOST,
      logPath: process.env.HARNESS_LOG_PATH,
      allowFullLocal: process.env.HARNESS_ALLOW_FULL_LOCAL === "1"
    });
    const server = daemon.startServer();
    console.log(`[harnessd] listening on http://${server.hostname}:${server.port}`);
  } catch (error) {
    console.error(`[harnessd] failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
