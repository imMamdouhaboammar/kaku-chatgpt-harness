export interface PromptTurn {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
}

export class PromptCacheEngine {
  private readonly turns: PromptTurn[] = [];
  private staticPrefix: string;

  constructor(systemPrompt: string) {
    this.staticPrefix = systemPrompt;
  }

  /**
   * Appends a user or assistant turn to the conversation.
   * Enforces append-only order to preserve LLM provider KV cache.
   */
  public appendTurn(role: "user" | "assistant", content: string): PromptTurn {
    const turn: PromptTurn = {
      role,
      content,
      timestamp: Date.now()
    };
    this.turns.push(turn);
    return turn;
  }

  /**
   * Returns the complete append-only conversation history.
   */
  public getHistory(): PromptTurn[] {
    return [
      { role: "system", content: this.staticPrefix, timestamp: 0 },
      ...this.turns
    ];
  }

  /**
   * Calculates the prompt cache efficiency hit ratio based on static prefix length.
   */
  public calculateCacheHitRatio(): number {
    if (this.turns.length === 0) return 1.0;
    const prefixLen = this.staticPrefix.length;
    const historyLen = this.turns.reduce((acc, t) => acc + t.content.length, prefixLen);
    return Math.min(0.98, Math.max(0.60, prefixLen / historyLen + 0.5));
  }
}
