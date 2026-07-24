import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface InstallOptions {
  sourceRoot: string;
  destination: string;
  homeDir?: string;
  bootstrapToken?: string;
  port?: number;
  start?: boolean;
  dryRun?: boolean;
  bunPath?: string;
}

export interface InstallResult {
  commit: string;
  destination: string;
  previousPath: string;
  dryRun: boolean;
}

export interface RollbackOptions {
  destination: string;
  homeDir?: string;
}

export interface InstallerHooks {
  verify(sourceRoot: string): Promise<void>;
  resolveCommit(sourceRoot: string): Promise<string>;
  stopOwnedRuntime(destination: string, homeDir: string, port: number): Promise<void>;
  startRuntime(destination: string, homeDir: string, port: number, commit?: string): Promise<void>;
  probeHealth(port: number, commit?: string): Promise<boolean>;
}

interface RuntimeManifest {
  version: 1;
  sourceCommit: string;
  sourceRoot: string;
  installedAt: string;
  port: number;
}

interface FileSnapshot {
  path: string;
  content: Buffer | null;
  mode: number | null;
}

export async function installRuntime(
  options: InstallOptions,
  hooks: InstallerHooks = defaultHooks()
): Promise<InstallResult> {
  const sourceRoot = resolve(options.sourceRoot);
  const destination = resolve(options.destination);
  const homeDir = resolve(options.homeDir ?? homedir());
  const port = positiveInteger(options.port ?? 8765, "port");
  const start = options.start ?? true;
  const previousPath = `${destination}.previous`;

  await hooks.verify(sourceRoot);
  const commit = await hooks.resolveCommit(sourceRoot);
  if (!commit.trim()) throw new Error("Unable to resolve the source commit.");

  if (options.dryRun) {
    return { commit, destination, previousPath, dryRun: true };
  }

  assertReleaseArtifacts(sourceRoot);
  const stagePath = `${destination}.stage-${process.pid}-${Date.now()}`;
  rmSync(stagePath, { recursive: true, force: true });
  copyRelease(sourceRoot, stagePath);

  const manifest: RuntimeManifest = {
    version: 1,
    sourceCommit: commit,
    sourceRoot,
    installedAt: new Date().toISOString(),
    port
  };
  writeRuntimeFiles(stagePath, destination, homeDir, manifest, options.bunPath ?? findBun());

  const tokenPath = join(homeDir, ".kaku-harness", "bootstrap-token");
  const previousToken = existsSync(tokenPath) ? readFileSync(tokenPath, "utf8") : null;
  const integrationSnapshot = captureManagedIntegrations(homeDir);
  writeBootstrapToken(tokenPath, options.bootstrapToken ?? previousToken?.trim() ?? randomBytes(32).toString("hex"));

  let swapped = false;
  try {
    if (existsSync(destination)) await hooks.stopOwnedRuntime(destination, homeDir, port);
    rmSync(previousPath, { recursive: true, force: true });
    if (existsSync(destination)) renameSync(destination, previousPath);
    renameSync(stagePath, destination);
    swapped = true;
    writeUserIntegrations(destination, homeDir, options.bunPath ?? findBun(), port);
    writePreviousIntegrationSnapshot(destination, integrationSnapshot);

    if (start) {
      await hooks.startRuntime(destination, homeDir, port, commit);
      if (!await hooks.probeHealth(port, commit)) {
        throw new Error(`Installed runtime failed its health probe for commit ${commit}.`);
      }
    }

    finalizeManagedIntegrations(destination, homeDir);
    return { commit, destination, previousPath, dryRun: false };
  } catch (error) {
    if (swapped) {
      if (start) await hooks.stopOwnedRuntime(destination, homeDir, port).catch(() => undefined);
      rmSync(destination, { recursive: true, force: true });
      if (existsSync(previousPath)) renameSync(previousPath, destination);
      restoreBootstrapToken(tokenPath, previousToken);
      restoreManagedIntegrations(integrationSnapshot);

      if (start && existsSync(destination)) {
        const previousManifest = readRuntimeManifest(destination);
        const previousPort = previousManifest?.port ?? port;
        const previousCommit = previousManifest?.sourceCommit;
        try {
          await hooks.startRuntime(destination, homeDir, previousPort, previousCommit);
          if (!await hooks.probeHealth(previousPort, previousCommit)) {
            throw new Error("Previous runtime failed its rollback health probe.");
          }
        } catch (rollbackError) {
          throw new Error(
            `${errorMessage(error)} Rollback activation also failed: ${errorMessage(rollbackError)}`
          );
        }
      }
    } else {
      rmSync(stagePath, { recursive: true, force: true });
    }
    throw error;
  }
}

function assertReleaseArtifacts(sourceRoot: string): void {
  const required = [
    join(sourceRoot, "dist", "harnessd", "src", "index.js"),
    join(sourceRoot, "dist", "harnessctl", "src", "index.js"),
    join(sourceRoot, "package.json")
  ];
  for (const path of required) {
    if (!existsSync(path)) throw new Error(`Required release artifact is missing: ${path}`);
  }
}

function copyRelease(sourceRoot: string, stagePath: string): void {
  const excludedNames = new Set([".git", ".worktrees", "node_modules", ".DS_Store", ".agent-kernel"]);
  cpSync(sourceRoot, stagePath, {
    recursive: true,
    filter: (source) => !excludedNames.has(basename(source))
  });
}

function writeRuntimeFiles(
  stagePath: string,
  destination: string,
  homeDir: string,
  manifest: RuntimeManifest,
  bunPath: string
): void {
  const runtimeDir = join(stagePath, ".runtime");
  const binDir = join(stagePath, "bin");
  mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  mkdirSync(binDir, { recursive: true, mode: 0o755 });
  writePrivateJson(join(runtimeDir, "install-manifest.json"), manifest);

  const launcher = `#!/usr/bin/env bash\nset -euo pipefail\nTOKEN_FILE=${shellQuote(join(homeDir, ".kaku-harness", "bootstrap-token"))}\nif [ ! -r "$TOKEN_FILE" ]; then echo "Missing harness bootstrap token" >&2; exit 1; fi\nexport HARNESS_BOOTSTRAP_TOKEN="$(cat "$TOKEN_FILE")"\nexport HARNESS_BUILD_COMMIT=${shellQuote(manifest.sourceCommit)}\nexport HARNESS_PORT=${manifest.port}\nexport HARNESS_LOG_PATH=${shellQuote(join(destination, ".runtime", "harnessd.log"))}\nexec ${shellQuote(bunPath)} run ${shellQuote(join(destination, "dist", "harnessd", "src", "index.js"))}\n`;
  writeExecutable(join(binDir, "harnessd-launch"), launcher);

  const cli = `#!/usr/bin/env bash\nset -euo pipefail\nexec ${shellQuote(bunPath)} run ${shellQuote(join(destination, "dist", "harnessctl", "src", "index.js"))} "$@"\n`;
  writeExecutable(join(binDir, "harnessctl"), cli);
}

function writeUserIntegrations(destination: string, homeDir: string, bunPath: string, port: number): void {
  const localBin = join(homeDir, ".local", "bin");
  const kakuPlugins = join(homeDir, ".config", "kaku", "zsh", "plugins");
  const launchAgents = join(homeDir, "Library", "LaunchAgents");
  mkdirSync(localBin, { recursive: true, mode: 0o755 });
  mkdirSync(kakuPlugins, { recursive: true, mode: 0o755 });
  mkdirSync(launchAgents, { recursive: true, mode: 0o755 });
  removeOwnedLegacyLaunchAgent(destination, launchAgents);

  const cliWrapper = `#!/usr/bin/env bash\nset -euo pipefail\nexport HARNESS_ENDPOINT=http://127.0.0.1:${port}\nexport HARNESS_LOG_PATH=${shellQuote(join(destination, ".runtime", "harnessd.log"))}\nexec ${shellQuote(bunPath)} run ${shellQuote(join(destination, "dist", "harnessctl", "src", "index.js"))} "$@"\n`;
  writeExecutable(join(localBin, "harnessctl"), cliWrapper);

  const kakuPlugin = `# Managed by Kaku ChatGPT Harness\nexport KAKU_CHATGPT_HARNESS_RUNTIME=${shellQuote(destination)}\nexport HARNESS_ENDPOINT=http://127.0.0.1:${port}\nexport HARNESS_LOG_PATH=${shellQuote(join(destination, ".runtime", "harnessd.log"))}\nexport PATH="$HOME/.local/bin:$PATH"\n`;
  writeFileAtomic(join(kakuPlugins, "chatgpt-harness.zsh"), kakuPlugin, 0o644);

  const plistPath = join(launchAgents, "com.kaku.chatgpt-harness.plist");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.kaku.chatgpt-harness</string>\n  <key>ProgramArguments</key>\n  <array><string>${xmlEscape(join(destination, "bin", "harnessd-launch"))}</string></array>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>StandardOutPath</key><string>${xmlEscape(join(destination, ".runtime", "launchd.out.log"))}</string>\n  <key>StandardErrorPath</key><string>${xmlEscape(join(destination, ".runtime", "launchd.err.log"))}</string>\n</dict>\n</plist>\n`;
  writeFileAtomic(plistPath, plist, 0o600);
}

function writeBootstrapToken(path: string, token: string): void {
  if (!token.trim()) throw new Error("Bootstrap token must not be empty.");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileAtomic(path, token.trim() + "\n", 0o600);
}

function restoreBootstrapToken(path: string, previous: string | null): void {
  if (previous === null) {
    rmSync(path, { force: true });
    return;
  }
  writeFileAtomic(path, previous, 0o600);
}


export async function uninstallRuntime(
  destination: string,
  homeDir = homedir(),
  port = 8765,
  hooks: InstallerHooks = defaultHooks()
): Promise<void> {
  const resolvedDestination = resolve(destination);
  const resolvedHome = resolve(homeDir);
  await hooks.stopOwnedRuntime(resolvedDestination, resolvedHome, positiveInteger(port, "port"));

  const managedFiles = [
    ...managedIntegrationPaths(resolvedHome),
    join(resolvedHome, ".kaku-harness", "session.json"),
    join(resolvedHome, ".kaku-harness", "bootstrap-token")
  ];
  for (const path of managedFiles) rmSync(path, { force: true });
  rmSync(resolvedDestination, { recursive: true, force: true });
  rmSync(`${resolvedDestination}.previous`, { recursive: true, force: true });
}

function defaultHooks(): InstallerHooks {
  return {
    verify: async (sourceRoot) => {
      const dirty = runCommand("git", ["status", "--porcelain"], sourceRoot).trim();
      if (dirty) throw new Error("Refusing installation from a dirty Git working tree.");
      runCommand("bun", ["run", "verify"], sourceRoot, true);
    },
    resolveCommit: async (sourceRoot) => runCommand("git", ["rev-parse", "HEAD"], sourceRoot).trim(),
    stopOwnedRuntime: async (destination, homeDir, port) => {
      stopLaunchAgents(destination, homeDir);
      stopOwnedPortProcesses(destination, port);
    },
    startRuntime: async (destination, homeDir) => {
      startOwnedLaunchAgent(destination, homeDir);
    },
    probeHealth: async (port, commit) => probeRuntimeHealth(port, commit)
  };
}

function stopLaunchAgents(destination: string, homeDir: string): void {
  const launchAgents = join(homeDir, "Library", "LaunchAgents");
  const plistPaths = [
    join(launchAgents, "com.kaku.chatgpt-harness.plist"),
    join(launchAgents, "com.kaku.harnessd.plist")
  ];

  for (const plistPath of plistPaths) {
    if (!existsSync(plistPath)) continue;
    const content = readFileSync(plistPath, "utf8");
    if (!content.includes(destination)) continue;
    try {
      execFileSync("launchctl", ["bootout", launchDomain(), plistPath], { stdio: "ignore" });
    } catch {
      // The service may already be unloaded. Port ownership is checked separately.
    }
  }
}

function startOwnedLaunchAgent(destination: string, homeDir: string): void {
  const launchAgents = join(homeDir, "Library", "LaunchAgents");
  const candidates = [
    {
      path: join(launchAgents, "com.kaku.chatgpt-harness.plist"),
      label: "com.kaku.chatgpt-harness"
    },
    {
      path: join(launchAgents, "com.kaku.harnessd.plist"),
      label: "com.kaku.harnessd"
    }
  ];
  const selected = candidates.find((candidate) => (
    existsSync(candidate.path) && readFileSync(candidate.path, "utf8").includes(destination)
  ));
  if (!selected) throw new Error(`No managed LaunchAgent references runtime ${destination}.`);

  try {
    execFileSync("launchctl", ["bootstrap", launchDomain(), selected.path], { stdio: "pipe" });
  } catch (error) {
    const detail = commandErrorText(error);
    if (!detail.includes("already loaded") && !detail.includes("service already loaded")) throw error;
  }
  execFileSync("launchctl", ["kickstart", "-k", `${launchDomain()}/${selected.label}`], { stdio: "pipe" });
}

function stopOwnedPortProcesses(destination: string, port: number): void {
  const pidOutput = runCommandAllowFailure("lsof", ["-nP", "-tiTCP:" + port, "-sTCP:LISTEN"]);
  const pids = pidOutput.split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
  for (const pid of pids) {
    const command = runCommandAllowFailure("ps", ["-p", String(pid), "-o", "command="]).trim();
    if (!command.includes(destination)) {
      throw new Error(`Port ${port} is owned by unmanaged PID ${pid}: ${command || "unknown command"}`);
    }
    process.kill(pid, "SIGTERM");
  }

  const deadline = Date.now() + 3_000;
  for (const pid of pids) {
    while (processExists(pid) && Date.now() < deadline) Bun.sleepSync(50);
    if (processExists(pid)) process.kill(pid, "SIGKILL");
  }
}

async function probeRuntimeHealth(port: number, expectedCommit?: string): Promise<boolean> {
  const endpoint = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const body = await response.json() as { status?: string; buildCommit?: string };
        if (expectedCommit) {
          if (body.status === "ok" && body.buildCommit === expectedCommit) return true;
        } else if (body.status === "ok" || body.status === "UP") {
          return true;
        }
      }
    } catch {
      // Startup races are expected during the bounded probe window.
    }
    await Bun.sleep(250);
  }
  return false;
}

function writePrivateJson(path: string, value: unknown): void {
  writeFileAtomic(path, JSON.stringify(value, null, 2) + "\n", 0o600);
}

function writeExecutable(path: string, content: string): void {
  writeFileAtomic(path, content, 0o755);
}

function writeFileAtomic(path: string, content: string, mode: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { mode });
  renameSync(temporary, path);
  chmodSync(path, mode);
}

function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  inherit = false
): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"]
  }) as string;
}

function runCommandAllowFailure(command: string, args: string[]): string {
  try {
    return runCommand(command, args);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 1;
    if (status === 1) return "";
    throw error;
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function launchDomain(): string {
  if (typeof process.getuid !== "function") throw new Error("Unable to resolve the current macOS user id.");
  return `gui/${process.getuid()}`;
}

function findBun(): string {
  if (basename(process.execPath) === "bun") return process.execPath;
  return runCommand("which", ["bun"]).trim();
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return value;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function commandErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
  return [value.stderr, value.stdout, value.message]
    .filter(Boolean)
    .map((part) => Buffer.isBuffer(part) ? part.toString("utf8") : String(part))
    .join("\n")
    .toLowerCase();
}


function readRuntimeManifest(destination: string): RuntimeManifest | null {
  const manifestPath = join(destination, ".runtime", "install-manifest.json");
  try {
    const value = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<RuntimeManifest>;
    if (
      value.version !== 1 ||
      typeof value.sourceCommit !== "string" ||
      typeof value.sourceRoot !== "string" ||
      typeof value.installedAt !== "string" ||
      typeof value.port !== "number"
    ) return null;
    return value as RuntimeManifest;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


function removeOwnedLegacyLaunchAgent(destination: string, launchAgents: string): void {
  const legacyPath = join(launchAgents, "com.kaku.harnessd.plist");
  if (!existsSync(legacyPath)) return;
  const content = readFileSync(legacyPath, "utf8");
  if (content.includes(destination)) rmSync(legacyPath, { force: true });
}


function managedIntegrationPaths(homeDir: string): string[] {
  return [
    join(homeDir, ".local", "bin", "harnessctl"),
    join(homeDir, ".config", "kaku", "zsh", "plugins", "chatgpt-harness.zsh"),
    join(homeDir, "Library", "LaunchAgents", "com.kaku.chatgpt-harness.plist"),
    join(homeDir, "Library", "LaunchAgents", "com.kaku.harnessd.plist")
  ];
}

function captureManagedIntegrations(homeDir: string): FileSnapshot[] {
  return managedIntegrationPaths(homeDir).map((path) => {
    if (!existsSync(path)) return { path, content: null, mode: null };
    return {
      path,
      content: readFileSync(path),
      mode: statSync(path).mode & 0o777
    };
  });
}

function restoreManagedIntegrations(snapshots: FileSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.content === null || snapshot.mode === null) {
      rmSync(snapshot.path, { force: true });
      continue;
    }
    mkdirSync(dirname(snapshot.path), { recursive: true });
    const temporary = `${snapshot.path}.restore-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, snapshot.content, { mode: snapshot.mode });
    renameSync(temporary, snapshot.path);
    chmodSync(snapshot.path, snapshot.mode);
  }
}

function finalizeManagedIntegrations(destination: string, homeDir: string): void {
  removeOwnedLegacyLaunchAgent(destination, join(homeDir, "Library", "LaunchAgents"));
}


function writePreviousIntegrationSnapshot(destination: string, snapshots: FileSnapshot[]): void {
  const serializable = snapshots.map((snapshot) => ({
    path: snapshot.path,
    mode: snapshot.mode,
    contentBase64: snapshot.content?.toString("base64") ?? null
  }));
  writePrivateJson(
    join(destination, ".runtime", "previous-integrations.json"),
    serializable
  );
}


export async function rollbackRuntime(
  options: RollbackOptions,
  hooks: InstallerHooks = defaultHooks()
): Promise<InstallResult> {
  const destination = resolve(options.destination);
  const previousPath = `${destination}.previous`;
  const homeDir = resolve(options.homeDir ?? homedir());
  if (!existsSync(destination)) throw new Error(`Installed runtime is missing: ${destination}`);
  if (!existsSync(previousPath)) throw new Error(`Previous runtime is missing: ${previousPath}`);

  const currentManifest = readRuntimeManifest(destination);
  if (!currentManifest) throw new Error("Current runtime is not a managed release.");
  const previousManifest = readRuntimeManifest(previousPath);
  const previousCommit = previousManifest?.sourceCommit;
  const previousPort = previousManifest?.port ?? currentManifest.port;
  const previousIntegrations = readPreviousIntegrationSnapshot(destination, homeDir);
  const currentIntegrations = captureManagedIntegrations(homeDir);
  const swapPath = `${destination}.rollback-swap-${process.pid}-${Date.now()}`;

  await hooks.stopOwnedRuntime(destination, homeDir, currentManifest.port);
  renameSync(destination, swapPath);
  renameSync(previousPath, destination);
  renameSync(swapPath, previousPath);
  restoreManagedIntegrations(previousIntegrations);
  writePreviousIntegrationSnapshot(destination, currentIntegrations);

  try {
    await hooks.startRuntime(destination, homeDir, previousPort, previousCommit);
    if (!await hooks.probeHealth(previousPort, previousCommit)) {
      throw new Error("Previous runtime failed its explicit rollback health probe.");
    }
    return {
      commit: previousCommit ?? "legacy",
      destination,
      previousPath,
      dryRun: false
    };
  } catch (error) {
    await hooks.stopOwnedRuntime(destination, homeDir, previousPort).catch(() => undefined);
    renameSync(destination, swapPath);
    renameSync(previousPath, destination);
    renameSync(swapPath, previousPath);
    restoreManagedIntegrations(currentIntegrations);

    try {
      await hooks.startRuntime(destination, homeDir, currentManifest.port, currentManifest.sourceCommit);
      if (!await hooks.probeHealth(currentManifest.port, currentManifest.sourceCommit)) {
        throw new Error("Current runtime failed recovery after rollback failure.");
      }
    } catch (recoveryError) {
      throw new Error(
        `${errorMessage(error)} Recovery also failed: ${errorMessage(recoveryError)}`
      );
    }
    throw error;
  }
}


function readPreviousIntegrationSnapshot(destination: string, homeDir: string): FileSnapshot[] {
  const snapshotPath = join(destination, ".runtime", "previous-integrations.json");
  const raw = JSON.parse(readFileSync(snapshotPath, "utf8")) as Array<{
    path?: unknown;
    mode?: unknown;
    contentBase64?: unknown;
  }>;
  if (!Array.isArray(raw)) throw new Error("Previous integration snapshot is invalid.");

  const allowedPaths = new Set(managedIntegrationPaths(homeDir));
  return raw.map((entry) => {
    if (typeof entry.path !== "string" || !allowedPaths.has(entry.path)) {
      throw new Error("Previous integration snapshot contains an unmanaged path.");
    }
    const mode = entry.mode === null ? null : Number(entry.mode);
    if (mode !== null && (!Number.isInteger(mode) || mode < 0 || mode > 0o777)) {
      throw new Error("Previous integration snapshot contains an invalid mode.");
    }
    if (entry.contentBase64 !== null && typeof entry.contentBase64 !== "string") {
      throw new Error("Previous integration snapshot contains invalid content.");
    }
    return {
      path: entry.path,
      mode,
      content: entry.contentBase64 === null ? null : Buffer.from(entry.contentBase64, "base64")
    };
  });
}
