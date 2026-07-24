import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PolicyAdapter } from "../src/index";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kaku-policy-"));
  fixtures.push(root);
  return root;
}

describe("PolicyAdapter", () => {
  test("allows writes inside the project boundary", () => {
    const root = fixture();
    const policy = new PolicyAdapter();

    expect(policy.evaluate({ action: "write", projectRoot: root, targetPath: join(root, "src/index.ts"), profile: "project-write" })).toEqual({ allowed: true });
  });

  test("blocks sibling paths sharing the project prefix", () => {
    const parent = fixture();
    const root = join(parent, "app");
    const sibling = join(parent, "app-secret", "token.txt");
    mkdirSync(root);
    mkdirSync(join(parent, "app-secret"));
    writeFileSync(sibling, "secret");

    const result = new PolicyAdapter().evaluate({ action: "read", projectRoot: root, targetPath: sibling, profile: "project-write" });

    expect(result.allowed).toBeFalse();
    expect(result.code).toBe("PATH_OUTSIDE_PROJECT");
  });

  test("blocks symlinks escaping the project root", () => {
    const parent = fixture();
    const root = join(parent, "project");
    const outside = join(parent, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(outside, join(root, "linked"));

    const result = new PolicyAdapter().evaluate({ action: "read", projectRoot: root, targetPath: join(root, "linked/secret.txt"), profile: "project-write" });

    expect(result.allowed).toBeFalse();
    expect(result.code).toBe("PATH_OUTSIDE_PROJECT");
  });

  test("blocks execution for read-only sessions", () => {
    const root = fixture();
    const result = new PolicyAdapter().evaluate({ action: "execute", command: "git status", projectRoot: root, targetPath: root, profile: "read-only" });

    expect(result.allowed).toBeFalse();
    expect(result.code).toBe("PROFILE_DENIED");
  });

  test("blocks dangerous commands with a stable denial code", () => {
    const root = fixture();
    const result = new PolicyAdapter().evaluate({ action: "execute", command: "rm -rf /", projectRoot: root, targetPath: root, profile: "project-write" });

    expect(result.allowed).toBeFalse();
    expect(result.code).toBe("COMMAND_DENIED");
  });

  test("blocks full-local unless explicitly enabled", () => {
    const result = new PolicyAdapter().evaluate({ action: "read", projectRoot: "/", targetPath: "/etc/hosts", profile: "full-local" });

    expect(result.allowed).toBeFalse();
    expect(result.code).toBe("PROFILE_DENIED");
  });

  test("allows full-local only when explicitly enabled", () => {
    const result = new PolicyAdapter({ allowFullLocal: true }).evaluate({ action: "read", projectRoot: "/", targetPath: "/etc/hosts", profile: "full-local" });

    expect(result).toEqual({ allowed: true });
  });
});
