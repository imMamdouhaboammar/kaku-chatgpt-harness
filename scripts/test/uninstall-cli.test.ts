import { describe, expect, test } from "bun:test";
import { parseUninstallArgs } from "../uninstall-runtime";

describe("uninstall runtime CLI", () => {
  test("uses managed runtime defaults", () => {
    expect(parseUninstallArgs([], "/Users/tester")).toEqual({
      destination: "/Users/tester/kaku-chatgpt-harness",
      homeDir: "/Users/tester",
      port: 8765
    });
  });

  test("parses explicit runtime locations", () => {
    expect(parseUninstallArgs([
      "--destination=/tmp/runtime",
      "--home", "/tmp/home",
      "--port", "9100"
    ], "/Users/tester")).toEqual({
      destination: "/tmp/runtime",
      homeDir: "/tmp/home",
      port: 9100
    });
  });

  test("rejects unknown options and invalid ports", () => {
    expect(() => parseUninstallArgs(["--unknown"], "/tmp/home")).toThrow("Unknown option");
    expect(() => parseUninstallArgs(["--port", "abc"], "/tmp/home")).toThrow("port");
  });
});
