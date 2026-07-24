import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type PolicyAction = "read" | "write" | "execute";
export type PolicyProfile = "read-only" | "project-write" | "full-local";
export type PolicyDenialCode = "PROFILE_DENIED" | "COMMAND_DENIED" | "PATH_OUTSIDE_PROJECT" | "INVALID_REQUEST";

export interface PolicyEvaluationRequest {
  action: PolicyAction;
  targetPath?: string;
  command?: string;
  projectRoot: string;
  profile: PolicyProfile;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  code?: PolicyDenialCode;
  reason?: string;
}

export interface PolicyAdapterOptions {
  allowFullLocal?: boolean;
}

export class PolicyAdapter {
  private readonly allowFullLocal: boolean;
  private readonly forbiddenCommands = [
    /(^|\s)rm\s+-[^\n]*r[^\n]*f\s+\/(?:\s|$)/i,
    /(^|\s)mkfs(?:\.|\s|$)/i,
    /(^|\s)dd\s+[^\n]*if=/i,
    /(^|\s)chmod\s+-R\s+777\s+\/(?:\s|$)/i,
    /(^|\s)(?:sudo|su)\b/i
  ];

  constructor(options: PolicyAdapterOptions = {}) {
    this.allowFullLocal = options.allowFullLocal ?? false;
  }

  public evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResult {
    if (!request.projectRoot || !isAbsolute(request.projectRoot)) {
      return deny("INVALID_REQUEST", "projectRoot must be an absolute path.");
    }

    if (request.profile === "full-local" && !this.allowFullLocal) {
      return deny("PROFILE_DENIED", "The full-local capability profile is disabled.");
    }

    if (request.profile === "read-only" && request.action !== "read") {
      return deny("PROFILE_DENIED", `Action '${request.action}' is forbidden for read-only sessions.`);
    }

    if (request.command && this.forbiddenCommands.some((pattern) => pattern.test(request.command!))) {
      return deny("COMMAND_DENIED", "Command is denied by the local safety policy.");
    }

    if (request.targetPath && request.profile !== "full-local") {
      const root = boundaryPath(request.projectRoot);
      const target = boundaryPath(request.targetPath);
      if (!isWithin(root, target)) {
        return deny("PATH_OUTSIDE_PROJECT", "Target path is outside the authenticated project boundary.");
      }
    }

    return { allowed: true };
  }
}

function deny(code: PolicyDenialCode, reason: string): PolicyEvaluationResult {
  return { allowed: false, code, reason };
}

function boundaryPath(input: string): string {
  const absolute = resolve(input);
  if (existsSync(absolute)) return realpathSync.native(absolute);

  const missingSegments: string[] = [];
  let cursor = absolute;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return absolute;
    missingSegments.unshift(basename(cursor));
    cursor = parent;
  }

  return join(realpathSync.native(cursor), ...missingSegments);
}

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}
