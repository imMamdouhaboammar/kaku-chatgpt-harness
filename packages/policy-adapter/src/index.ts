import { resolve } from "path";

export interface PolicyEvaluationRequest {
  action: "read" | "write" | "execute";
  targetPath?: string;
  command?: string;
  projectRoot: string;
  profile: "read-only" | "project-write" | "full-local";
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
}

export class PolicyAdapter {
  private forbiddenCommands = [
    /rm\s+-rf\s+\/($|\s)/i,
    /mkfs/i,
    /dd\s+if=/i,
    /chmod\s+-R\s+777\s+\//i
  ];

  public evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResult {
    // 1. Profile enforcement
    if (request.profile === "read-only" && (request.action === "write" || request.action === "execute")) {
      return { allowed: false, reason: "Action forbidden under 'read-only' capability profile." };
    }

    // 2. Command check
    if (request.command) {
      for (const pattern of this.forbiddenCommands) {
        if (pattern.test(request.command)) {
          return { allowed: false, reason: `Command matches forbidden policy pattern: ${request.command}` };
        }
      }
    }

    // 3. Path boundary check
    if (request.targetPath && request.profile !== "full-local") {
      const resolvedTarget = resolve(request.targetPath);
      const resolvedRoot = resolve(request.projectRoot);

      if (!resolvedTarget.startsWith(resolvedRoot)) {
        return {
          allowed: false,
          reason: `Target path '${resolvedTarget}' is outside project boundary '${resolvedRoot}'.`
        };
      }
    }

    return { allowed: true };
  }
}
