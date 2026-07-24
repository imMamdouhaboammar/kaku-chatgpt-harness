import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installRuntime, rollbackRuntime, uninstallRuntime } from "../runtime-manager";
import type { InstallerHooks } from "../runtime-manager";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "kaku-installer-"));
  fixtures.push(root);
  const sourceRoot = join(root, "source");
  const destination = join(root, "runtime");
  const homeDir = join(root, "home");
  mkdirSync(join(sourceRoot, "dist", "harnessd", "src"), { recursive: true });
  mkdirSync(join(sourceRoot, "dist", "harnessctl", "src"), { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(sourceRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
  writeFileSync(join(sourceRoot, "dist", "harnessd", "src", "index.js"), "console.log('daemon');");
  writeFileSync(join(sourceRoot, "dist", "harnessctl", "src", "index.js"), "console.log('cli');");
  return { root, sourceRoot, destination, homeDir };
}

function hooks(healthy: boolean, events: string[]): InstallerHooks {
  return {
    verify: async () => { events.push("verify"); },
    resolveCommit: async () => "abc123def456",
    stopOwnedRuntime: async () => { events.push("stop"); },
    startRuntime: async () => { events.push("start"); },
    probeHealth: async (_port, commit) => {
      events.push(`probe:${commit}`);
      return healthy;
    }
  };
}

describe("runtime manager", () => {
  test("installs a verified release and preserves the previous runtime", async () => {
    const context = setup();
    mkdirSync(context.destination, { recursive: true });
    writeFileSync(join(context.destination, "old.txt"), "old runtime");
    const launchAgents = join(context.homeDir, "Library", "LaunchAgents");
    mkdirSync(launchAgents, { recursive: true });
    writeFileSync(
      join(launchAgents, "com.kaku.harnessd.plist"),
      `<plist><string>${context.destination}/apps/harnessd/src/index.ts</string></plist>`
    );
    const events: string[] = [];

    const result = await installRuntime({
      sourceRoot: context.sourceRoot,
      destination: context.destination,
      homeDir: context.homeDir,
      bootstrapToken: "installer-secret-token",
      port: 9876,
      start: true
    }, hooks(true, events));

    expect(result.commit).toBe("abc123def456");
    expect(events).toEqual(["verify", "stop", "start", "probe:abc123def456"]);
    expect(existsSync(join(context.destination, "dist", "harnessd", "src", "index.js"))).toBeTrue();
    expect(readFileSync(`${context.destination}.previous/old.txt`, "utf8")).toBe("old runtime");

    const manifest = JSON.parse(readFileSync(join(context.destination, ".runtime", "install-manifest.json"), "utf8"));
    expect(manifest.sourceCommit).toBe("abc123def456");
    expect(manifest.port).toBe(9876);
    const integrationBackup = join(context.destination, ".runtime", "previous-integrations.json");
    expect(existsSync(integrationBackup)).toBeTrue();
    expect((statSync(integrationBackup).mode & 0o777).toString(8)).toBe("600");

    const tokenPath = join(context.homeDir, ".kaku-harness", "bootstrap-token");
    expect(readFileSync(tokenPath, "utf8").trim()).toBe("installer-secret-token");
    expect((statSync(tokenPath).mode & 0o777).toString(8)).toBe("600");
    const cliWrapper = readFileSync(join(context.homeDir, ".local", "bin", "harnessctl"), "utf8");
    const kakuPlugin = readFileSync(join(context.homeDir, ".config", "kaku", "zsh", "plugins", "chatgpt-harness.zsh"), "utf8");
    expect(cliWrapper).toContain(context.destination);
    expect(cliWrapper).toContain("HARNESS_LOG_PATH");
    expect(cliWrapper).toContain("HARNESS_ENDPOINT");
    expect(kakuPlugin).toContain(context.destination);
    expect(kakuPlugin).toContain("HARNESS_LOG_PATH");
    expect(existsSync(join(launchAgents, "com.kaku.harnessd.plist"))).toBeFalse();
  });

  test("rolls back a legacy runtime and restores its integrations", async () => {
    const context = setup();
    mkdirSync(context.destination, { recursive: true });
    writeFileSync(join(context.destination, "old.txt"), "old runtime");
    const launchAgents = join(context.homeDir, "Library", "LaunchAgents");
    const localBin = join(context.homeDir, ".local", "bin");
    const kakuPlugins = join(context.homeDir, ".config", "kaku", "zsh", "plugins");
    mkdirSync(launchAgents, { recursive: true });
    mkdirSync(localBin, { recursive: true });
    mkdirSync(kakuPlugins, { recursive: true });
    const legacyPlist = `<plist><string>${context.destination}/apps/harnessd/src/index.ts</string></plist>`;
    writeFileSync(join(launchAgents, "com.kaku.harnessd.plist"), legacyPlist);
    writeFileSync(join(localBin, "harnessctl"), "legacy cli\n");
    writeFileSync(join(kakuPlugins, "chatgpt-harness.zsh"), "legacy plugin\n");
    const events: string[] = [];
    const rollbackHooks: InstallerHooks = {
      verify: async () => { events.push("verify"); },
      resolveCommit: async () => "abc123def456",
      stopOwnedRuntime: async () => { events.push("stop"); },
      startRuntime: async (_destination, _home, _port, commit) => { events.push(`start:${commit ?? "legacy"}`); },
      probeHealth: async (_port, commit) => {
        events.push(`probe:${commit ?? "legacy"}`);
        return commit === undefined;
      }
    };

    await expect(installRuntime({
      sourceRoot: context.sourceRoot,
      destination: context.destination,
      homeDir: context.homeDir,
      bootstrapToken: "rollback-token",
      port: 9877,
      start: true
    }, rollbackHooks)).rejects.toThrow("health probe");

    expect(readFileSync(join(context.destination, "old.txt"), "utf8")).toBe("old runtime");
    expect(existsSync(join(context.destination, "dist"))).toBeFalse();
    expect(readFileSync(join(launchAgents, "com.kaku.harnessd.plist"), "utf8")).toBe(legacyPlist);
    expect(readFileSync(join(localBin, "harnessctl"), "utf8")).toBe("legacy cli\n");
    expect(readFileSync(join(kakuPlugins, "chatgpt-harness.zsh"), "utf8")).toBe("legacy plugin\n");
    expect(events).toEqual([
      "verify",
      "stop",
      "start:abc123def456",
      "probe:abc123def456",
      "stop",
      "start:legacy",
      "probe:legacy"
    ]);
  });

  test("dry-run performs verification without changing the destination", async () => {
    const context = setup();
    const events: string[] = [];

    const result = await installRuntime({
      sourceRoot: context.sourceRoot,
      destination: context.destination,
      homeDir: context.homeDir,
      bootstrapToken: "dry-run-token",
      port: 9878,
      start: true,
      dryRun: true
    }, hooks(true, events));

    expect(result.dryRun).toBeTrue();
    expect(events).toEqual(["verify"]);
    expect(existsSync(context.destination)).toBeFalse();
  });
});


test("restarts the previous managed release after rollback", async () => {
  const context = setup();
  mkdirSync(join(context.destination, ".runtime"), { recursive: true });
  writeFileSync(join(context.destination, "old.txt"), "old runtime");
  writeFileSync(join(context.destination, ".runtime", "install-manifest.json"), JSON.stringify({
    version: 1,
    sourceCommit: "oldcommit123",
    sourceRoot: "/old/source",
    installedAt: new Date(0).toISOString(),
    port: 9879
  }));
  const events: string[] = [];
  const rollbackHooks: InstallerHooks = {
    verify: async () => { events.push("verify"); },
    resolveCommit: async () => "newcommit456",
    stopOwnedRuntime: async () => { events.push("stop"); },
    startRuntime: async (_destination, _home, _port, commit) => { events.push(`start:${commit}`); },
    probeHealth: async (_port, commit) => {
      events.push(`probe:${commit}`);
      return commit === "oldcommit123";
    }
  };

  await expect(installRuntime({
    sourceRoot: context.sourceRoot,
    destination: context.destination,
    homeDir: context.homeDir,
    bootstrapToken: "rollback-restart-token",
    port: 9879,
    start: true
  }, rollbackHooks)).rejects.toThrow("health probe");

  expect(readFileSync(join(context.destination, "old.txt"), "utf8")).toBe("old runtime");
  expect(events).toEqual([
    "verify",
    "stop",
    "start:newcommit456",
    "probe:newcommit456",
    "stop",
    "start:oldcommit123",
    "probe:oldcommit123"
  ]);
});


test("explicit rollback restores the previous legacy release", async () => {
  const context = setup();
  mkdirSync(context.destination, { recursive: true });
  writeFileSync(join(context.destination, "legacy.txt"), "legacy runtime");
  const launchAgents = join(context.homeDir, "Library", "LaunchAgents");
  const localBin = join(context.homeDir, ".local", "bin");
  const kakuPlugins = join(context.homeDir, ".config", "kaku", "zsh", "plugins");
  mkdirSync(launchAgents, { recursive: true });
  mkdirSync(localBin, { recursive: true });
  mkdirSync(kakuPlugins, { recursive: true });
  const legacyPlist = `<plist><string>${context.destination}/apps/harnessd/src/index.ts</string></plist>`;
  writeFileSync(join(launchAgents, "com.kaku.harnessd.plist"), legacyPlist);
  writeFileSync(join(localBin, "harnessctl"), "legacy cli\n");
  writeFileSync(join(kakuPlugins, "chatgpt-harness.zsh"), "legacy plugin\n");

  await installRuntime({
    sourceRoot: context.sourceRoot,
    destination: context.destination,
    homeDir: context.homeDir,
    bootstrapToken: "explicit-rollback-token",
    port: 9880,
    start: true
  }, hooks(true, []));

  const events: string[] = [];
  const rollbackHooks: InstallerHooks = {
    verify: async () => undefined,
    resolveCommit: async () => "unused",
    stopOwnedRuntime: async () => { events.push("stop"); },
    startRuntime: async (_destination, _home, _port, commit) => { events.push(`start:${commit ?? "legacy"}`); },
    probeHealth: async (_port, commit) => {
      events.push(`probe:${commit ?? "legacy"}`);
      return commit === undefined;
    }
  };

  const result = await rollbackRuntime({
    destination: context.destination,
    homeDir: context.homeDir
  }, rollbackHooks);

  expect(result.commit).toBe("legacy");
  expect(readFileSync(join(context.destination, "legacy.txt"), "utf8")).toBe("legacy runtime");
  expect(existsSync(join(`${context.destination}.previous`, "dist"))).toBeTrue();
  expect(readFileSync(join(launchAgents, "com.kaku.harnessd.plist"), "utf8")).toBe(legacyPlist);
  expect(readFileSync(join(localBin, "harnessctl"), "utf8")).toBe("legacy cli\n");
  expect(readFileSync(join(kakuPlugins, "chatgpt-harness.zsh"), "utf8")).toBe("legacy plugin\n");
  expect(events).toEqual(["stop", "start:legacy", "probe:legacy"]);
});


test("uninstall restores pre-existing integrations and removes runtime-owned state", async () => {
  const context = setup();
  mkdirSync(context.destination, { recursive: true });
  writeFileSync(join(context.destination, "legacy.txt"), "legacy runtime");

  const originalIntegrations = new Map([
    [join(context.homeDir, ".local", "bin", "harnessctl"), "original cli\n"],
    [join(context.homeDir, ".config", "kaku", "zsh", "plugins", "chatgpt-harness.zsh"), "original plugin\n"],
    [join(context.homeDir, "Library", "LaunchAgents", "com.kaku.chatgpt-harness.plist"), "original current plist\n"],
    [join(context.homeDir, "Library", "LaunchAgents", "com.kaku.harnessd.plist"), `<plist>${context.destination}</plist>\n`]
  ]);
  for (const [path, content] of originalIntegrations) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }

  await installRuntime({
    sourceRoot: context.sourceRoot,
    destination: context.destination,
    homeDir: context.homeDir,
    bootstrapToken: "uninstall-test-token",
    port: 8765,
    start: true
  }, hooks(true, []));
  const sessionPath = join(context.homeDir, ".kaku-harness", "session.json");
  writeFileSync(sessionPath, "session\n", { mode: 0o600 });
  const unrelated = join(context.homeDir, "keep-me.txt");
  writeFileSync(unrelated, "keep");
  const events: string[] = [];
  const uninstallHooks: InstallerHooks = {
    verify: async () => undefined,
    resolveCommit: async () => "unused",
    stopOwnedRuntime: async () => { events.push("stop"); },
    startRuntime: async () => undefined,
    probeHealth: async () => true
  };

  await uninstallRuntime(context.destination, context.homeDir, 8765, uninstallHooks);

  expect(events).toEqual(["stop"]);
  expect(existsSync(context.destination)).toBeFalse();
  expect(existsSync(`${context.destination}.previous`)).toBeFalse();
  for (const [path, content] of originalIntegrations) expect(readFileSync(path, "utf8")).toBe(content);
  expect(existsSync(sessionPath)).toBeFalse();
  expect(existsSync(join(context.homeDir, ".kaku-harness", "bootstrap-token"))).toBeFalse();
  expect(readFileSync(unrelated, "utf8")).toBe("keep");
});
