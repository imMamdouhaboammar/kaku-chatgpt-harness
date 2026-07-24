import { SkillIndexer, SkillMetadata } from "./indexer.ts";

export class SkillRouter {
  private indexer: SkillIndexer;

  constructor(indexer: SkillIndexer) {
    this.indexer = indexer;
  }

  public matchSkills(query: string, maxResults = 5): SkillMetadata[] {
    const all = this.indexer.getAllSkills();
    if (!query || all.length === 0) return all.slice(0, maxResults);

    const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    const scored = all.map((skill) => {
      let score = 0;
      const haystack = `${skill.name} ${skill.description}`.toLowerCase();
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      return { skill, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter((item) => item.score > 0).map((item) => item.skill).slice(0, maxResults);
  }
}
