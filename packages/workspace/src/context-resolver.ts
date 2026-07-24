import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectContextSnapshot {
  projectRoot: string;
  gitRoot: string | null;
  branch: string | null;
  isDirty: boolean;
  packageManager: "bun" | "npm" | "pnpm" | "yarn";
  instructionsPath: string | null;
  instructionSummary: string;
  createdAt: string;
}

export class ProjectContextResolver {
  public resolveContext(targetDir: string): ProjectContextSnapshot {
    const gitRoot = this.resolveGitRoot(targetDir);
    const branch = gitRoot ? this.execGit(gitRoot, "rev-parse --abbrev-ref HEAD") : null;
    const isDirty = gitRoot ? this.execGit(gitRoot, "status --porcelain").length > 0 : false;
    const packageManager = this.detectPackageManager(targetDir);
    const instructionsPath = this.findInstructionsFile(targetDir);

    let instructionSummary = "";
    if (instructionsPath && existsSync(instructionsPath)) {
      instructionSummary = readFileSync(instructionsPath, "utf8").slice(0, 500);
    }

    return {
      projectRoot: targetDir,
      gitRoot,
      branch,
      isDirty,
      packageManager,
      instructionsPath,
      instructionSummary,
      createdAt: new Date().toISOString()
    };
  }

  private resolveGitRoot(dir: string): string | null {
    try {
      return execSync("git rev-parse --show-toplevel 2>/dev/null", { cwd: dir, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  }

  private execGit(dir: string, cmd: string): string {
    try {
      return execSync(`git ${cmd}`, { cwd: dir, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  }

  private detectPackageManager(dir: string): "bun" | "npm" | "pnpm" | "yarn" {
    if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
    if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(dir, "yarn.lock"))) return "yarn";
    return "bun"; // Default per Agent Kernel standard
  }

  private findInstructionsFile(dir: string): string | null {
    const candidates = ["AGENTS.md", "CLAUDE.md", "README.md"];
    for (const file of candidates) {
      const full = join(dir, file);
      if (existsSync(full)) return full;
    }
    return null;
  }
}
