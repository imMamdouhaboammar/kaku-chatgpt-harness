import { describe, expect, test } from "bun:test";
import { parseArgs, runDoctor } from "../src/index";

describe("harnessctl CLI", () => {
  test("parses CLI arguments correctly", () => {
    const parsed = parseArgs(["connect", "chatgpt", "--project", "/Users/mamdouh/app"]);
    expect(parsed.command).toBe("connect");
    expect(parsed.flags.project).toBe("/Users/mamdouh/app");
  });

  test("runs doctor diagnostics check", () => {
    const doc = runDoctor();
    expect(doc.checks.length).toBeGreaterThan(0);
    const bunCheck = doc.checks.find((c) => c.name.includes("Bun"));
    expect(bunCheck?.status).toBeTrue();
  });
});
