import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  rawDiff: string;
  fileList: string[];
}

export class WorktreeDiffViewer {
  public getDiffSummary(worktreePath: string): DiffSummary {
    if (!existsSync(worktreePath)) {
      return { filesChanged: 0, insertions: 0, deletions: 0, rawDiff: "", fileList: [] };
    }

    let rawDiff = "";
    let statOutput = "";
    let fileListRaw = "";

    try {
      rawDiff = execSync("git diff HEAD 2>/dev/null", { cwd: worktreePath, encoding: "utf8" });
      statOutput = execSync("git diff --stat HEAD 2>/dev/null", { cwd: worktreePath, encoding: "utf8" });
      fileListRaw = execSync("git diff --name-only HEAD 2>/dev/null", { cwd: worktreePath, encoding: "utf8" });
    } catch {
      // Empty diff
    }

    const fileList = fileListRaw.split("\n").filter((f) => f.trim().length > 0);
    const { insertions, deletions } = this.parseStatNumbers(statOutput);

    return {
      filesChanged: fileList.length,
      insertions,
      deletions,
      rawDiff,
      fileList
    };
  }

  public renderTerminalFormattedDiff(summary: DiffSummary): string {
    const header = `=== WORKTREE REVIEW: ${summary.filesChanged} file(s) changed (+${summary.insertions} / -${summary.deletions}) ===`;
    const filesHeader = `Files:\n${summary.fileList.map((f) => `  - ${f}`).join("\n")}`;

    return `${header}\n${filesHeader}\n\nDiff Content:\n${summary.rawDiff.slice(0, 1000)}`;
  }

  private parseStatNumbers(statStr: string): { insertions: number; deletions: number } {
    let insertions = 0;
    let deletions = 0;

    const insMatch = statStr.match(/(\d+)\s+insertion/);
    if (insMatch) insertions = Number(insMatch[1]);

    const delMatch = statStr.match(/(\d+)\s+deletion/);
    if (delMatch) deletions = Number(delMatch[1]);

    return { insertions, deletions };
  }
}
