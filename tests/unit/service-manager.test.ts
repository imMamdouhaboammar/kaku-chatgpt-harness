import { describe, test, expect } from "bun:test";
import { ServiceManager } from "../../apps/harnessctl/src/service-manager.ts";

describe("ServiceManager Unit Suite", () => {
  const manager = new ServiceManager();

  test("generatePlistContent_produces_valid_launchd_xml", () => {
    const plist = manager.generatePlistContent();
    expect(plist).toContain("com.kaku.harnessd");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<true/>");
  });

  test("getServiceStatus_returns_valid_status_string", () => {
    const status = manager.getServiceStatus();
    expect(["NOT_INSTALLED", "RUNNING", "LOADED", "STOPPED"]).toContain(status);
  });
});
