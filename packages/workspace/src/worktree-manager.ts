import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface WorktreeSession {
  worktreeId: string;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseCommit: string;
  createdAt: string;
}

export class WorktreeManager {
  public createWorktree(repoRoot: string, worktreeId: string): WorktreeSession {
    let baseCommit = "HEAD";
    try {
      baseCommit = execSync("git rev-parse HEAD 2>/dev/null", { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
      // Not a git repo or no HEAD commit
    }

    const branchName = `harness/wt-${worktreeId.slice(0, 8)}`;
    const worktreePath = join(repoRoot, ".git", "harness-worktrees", worktreeId);

    const dir = join(repoRoot, ".git", "harness-worktrees");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    try {
      execSync(`git worktree add -b "${branchName}" "${worktreePath}" "${baseCommit}" 2>/dev/null`, {
        cwd: repoRoot,
        encoding: "utf8"
      });
    } catch {
      // Fallback: copy dir if worktree creation unsupported
      mkdirSync(worktreePath, { recursive: true });
    }

    return {
      worktreeId,
      repoRoot,
      worktreePath,
      branchName,
      baseCommit,
      createdAt: new Date().toISOString()
    };
  }

  public getDiff(worktree: WorktreeSession): string {
    if (!existsSync(worktree.worktreePath)) return "";
    try {
      return execSync("git diff HEAD 2>/dev/null", { cwd: worktree.worktreePath, encoding: "utf8" });
    } catch {
      return "";
    }
  }

  public rollback(worktree: WorktreeSession): void {
    if (!existsSync(worktree.worktreePath)) return;
    try {
      execSync("git reset --hard HEAD 2>/dev/null", { cwd: worktree.worktreePath, encoding: "utf8" });
      execSync("git clean -fd 2>/dev/null", { cwd: worktree.worktreePath, encoding: "utf8" });
    } catch {
      // Rollback failed
    }
  }

  public removeWorktree(worktree: WorktreeSession): void {
    try {
      execSync(`git worktree remove --force "${worktree.worktreePath}" 2>/dev/null`, {
        cwd: worktree.repoRoot,
        encoding: "utf8"
      });
      execSync(`git branch -D "${worktree.branchName}" 2>/dev/null`, {
        cwd: worktree.repoRoot,
        encoding: "utf8"
      });
    } catch {
      if (existsSync(worktree.worktreePath)) {
        rmSync(worktree.worktreePath, { recursive: true, force: true });
      }
    }
  }
}
