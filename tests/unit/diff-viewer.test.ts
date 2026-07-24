import { describe, test, expect } from "bun:test";
import { WorktreeDiffViewer } from "@harness/workspace";

describe("WorktreeDiffViewer Unit Suite", () => {
  const viewer = new WorktreeDiffViewer();

  test("getDiffSummary_handles_non_existent_directory_safely", () => {
    const summary = viewer.getDiffSummary("/non/existent/path");
    expect(summary.filesChanged).toBe(0);
    expect(summary.insertions).toBe(0);
    expect(summary.deletions).toBe(0);
  });

  test("renderTerminalFormattedDiff_formats_terminal_output", () => {
    const summary = {
      filesChanged: 2,
      insertions: 15,
      deletions: 3,
      rawDiff: "+ const x = 1;\n- const x = 0;",
      fileList: ["src/a.ts", "src/b.ts"]
    };

    const formatted = viewer.renderTerminalFormattedDiff(summary);
    expect(formatted).toContain("WORKTREE REVIEW: 2 file(s) changed");
    expect(formatted).toContain("+15 / -3");
    expect(formatted).toContain("src/a.ts");
  });
});
