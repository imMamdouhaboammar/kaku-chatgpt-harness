import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const home = process.env.HOME || "/Users/mamdouhaboammar";
const baseDir = join(home, ".harnessd");
const stateFilePath = join(baseDir, "session_state.json");
const logFilePath = join(baseDir, "harness.log");
const port = Number(process.env.HARNESS_PORT) || 8765;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    project: { type: "string", default: process.cwd() },
    profile: { type: "string", default: "write-project" }
  },
  allowPositionals: true
});

const command = positionals[0] || "status";

async function main() {
  switch (command) {
    case "start": {
      console.log("Starting harnessd daemon...");
      const entry = join(__dirname, "../../harnessd/src/index.ts");
      try {
        const proc = Bun.spawn(["bun", "run", entry], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"]
        });
        proc.unref();
        console.log(`harnessd daemon started with PID ${proc.pid}`);
      } catch (err: any) {
        console.error("Failed to start harnessd:", err.message);
      }
      break;
    }

    case "status": {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        const data = await res.json();
        console.log(`harnessd status: ONLINE (Active Sessions: ${data.activeSessions})`);
      } catch {
        console.log("harnessd status: OFFLINE");
      }
      break;
    }

    case "doctor": {
      console.log("=== harnessctl doctor diagnostic check ===");

      // Check Bun
      console.log(`[PASS] Bun runtime version: ${Bun.version}`);

      // Check Log permissions
      if (existsSync(logFilePath)) {
        const stats = statSync(logFilePath);
        const mode = (stats.mode & 0o777).toString(8);
        if (mode === "600") {
          console.log(`[PASS] Log permissions mode 0600 verified (${logFilePath})`);
        } else {
          console.log(`[WARN] Log permissions mode is ${mode}, expected 0600`);
        }
      } else {
        console.log(`[INFO] Log file not created yet (${logFilePath})`);
      }

      // Check Agent Kernel
      try {
        execSync("agent-kernel --version 2>/dev/null");
        console.log("[PASS] Agent Kernel CLI detected");
      } catch {
        console.log("[INFO] Agent Kernel CLI fallback active");
      }

      // Check Keychain
      try {
        execSync("security list-keychains 2>/dev/null");
        console.log("[PASS] macOS Keychain access verified");
      } catch {
        console.log("[WARN] macOS Keychain access unavailable");
      }

      console.log("=========================================");
      break;
    }

    case "connect": {
      const client = positionals[1] || "chatgpt";
      const projectRoot = values.project || process.cwd();
      const profile = values.profile || "write-project";

      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client, projectRoot, profile })
        });
        const data = await res.json();
        if (!res.ok) {
          console.error("Connect failed:", data.error);
        } else {
          console.log(`Session connected successfully!`);
          console.log(`Session ID: ${data.sessionId}`);
          console.log(`Token: ${data.token}`);
          console.log(`Expires At: ${data.expiresAt}`);
          if (data.agencyHarness) {
            console.log(`[Agency Harness] Auto-Injected: ${data.agencyHarness.autoInjected}`);
            console.log(`[Agency Harness] Agency Skills Loaded: ${data.agencyHarness.skillsCount}`);
            console.log(`[Agency Harness] Coding Tools Enabled: ${data.agencyHarness.codingTools.map((t: any) => t.name).join(", ")}`);
          }
        }
      } catch (err: any) {
        console.error("Daemon connection error:", err.message);
      }
      break;
    }

    case "agency": {
      console.log("=== Agency Harness Profile ===");
      const projectRoot = values.project || process.cwd();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: "chatgpt", projectRoot, profile: "write-project" })
        });
        const data = await res.json();
        if (data.agencyHarness) {
          console.log(`Auto-Injected Status: ${data.agencyHarness.autoInjected}`);
          console.log(`Skills Count: ${data.agencyHarness.skillsCount}`);
          console.log(`Available Roles (${data.agencyHarness.availableRoles.length}): ${data.agencyHarness.availableRoles.slice(0, 10).join(", ")}...`);
          console.log(`Coding Tools: ${data.agencyHarness.codingTools.map((t: any) => t.name).join(", ")}`);
        }
      } catch (err: any) {
        console.error("Failed to fetch agency harness info:", err.message);
      }
      console.log("==============================");
      break;
    }

    case "service": {
      const { ServiceManager } = await import("./service-manager.ts");
      const manager = new ServiceManager();
      const action = positionals[1] || "status";

      if (action === "install") {
        const ok = manager.installService();
        console.log(ok ? "Service installed successfully!" : "Service installation failed.");
      } else if (action === "uninstall") {
        const ok = manager.uninstallService();
        console.log(ok ? "Service uninstalled successfully!" : "Service uninstallation failed.");
      } else {
        console.log(`Service Status: ${manager.getServiceStatus()}`);
      }
      break;
    }

    case "review": {
      const { WorktreeDiffViewer } = await import("@harness/workspace");
      const viewer = new WorktreeDiffViewer();
      const wtPath = values.project || process.cwd();
      const summary = viewer.getDiffSummary(wtPath);
      console.log(viewer.renderTerminalFormattedDiff(summary));
      break;
    }

    case "notify": {
      const { DesktopNotifier } = await import("@harness/observability");
      const notifier = new DesktopNotifier();
      const msg = positionals[1] || "Harness action completed";
      notifier.notify({ title: "Kaku Harness", message: msg });
      console.log(`Sent desktop notification: "${msg}"`);
      break;
    }

    case "subagent": {
      const action = positionals[1] || "list";
      const goal = values.project || "Default subagent task";

      try {
        const connRes = await fetch(`http://127.0.0.1:${port}/mcp/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: "chatgpt", projectRoot: process.cwd(), profile: "write-project" })
        });
        const { token } = await connRes.json();

        if (action === "spawn") {
          const rpcRes = await fetch(`http://127.0.0.1:${port}/mcp/rpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ method: "spawn_subagent", params: { goal, backend: "codex" } })
          });
          const data = await rpcRes.json();
          console.log(`Subagent Spawned: ${data.result.subagentId} (Backend: ${data.result.backend})`);
        } else {
          const rpcRes = await fetch(`http://127.0.0.1:${port}/mcp/rpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ method: "list_subagents" })
          });
          const data = await rpcRes.json();
          console.log(`Active Subagents: ${JSON.stringify(data.result.subagents, null, 2)}`);
        }
      } catch (err: any) {
        console.error("Subagent command failed:", err.message);
      }
      break;
    }

    case "sessions": {
      if (existsSync(stateFilePath)) {
        const content = readFileSync(stateFilePath, "utf8");
        console.log(content);
      } else {
        console.log("No active sessions file found.");
      }
      break;
    }

    default:
      console.log(`Usage: harnessctl <start|stop|status|doctor|connect|sessions>`);
  }
}

main().catch(console.error);
