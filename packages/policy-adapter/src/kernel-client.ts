import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  policyName: string;
  command?: string;
  timestamp: string;
}

export class PolicyAdapter {
  private readonly constitutionPath: string;

  constructor(constitutionPath = "/Users/mamdouhaboammar/.agent-kernel/dist/AGENTS.md") {
    this.constitutionPath = constitutionPath;
  }

  public isKernelAvailable(): boolean {
    try {
      execSync("agent-kernel --version 2>/dev/null", { encoding: "utf8" });
      return true;
    } catch {
      return false;
    }
  }

  public getConstitutionText(): string {
    if (existsSync(this.constitutionPath)) {
      return readFileSync(this.constitutionPath, "utf8");
    }
    return "# Shared Agent Kernel Constitution (Default)";
  }

  public evaluateCommand(command: string, projectRoot: string): PolicyDecision {
    const timestamp = new Date().toISOString();

    // Dangerous system command checks
    if (/rm\s+-rf\s+\/($|\s+|\*)/.test(command) || /mkfs|dd\s+if=/.test(command)) {
      return {
        allowed: false,
        reason: "Destructive root filesystem operation blocked by Agent Kernel policy guard.",
        policyName: "destructive_command_guard",
        command,
        timestamp
      };
    }

    // Secret credential leak command checks
    if (/cat\s+.*id_rsa|cat\s+.*\.env|cat\s+.*credentials/i.test(command)) {
      return {
        allowed: false,
        reason: "Unmasked secret credential read operation blocked.",
        policyName: "credential_read_guard",
        command,
        timestamp
      };
    }

    return {
      allowed: true,
      reason: "Command complies with project Agent Kernel policies.",
      policyName: "default_allow",
      command,
      timestamp
    };
  }

  public recordEpisodeCheckpoint(sessionId: string, summary: string): { checkpointId: string; timestamp: string } {
    return {
      checkpointId: `chk_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString()
    };
  }
}
