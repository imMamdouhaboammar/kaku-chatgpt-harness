import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface AgencySkillInfo {
  name: string;
  description: string;
  sourcePath: string;
  category: string;
}

export interface CodingToolManifest {
  name: string;
  description: string;
  parameters: Record<string, string>;
}

export interface AgencyHarnessProfile {
  autoInjected: boolean;
  skillsCount: number;
  availableRoles: string[];
  systemPromptAddendum: string;
  codingTools: CodingToolManifest[];
  createdAt: string;
}

export class AgencyHarnessEngine {
  public scanAgencySkills(skillsDir: string): AgencySkillInfo[] {
    if (!existsSync(skillsDir)) return [];
    const skills: AgencySkillInfo[] = [];
    const entries = readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(skillsDir, entry.name, "SKILL.md");
        if (existsSync(skillPath)) {
          const content = readFileSync(skillPath, "utf8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);

          const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : entry.name;
          const description = descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, "") : "Agency specialized skill";
          const category = name.startsWith("engineering") ? "engineering" : name.startsWith("design") ? "design" : "other";

          skills.push({ name, description, sourcePath: skillPath, category });
        }
      }
    }
    return skills;
  }

  public generateCodingToolsManifest(): CodingToolManifest[] {
    return [
      {
        name: "exec_command",
        description: "Executes shell commands safely inside session project root",
        parameters: { command: "string", cwd: "optional string" }
      },
      {
        name: "view_file",
        description: "Reads local file content within allowed path boundary",
        parameters: { absolutePath: "string" }
      },
      {
        name: "edit_file",
        description: "Applies targeted code changes or creates new project files",
        parameters: { targetFile: "string", replacementContent: "string" }
      },
      {
        name: "git_worktree",
        description: "Creates isolated Git worktree for safe mutating operations",
        parameters: { worktreeId: "string" }
      },
      {
        name: "run_subagent",
        description: "Delegates bounded subtask to specialized subagent contract",
        parameters: { taskId: "string", goal: "string", mode: "read-only | mutating" }
      },
      {
        name: "check_policy",
        description: "Evaluates command against Agent Kernel policies prior to execution",
        parameters: { command: "string" }
      }
    ];
  }

  public buildProfile(projectRoot: string): AgencyHarnessProfile {
    const projectSkillsDir = join(projectRoot, ".agents", "skills");
    let skills = this.scanAgencySkills(projectSkillsDir);

    // Fallback: search system skill locations if project has none
    if (skills.length === 0) {
      const fallbackDir = "/Users/mamdouhaboammar/Documents/Kaku-ChatGPT-Harness/.agents/skills";
      skills = this.scanAgencySkills(fallbackDir);
    }

    const availableRoles = skills.map((s) => s.name);
    const codingTools = this.generateCodingToolsManifest();

    const systemPromptAddendum = [
      "=== AGENCY AGENTS HARNESS ACTIVE ===",
      `You are operating with ${skills.length} specialized Agency Agent roles and powerful coding tools under your control.`,
      `Available Engineering & Design Roles: ${availableRoles.slice(0, 10).join(", ")}${availableRoles.length > 10 ? `... (+${availableRoles.length - 10} more)` : ""}`,
      `Coding Tools Enabled: ${codingTools.map((t) => t.name).join(", ")}`,
      "Enforce clean code, SOLID principles, boundary path isolation, and test verification on all modifications."
    ].join("\n");

    return {
      autoInjected: true,
      skillsCount: skills.length,
      availableRoles,
      systemPromptAddendum,
      codingTools,
      createdAt: new Date().toISOString()
    };
  }
}
