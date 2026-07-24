import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { uninstallRuntime } from "./runtime-manager";

export interface ParsedUninstallArgs {
  destination: string;
  homeDir: string;
  port: number;
}

export function parseUninstallArgs(args: string[], defaultHome = homedir()): ParsedUninstallArgs {
  let destination = join(defaultHome, "kaku-chatgpt-harness");
  let homeDir = defaultHome;
  let port = 8765;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const equalsIndex = argument.indexOf("=");
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex < 0 ? undefined : argument.slice(equalsIndex + 1);

    switch (name) {
      case "--destination": {
        const value = optionValue(name, inlineValue, args[index + 1]);
        destination = value;
        if (inlineValue === undefined) index++;
        break;
      }
      case "--home": {
        const value = optionValue(name, inlineValue, args[index + 1]);
        homeDir = value;
        if (inlineValue === undefined) index++;
        break;
      }
      case "--port": {
        const value = optionValue(name, inlineValue, args[index + 1]);
        port = validatePort(Number(value));
        if (inlineValue === undefined) index++;
        break;
      }
      default:
        throw new Error(`Unknown option: ${name}`);
    }
  }

  return {
    destination: resolve(destination),
    homeDir: resolve(homeDir),
    port
  };
}

function optionValue(name: string, inlineValue: string | undefined, nextValue: string | undefined): string {
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
  const parsed = parseUninstallArgs(process.argv.slice(2));
  await uninstallRuntime(parsed.destination, parsed.homeDir, parsed.port);
  console.log(`[uninstaller] Removed managed runtime ${parsed.destination}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[uninstaller] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
