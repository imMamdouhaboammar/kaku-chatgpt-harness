import { SessionAuth, SessionManager, CapabilityProfile } from "@harness/session-core";
import { HarnessLogger, EventJournal, redactText } from "@harness/observability";
import { PolicyAdapter } from "@harness/policy-adapter";
import { DesktopCommanderAdapter } from "@harness/execution-dc";
import { AgencyHarnessEngine } from "@harness/skill-index";
import { SubagentOrchestrator } from "@harness/subagents";

export interface GatewayConfig {
  port: number;
  stateFilePath: string;
  logFilePath: string;
  journalFilePath: string;
  secretKey?: string;
}

export class HarnessGateway {
  private readonly config: GatewayConfig;
  public readonly sessionManager: SessionManager;
  public readonly auth: SessionAuth;
  public readonly logger: HarnessLogger;
  public readonly journal: EventJournal;
  public readonly policy: PolicyAdapter;
  public readonly execAdapter: DesktopCommanderAdapter;
  public readonly agencyEngine: AgencyHarnessEngine;
  public readonly orchestrator: SubagentOrchestrator;
  private server: any = null;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config.stateFilePath);
    this.auth = new SessionAuth(config.secretKey);
    this.logger = new HarnessLogger(config.logFilePath);
    this.journal = new EventJournal(config.journalFilePath);
    this.policy = new PolicyAdapter();
    this.execAdapter = new DesktopCommanderAdapter();
    this.agencyEngine = new AgencyHarnessEngine();
    this.orchestrator = new SubagentOrchestrator();
  }

  public start(): void {
    const gateway = this;

    this.server = Bun.serve({
      port: this.config.port,
      async fetch(req: Request) {
        const url = new URL(req.url);

        // CORS Headers - restricted to local / approved origins
        const corsHeaders = {
          "Access-Control-Allow-Origin": "http://localhost:3000",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type"
        };

        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        // Health endpoint
        if (url.pathname === "/health") {
          return Response.json(
            { status: "ok", activeSessions: gateway.sessionManager.getActiveSessionCount() },
            { headers: corsHeaders }
          );
        }

        // Auth Connect Endpoint
        if (url.pathname === "/mcp/connect" && req.method === "POST") {
          try {
            const body = await req.json();
            const { client = "chatgpt", projectRoot, profile = "write-project" } = body;

            if (!projectRoot) {
              return Response.json({ error: "Missing projectRoot" }, { status: 400, headers: corsHeaders });
            }

            const session = gateway.sessionManager.createSession(client, projectRoot, profile as CapabilityProfile);
            const agencyProfile = gateway.agencyEngine.buildProfile(projectRoot);

            session.agencyHarness = {
              autoInjected: true,
              skillsCount: agencyProfile.skillsCount,
              availableRoles: agencyProfile.availableRoles,
              codingToolsCount: agencyProfile.codingTools.length
            };

            const token = gateway.auth.signToken({
              sessionId: session.sessionId,
              client,
              projectRoot,
              profile: session.profile,
              exp: Date.now() + 3600000
            });

            gateway.logger.info(`Session created with auto-injected Agency Harness`, { sessionId: session.sessionId, projectRoot, skillsCount: agencyProfile.skillsCount }, session.sessionId);
            gateway.journal.record("session_created", session.sessionId, { projectRoot, profile, agencyHarness: session.agencyHarness });

            return Response.json({
              sessionId: session.sessionId,
              token,
              expiresAt: session.expiresAt,
              agencyHarness: agencyProfile
            }, { headers: corsHeaders });
          } catch (err: any) {
            return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
          }
        }

        // Protected MCP RPC Endpoint
        if (url.pathname === "/mcp/rpc" && req.method === "POST") {
          const authHeader = req.headers.get("Authorization");
          const token = authHeader?.replace("Bearer ", "");
          const tokenPayload = token ? gateway.auth.verifyToken(token) : null;

          if (!tokenPayload) {
            return Response.json({ error: "Unauthorized or invalid session token" }, { status: 401, headers: corsHeaders });
          }

          const session = gateway.sessionManager.getSession(tokenPayload.sessionId);
          if (!session || session.status !== "active") {
            return Response.json({ error: "Session revoked or expired" }, { status: 403, headers: corsHeaders });
          }

          // Renew heartbeat
          gateway.sessionManager.heartbeat(session.sessionId);

          try {
            const body = await req.json();
            const { method, params } = body;

            // Get Agency Harness Profile
            if (method === "get_agency_harness") {
              const agencyProfile = gateway.agencyEngine.buildProfile(session.projectRoot);
              return Response.json({ result: agencyProfile }, { headers: corsHeaders });
            }

            // List Coding Tools
            if (method === "list_tools") {
              const tools = gateway.agencyEngine.generateCodingToolsManifest();
              return Response.json({ result: { tools } }, { headers: corsHeaders });
            }

            // Match Agency Skill
            if (method === "match_agency_skill") {
              const { query } = params || {};
              const skills = gateway.agencyEngine.scanAgencySkills(session.projectRoot);
              const matched = skills.filter((s) => s.name.includes(query) || s.description.includes(query));
              return Response.json({ result: { query, matchedSkills: matched.slice(0, 10) } }, { headers: corsHeaders });
            }

            // Spawn Subagent Task
            if (method === "spawn_subagent") {
              const { goal, backend = "codex", mode = "read-only", projectRoot = session.projectRoot } = params || {};
              if (!goal) return Response.json({ error: "Missing goal parameter" }, { status: 400, headers: corsHeaders });

              const task = gateway.orchestrator.spawnSubagent(goal, backend, projectRoot, mode);
              gateway.logger.info(`Subagent spawned (${backend})`, { subagentId: task.subagentId, goal }, session.sessionId);
              gateway.journal.record("subagent_spawned", session.sessionId, { subagentId: task.subagentId, backend, goal });

              return Response.json({ result: task }, { headers: corsHeaders });
            }

            // Get Subagent Status
            if (method === "get_subagent_status") {
              const { subagentId } = params || {};
              const task = gateway.orchestrator.getSubagentStatus(subagentId);
              if (!task) return Response.json({ error: "Subagent not found" }, { status: 404, headers: corsHeaders });
              return Response.json({ result: task }, { headers: corsHeaders });
            }

            // List Subagents
            if (method === "list_subagents") {
              const subagents = gateway.orchestrator.listSubagents();
              return Response.json({ result: { subagents } }, { headers: corsHeaders });
            }

            // Kill Subagent
            if (method === "kill_subagent") {
              const { subagentId } = params || {};
              const ok = gateway.orchestrator.killSubagent(subagentId);
              return Response.json({ result: { success: ok } }, { headers: corsHeaders });
            }

            // Execute RPC Tool
            if (method === "exec_command") {
              const { command, cwd = session.projectRoot } = params;

              // Policy check
              const policyCheck = gateway.policy.evaluateCommand(command, session.projectRoot);
              gateway.journal.record("policy_evaluated", session.sessionId, { command, allowed: policyCheck.allowed });

              if (!policyCheck.allowed) {
                return Response.json({ error: policyCheck.reason }, { status: 403, headers: corsHeaders });
              }

              const result = gateway.execAdapter.executeCommand({
                command,
                cwd,
                projectRoot: session.projectRoot,
                profile: session.profile
              });

              gateway.logger.info("Command executed", { command, exitCode: result.exitCode }, session.sessionId);
              return Response.json({ result }, { headers: corsHeaders });
            }

            return Response.json({ error: `Unsupported method '${method}'` }, { status: 400, headers: corsHeaders });
          } catch (err: any) {
            return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
          }
        }

        return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });
      }
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }
}
