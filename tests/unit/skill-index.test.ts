import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SkillIndexer, SkillRouter } from "@harness/skill-index";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_SKILLS_DIR = "/tmp/test_harness_skills";

describe("SkillIndex Unit Suite", () => {
  beforeEach(() => {
    if (existsSync(TEST_SKILLS_DIR)) rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_SKILLS_DIR, "skill-a"), { recursive: true });
    mkdirSync(join(TEST_SKILLS_DIR, "skill-b"), { recursive: true });

    writeFileSync(
      join(TEST_SKILLS_DIR, "skill-a", "SKILL.md"),
      `---\nname: clean-code-guard\ndescription: Review production code against clean code principles\n---\n# Clean Code`
    );

    writeFileSync(
      join(TEST_SKILLS_DIR, "skill-b", "SKILL.md"),
      `---\nname: test-guard\ndescription: Quality gate for unit and integration testing\n---\n# Test Guard`
    );
  });

  afterEach(() => {
    if (existsSync(TEST_SKILLS_DIR)) rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
  });

  test("indexer_populates_sqlite_table_from_skills_directory", () => {
    const indexer = new SkillIndexer(":memory:");
    const count = indexer.indexDirectory(TEST_SKILLS_DIR);
    expect(count).toBe(2);

    const skillA = indexer.getSkill("clean-code-guard");
    expect(skillA).not.toBeNull();
    expect(skillA?.description).toContain("clean code");
  });

  test("router_scores_and_returns_matching_skills", () => {
    const indexer = new SkillIndexer(":memory:");
    indexer.indexDirectory(TEST_SKILLS_DIR);

    const router = new SkillRouter(indexer);
    const matches = router.matchSkills("I need to perform unit testing on my code");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe("test-guard");
  });
});
