import { describe, test, expect } from "bun:test";
import { AgencyHarnessEngine } from "@harness/skill-index";

describe("AgencyHarnessEngine Unit Suite", () => {
  const engine = new AgencyHarnessEngine();

  test("generateCodingToolsManifest_returns_required_coding_tools", () => {
    const tools = engine.generateCodingToolsManifest();
    expect(tools.length).toBeGreaterThanOrEqual(6);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("exec_command");
    expect(toolNames).toContain("view_file");
    expect(toolNames).toContain("edit_file");
    expect(toolNames).toContain("git_worktree");
    expect(toolNames).toContain("run_subagent");
    expect(toolNames).toContain("check_policy");
  });

  test("scanAgencySkills_indexes_skills_directory", () => {
    const fallbackDir = "/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness/.agents/skills";
    const skills = engine.scanAgencySkills(fallbackDir);
    expect(skills.length).toBeGreaterThan(0);

    const names = skills.map((s) => s.name);
    expect(names).toContain("agency-senior-developer");
  });

  test("buildProfile_generates_auto_injected_agency_harness", () => {
    const profile = engine.buildProfile("/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness");
    expect(profile.autoInjected).toBeTrue();
    expect(profile.skillsCount).toBeGreaterThan(0);
    expect(profile.availableRoles.length).toBeGreaterThan(0);
    expect(profile.codingTools.length).toBeGreaterThanOrEqual(6);
    expect(profile.systemPromptAddendum).toContain("AGENCY AGENTS HARNESS ACTIVE");
  });
});
