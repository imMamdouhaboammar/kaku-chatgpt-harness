import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { installRuntime, rollbackRuntime } from "./runtime-manager";

export interface ParsedInstallArgs {
  destination: string;
  homeDir: string;
  port: number;
  dryRun: boolean;
  start: boolean;
  rollback: boolean;
}

export function parseInstallArgs(args: string[], defaultHome = homedir()): ParsedInstallArgs {
  let destination = join(defaultHome, "kaku-chatgpt-harness");
  let homeDir = defaultHome;
  let port = 8765;
  let dryRun = false;
  let start = true;
  let rollback = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const [rawName, inlineValue] = splitOption(argument);

    switch (rawName) {
      case "--destination":
        destination = requireOptionValue(rawName, inlineValue, args[++index]);
        if (inlineValue !== undefined) index--;
        break;
      case "--home":
        homeDir = requireOptionValue(rawName, inlineValue, args[++index]);
        if (inlineValue !== undefined) index--;
        break;
      case "--port": {
        const rawPort = requireOptionValue(rawName, inlineValue, args[++index]);
        if (inlineValue !== undefined) index--;
        port = validatePort(Number(rawPort));
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--no-start":
        start = false;
        break;
      case "--rollback":
        rollback = true;
        break;
      case "--bootstrap-token":
        throw new Error("Pass bootstrap secrets through the HARNESS_BOOTSTRAP_TOKEN environment variable, not command arguments.");
      default:
        throw new Error(`Unknown option: ${rawName}`);
    }
  }

  return {
    destination: resolve(destination),
    homeDir: resolve(homeDir),
    port,
    dryRun,
    start,
    rollback
  };
}

function splitOption(argument: string): [string, string | undefined] {
  const equalsIndex = argument.indexOf("=");
  return equalsIndex < 0
    ? [argument, undefined]
    : [argument.slice(0, equalsIndex), argument.slice(equalsIndex + 1)];
}

function requireOptionValue(name: string, inlineValue: string | undefined, nextValue: string | undefined): string {
  const value = inlineValue ?? nextValue;
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function validatePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("port must be an integer between 1 and 65535.");
  }
  return value;
}

async function main(): Promise<void> {
  const parsed = parseInstallArgs(process.argv.slice(2));
  const sourceRoot = resolve(import.meta.dir, "..");

  if (parsed.rollback) {
    if (parsed.dryRun || !parsed.start) {
      throw new Error("--rollback cannot be combined with --dry-run or --no-start.");
    }
    const result = await rollbackRuntime({
      destination: parsed.destination,
      homeDir: parsed.homeDir
    });
    console.log(`[installer] Rolled back to ${result.commit} at ${result.destination}`);
    return;
  }

  const result = await installRuntime({
    sourceRoot,
    destination: parsed.destination,
    homeDir: parsed.homeDir,
    bootstrapToken: process.env.HARNESS_BOOTSTRAP_TOKEN,
    port: parsed.port,
    dryRun: parsed.dryRun,
    start: parsed.start
  });

  if (result.dryRun) {
    console.log(`[installer] Dry-run passed for commit ${result.commit}`);
    return;
  }
  console.log(`[installer] Installed commit ${result.commit} at ${result.destination}`);
  console.log(`[installer] Previous runtime: ${result.previousPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[installer] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
