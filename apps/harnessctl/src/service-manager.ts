import { execSync } from "node:child_process";
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const home = process.env.HOME || "/Users/mamdouhaboammar";
const plistDir = join(home, "Library", "LaunchAgents");
const plistPath = join(plistDir, "com.kaku.harnessd.plist");

export class ServiceManager {
  public generatePlistContent(): string {
    const bunPath = execSync("which bun 2>/dev/null", { encoding: "utf8" }).trim() || "/opt/homebrew/bin/bun";
    const entryPath = join(home, "kaku-chatgpt-harness", "apps", "harnessd", "src", "index.ts");
    const logPath = join(home, ".harnessd", "launchd.log");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kaku.harnessd</string>
    <key>ProgramArguments</key>
    <array>
        <string>${bunPath}</string>
        <string>run</string>
        <string>${entryPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
</dict>
</plist>`;
  }

  public installService(): boolean {
    if (!existsSync(plistDir)) mkdirSync(plistDir, { recursive: true });
    const content = this.generatePlistContent();
    writeFileSync(plistPath, content, "utf8");

    try {
      execSync(`launchctl load -w "${plistPath}" 2>/dev/null`, { encoding: "utf8" });
      return true;
    } catch {
      return false;
    }
  }

  public uninstallService(): boolean {
    if (!existsSync(plistPath)) return true;
    try {
      execSync(`launchctl unload -w "${plistPath}" 2>/dev/null`, { encoding: "utf8" });
    } catch {
      // Ignore unload error
    }
    if (existsSync(plistPath)) unlinkSync(plistPath);
    return true;
  }

  public isServiceInstalled(): boolean {
    return existsSync(plistPath);
  }

  public getServiceStatus(): string {
    if (!this.isServiceInstalled()) return "NOT_INSTALLED";
    try {
      const output = execSync("launchctl list com.kaku.harnessd 2>/dev/null", { encoding: "utf8" });
      return output.includes("PID") ? "RUNNING" : "LOADED";
    } catch {
      return "STOPPED";
    }
  }
}
