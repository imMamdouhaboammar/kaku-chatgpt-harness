import { describe, expect, test } from "bun:test";
import { parseInstallArgs } from "../install-runtime";

describe("install runtime CLI", () => {
  test("uses safe defaults", () => {
    const parsed = parseInstallArgs([], "/Users/tester");

    expect(parsed.destination).toBe("/Users/tester/kaku-chatgpt-harness");
    expect(parsed.homeDir).toBe("/Users/tester");
    expect(parsed.port).toBe(8765);
    expect(parsed.start).toBeTrue();
    expect(parsed.dryRun).toBeFalse();
    expect(parsed.rollback).toBeFalse();
  });

  test("parses deployment and rollback flags", () => {
    const parsed = parseInstallArgs([
      "--destination", "/tmp/runtime",
      "--home=/tmp/home",
      "--port", "9000",
      "--dry-run",
      "--no-start",
      "--rollback"
    ], "/Users/tester");

    expect(parsed).toEqual({
      destination: "/tmp/runtime",
      homeDir: "/tmp/home",
      port: 9000,
      dryRun: true,
      start: false,
      rollback: true
    });
  });

  test("rejects secrets and unknown flags", () => {
    expect(() => parseInstallArgs(["--bootstrap-token", "secret"], "/tmp/home")).toThrow("environment");
    expect(() => parseInstallArgs(["--unknown"], "/tmp/home")).toThrow("Unknown option");
  });

  test("rejects invalid ports", () => {
    expect(() => parseInstallArgs(["--port", "0"], "/tmp/home")).toThrow("port");
    expect(() => parseInstallArgs(["--port", "70000"], "/tmp/home")).toThrow("port");
  });
});
