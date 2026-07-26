import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyShellIntegration, rewriteBashProfile, rewriteZshenv, rewriteZshrc } from "../shell-integration";

const fixtures: string[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true }); });

function fixtureHome(): string {
  const home = mkdtempSync(join(tmpdir(), "kaku-shell-"));
  fixtures.push(home);
  mkdirSync(join(home, ".config", "kaku", "zsh", "plugins"), { recursive: true });
  writeFileSync(join(home, ".config", "kaku", "zsh", "kaku.zsh"), "export KAKU_MANAGED_SHELL_LOADED=1\n");
  writeFileSync(join(home, ".config", "kaku", "zsh", "plugins", "kaku-skills-harness.zsh"), 'source "$HOME/.config/kaku/zsh/plugins/env.zsh"\n');
  return home;
}

describe("shell startup rewriting", () => {
  test("removes global Kaku injection and installs one idempotent loader", () => {
    const legacyZshenv = `# global\nsource "$HOME/.config/kaku/zsh/plugins/env.zsh"\n`;
    const legacyZshrc = [
      "export PATH=/opt/homebrew/bin:$PATH",
      `[[ -f "$HOME/.config/kaku/zsh/plugins/env.zsh" ]] && source "$HOME/.config/kaku/zsh/plugins/env.zsh"`,
      `[[ -f "$HOME/.config/kaku/zsh/kaku.zsh" ]] && source "$HOME/.config/kaku/zsh/kaku.zsh"`,
      `[[ -f "$HOME/.config/kaku/zsh/plugins/kaku-skills-harness.zsh" ]] && source "$HOME/.config/kaku/zsh/plugins/kaku-skills-harness.zsh"`
    ].join("\n");
    expect(rewriteZshenv(legacyZshenv)).not.toContain("plugins/env.zsh");
    const rewritten = rewriteZshrc(legacyZshrc);
    expect(rewritten.match(/source .*kaku-shell-loader\.zsh/g)?.length).toBe(1);
    expect(rewritten.match(/source .*\/kaku\.zsh/g)?.length).toBe(1);
    expect(rewriteZshrc(rewritten)).toBe(rewritten);
  });

  test("guards optional Bash environment files", () => {
    const output = rewriteBashProfile(`. "$HOME/.local/bin/env"\n. "$HOME/.deno/env"\n`);
    expect(output).toContain(`[ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"`);
    expect(output).toContain(`[ -f "$HOME/.deno/env" ] && . "$HOME/.deno/env"`);
  });
});

describe("installed shell integration", () => {
  test("keeps native Terminal clean and initializes Kaku once", () => {
    const home = fixtureHome();
    writeFileSync(join(home, ".zshenv"), `source "$HOME/.config/kaku/zsh/plugins/env.zsh"\n`);
    writeFileSync(join(home, ".zshrc"), "");
    writeFileSync(join(home, ".bash_profile"), `. "$HOME/.local/bin/env"\n`);
    applyShellIntegration(home);

    const native = runZsh(home, { TERM: "xterm-256color", TERM_PROGRAM: "Apple_Terminal" });
    expect(native.stderr).toBe("");
    expect(native.stdout.trim()).toBe("Apple_Terminal|unset|0|0");

    const kaku = runZsh(home, { TERM: "kaku", TERM_PROGRAM: "Kaku", WEZTERM_PANE: "1" });
    expect(kaku.stderr).toBe("");
    expect(kaku.stdout.trim()).toBe("Kaku|1|1|1");
  });

  test("installs safe Remote Desktop and regression commands", () => {
    const home = fixtureHome();
    applyShellIntegration(home);
    const launcher = readFileSync(join(home, ".local", "bin", "mcp-start"), "utf8");
    expect(launcher).not.toMatch(/pkill|-9|ngrok|serveo/);
    expect(launcher).toContain("already running");
    expect(launcher).toContain("@wonderwhy-er/desktop-commander@0.2.46");
    expect(launcher).not.toContain("@latest");
    expect(launcher).toContain("dedupe");
    const doctor = join(home, ".local", "bin", "kaku-doctor");
    expect(readFileSync(doctor, "utf8")).toContain("kaku-shell-regression.sh");
    expect(Bun.spawnSync(["/bin/bash", "-n", join(home, ".local", "bin", "mcp-start")]).exitCode).toBe(0);
    expect(Bun.spawnSync(["/bin/bash", "-n", doctor]).exitCode).toBe(0);
  });

  test("detects the active Remote Desktop launcher without starting a duplicate", () => {
    const home = fixtureHome();
    applyShellIntegration(home);
    const fakeBin = join(home, "fake-bin");
    mkdirSync(fakeBin, { recursive: true });
    const fakePs = join(fakeBin, "ps");
    writeFileSync(fakePs, '#!/usr/bin/env bash\nprintf " 4242 npm exec @wonderwhy-er/desktop-commander@0.2.46 remote\n"\n');
    chmodSync(fakePs, 0o755);
    const result = Bun.spawnSync({
      cmd: [join(home, ".local", "bin", "mcp-start"), "status"],
      env: { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin` },
      stdout: "pipe",
      stderr: "pipe"
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("4242");
  });

  test("reports duplicate Remote Desktop launcher instances", () => {
    const home = fixtureHome();
    applyShellIntegration(home);
    const fakeBin = join(home, "fake-bin");
    mkdirSync(fakeBin, { recursive: true });
    const fakePs = join(fakeBin, "ps");
    writeFileSync(fakePs, '#!/usr/bin/env bash\nprintf " 4001 npm exec @wonderwhy-er/desktop-commander@0.2.46 remote\n 4002 npm exec @wonderwhy-er/desktop-commander@0.2.46 remote\n"\n');
    chmodSync(fakePs, 0o755);
    const result = Bun.spawnSync({
      cmd: [join(home, ".local", "bin", "mcp-start"), "status"],
      env: { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin` },
      stdout: "pipe",
      stderr: "pipe"
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("Duplicate");
  });
});

function runZsh(home: string, extraEnv: Record<string, string>) {
  const result = Bun.spawnSync({
    cmd: ["/bin/zsh", "-ic", `print -r -- "\${TERM_PROGRAM}|\${KAKU_TERMINAL-unset}|\${+functions[_kaku_discover_skills]}|\${KAKU_MANAGED_SHELL_LOADED-0}"`],
    env: { HOME: home, ZDOTDIR: home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", ...extraEnv },
    stdout: "pipe",
    stderr: "pipe"
  });
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
}
