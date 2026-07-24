import { execSync } from "node:child_process";
import { redactText, redactValue } from "@harness/observability";
import { CapabilityProfile } from "@harness/session-core";
import { resolve, relative, isAbsolute } from "node:path";

export interface ExecutionRequest {
  command: string;
  cwd: string;
  projectRoot: string;
  profile: CapabilityProfile;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export class DesktopCommanderAdapter {
  public validatePathAccess(targetPath: string, projectRoot: string, profile: CapabilityProfile): boolean {
    if (profile === "full-local") return true;

    const absTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(projectRoot, targetPath);
    const absRoot = resolve(projectRoot);

    const rel = relative(absRoot, absTarget);
    const isInside = !rel.startsWith("..") && !isAbsolute(rel);
    return isInside;
  }

  public executeCommand(request: ExecutionRequest): ExecutionResult {
    if (!this.validatePathAccess(request.cwd, request.projectRoot, request.profile)) {
      throw new Error(`Access denied: directory '${request.cwd}' is outside session project root '${request.projectRoot}'`);
    }

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      stdout = execSync(request.command, {
        cwd: request.cwd,
        encoding: "utf8",
        timeout: 30000
      });
    } catch (err: any) {
      exitCode = err.status || 1;
      stdout = err.stdout || "";
      stderr = err.stderr || err.message || "Command execution failed";
    }

    const durationMs = Date.now() - startTime;

    return {
      exitCode,
      stdout: redactText(stdout),
      stderr: redactText(stderr),
      durationMs
    };
  }
}
