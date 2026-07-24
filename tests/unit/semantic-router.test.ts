import { describe, test, expect } from "bun:test";
import { SemanticSkillRouter, SkillMetadata } from "@harness/skill-index";

describe("SemanticSkillRouter Unit Suite", () => {
  const router = new SemanticSkillRouter();
  const sampleSkills: SkillMetadata[] = [
    { name: "engineering-backend-architect", description: "Scalable backend systems and database design", sourcePath: "/a", contentHash: "h1", lastUpdated: "t1" },
    { name: "engineering-frontend-developer", description: "UI component architecture and responsive design", sourcePath: "/b", contentHash: "h2", lastUpdated: "t2" }
  ];

  test("rankSkills_prioritizes_skills_by_name_and_description_relevance", () => {
    const results = router.rankSkills(sampleSkills, "backend database design");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].skill.name).toBe("engineering-backend-architect");
  });
});
