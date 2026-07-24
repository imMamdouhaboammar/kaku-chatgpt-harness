import { describe, expect, test } from "bun:test";
import { PolicyAdapter } from "../src/index";

describe("PolicyAdapter", () => {
  const policy = new PolicyAdapter();

  test("allows actions within project boundary", () => {
    const res = policy.evaluate({
      action: "write",
      projectRoot: "/app",
      targetPath: "/app/src/index.ts",
      profile: "project-write"
    });
    expect(res.allowed).toBeTrue();
  });

  test("blocks path traversal outside project root", () => {
    const res = policy.evaluate({
      action: "write",
      projectRoot: "/app",
      targetPath: "/etc/passwd",
      profile: "project-write"
    });
    expect(res.allowed).toBeFalse();
    expect(res.reason).toContain("outside project boundary");
  });

  test("blocks forbidden dangerous commands", () => {
    const res = policy.evaluate({
      action: "execute",
      command: "rm -rf /",
      projectRoot: "/app",
      profile: "project-write"
    });
    expect(res.allowed).toBeFalse();
    expect(res.reason).toContain("forbidden policy pattern");
  });

  test("blocks writes when profile is read-only", () => {
    const res = policy.evaluate({
      action: "write",
      projectRoot: "/app",
      targetPath: "/app/file.txt",
      profile: "read-only"
    });
    expect(res.allowed).toBeFalse();
    expect(res.reason).toContain("read-only");
  });
});
