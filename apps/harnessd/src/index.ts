import { SessionManager } from "@kaku-harness/session-core";
import { PolicyAdapter } from "@kaku-harness/policy-adapter";
import { RedactedLogger } from "@kaku-harness/observability";

export class HarnessDaemon {
  public sessionMgr: SessionManager;
  public policyAdapter: PolicyAdapter;
  public logger: RedactedLogger;
  private port: number;

  constructor(port = 8765, logPath = "/tmp/harnessd_daemon.log") {
    this.port = port;
    this.sessionMgr = new SessionManager();
    this.policyAdapter = new PolicyAdapter();
    this.logger = new RedactedLogger(logPath);
  }

  public handleRequest(req: Request): Response {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "UP", activeSessions: this.sessionMgr.listActiveSessions().length }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Auth endpoint to issue lease
    if (url.pathname === "/mcp/v1/auth" && req.method === "POST") {
      const lease = this.sessionMgr.createSession("chatgpt", process.cwd(), "project-write");
      this.logger.log("INFO", `Created session ${lease.sessionId} for chatgpt`);
      return new Response(JSON.stringify({ sessionId: lease.sessionId, token: lease.authToken, endpoint: `/mcp/v1/session/${lease.sessionId}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // MCP Streamable HTTP tool endpoint
    if (url.pathname.startsWith("/mcp/v1/session/")) {
      const parts = url.pathname.split("/");
      const sessionId = parts[4];
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");

      if (!sessionId || !token || !this.sessionMgr.validateToken(sessionId, token)) {
        this.logger.log("SECURITY", `Unauthorized access attempt on session ${sessionId}`);
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }

      // Valid session request
      const session = this.sessionMgr.getSession(sessionId)!;
      this.logger.log("INFO", `Handled MCP tool call for session ${sessionId}`);
      return new Response(JSON.stringify({ jsonrpc: "2.0", result: { status: "EXECUTED", projectRoot: session.projectRoot } }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  }

  public startServer() {
    this.logger.log("INFO", `Starting harnessd server on port ${this.port}`);
    return Bun.serve({
      port: this.port,
      fetch: (req) => this.handleRequest(req)
    });
  }
}

if (import.meta.main) {
  const daemon = new HarnessDaemon();
  const server = daemon.startServer();
  console.log(`[harnessd] Daemon listening on http://127.0.0.1:${server.port}`);
}
