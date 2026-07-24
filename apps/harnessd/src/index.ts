import { HarnessGateway } from "./gateway.ts";
import { join } from "node:path";
import { osHomeDir } from "node:os";

const home = process.env.HOME || "/Users/mamdouhaboammar";
const baseDir = join(home, ".harnessd");

const port = Number(process.env.HARNESS_PORT) || 8765;
const gateway = new HarnessGateway({
  port,
  stateFilePath: join(baseDir, "session_state.json"),
  logFilePath: join(baseDir, "harness.log"),
  journalFilePath: join(baseDir, "event_journal.jsonl")
});

gateway.start();
console.log(`harnessd daemon running on port ${port}`);

// Background orphan reaper loop (every 30 seconds)
const reaperInterval = setInterval(() => {
  gateway.sessionManager.reapOrphans();
}, 30000);

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down harnessd...`);
  clearInterval(reaperInterval);
  gateway.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
