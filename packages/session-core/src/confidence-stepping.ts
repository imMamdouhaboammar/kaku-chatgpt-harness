import { AcpTodoItem } from "@kaku-harness/protocol";

export interface ConfidenceVerificationResult {
  requiresVerificationPass: boolean;
  pokeMessage?: string;
  reason?: string;
}

export class ConfidenceSteppingEngine {
  private readonly todos: AcpTodoItem[] = [];

  public addTodo(title: string, confidenceAtAssignment = 80): AcpTodoItem {
    const item: AcpTodoItem = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      confidenceScoreAtAssignment: confidenceAtAssignment
    };
    this.todos.push(item);
    return item;
  }

  public completeTodo(id: string, confidenceAtCompletion = 95): ConfidenceVerificationResult {
    const item = this.todos.find((t) => t.id === id);
    if (!item) {
      return { requiresVerificationPass: false, reason: "Todo not found" };
    }

    const assignedConf = item.confidenceScoreAtAssignment ?? 70;
    item.completed = true;
    item.confidenceScoreAtCompletion = confidenceAtCompletion;

    // Jcode rule: Large jump in confidence (e.g. from <=75 to 100) triggers verification pass
    const jump = confidenceAtCompletion - assignedConf;
    if (jump >= 25 && confidenceAtCompletion >= 95) {
      return {
        requiresVerificationPass: true,
        pokeMessage: `Confidence jumped from ${assignedConf}% to ${confidenceAtCompletion}% on task "${item.title}". Please run automated tests to verify completion before closing.`,
        reason: "Confidence spike detected"
      };
    }

    return { requiresVerificationPass: false };
  }

  /**
   * Checks if uncompleted todos remain at turn end and generates Auto-Poke prompt.
   */
  public checkForAutoPoke(): { shouldPoke: boolean; pokeMessage?: string } {
    const pending = this.todos.filter((t) => !t.completed);
    if (pending.length === 0) {
      return { shouldPoke: false };
    }

    const titles = pending.map((t) => ` - ${t.title}`).join("\n");
    return {
      shouldPoke: true,
      pokeMessage: `Auto-Poke: The turn ended with ${pending.length} incomplete task(s):\n${titles}\nPlease continue working to complete all items.`
    };
  }

  public getTodos(): AcpTodoItem[] {
    return [...this.todos];
  }
}
