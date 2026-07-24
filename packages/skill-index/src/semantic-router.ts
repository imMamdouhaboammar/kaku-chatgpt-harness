import { SkillMetadata } from "./indexer.ts";

export interface SemanticMatchResult {
  skill: SkillMetadata;
  score: number;
  matchedTokens: string[];
}

export class SemanticSkillRouter {
  public rankSkills(skills: SkillMetadata[], query: string, topN = 5): SemanticMatchResult[] {
    if (!query || skills.length === 0) {
      return skills.slice(0, topN).map((skill) => ({ skill, score: 1.0, matchedTokens: [] }));
    }

    const queryTokens = this.tokenize(query);
    const scored = skills.map((skill) => {
      const docTokens = this.tokenize(`${skill.name} ${skill.description}`);
      const { score, matchedTokens } = this.calculateTfIdfScore(queryTokens, docTokens, skill.name);
      return { skill, score, matchedTokens };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter((item) => item.score > 0).slice(0, topN);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  }

  private calculateTfIdfScore(queryTokens: string[], docTokens: string[], skillName: string): { score: number; matchedTokens: string[] } {
    let score = 0;
    const matchedTokens: string[] = [];

    for (const qToken of queryTokens) {
      if (skillName.toLowerCase().includes(qToken)) {
        score += 3.0; // Name match boost
        matchedTokens.push(qToken);
      } else {
        const occurrences = docTokens.filter((t) => t === qToken).length;
        if (occurrences > 0) {
          score += occurrences * 1.0;
          matchedTokens.push(qToken);
        }
      }
    }

    return { score, matchedTokens };
  }
}
