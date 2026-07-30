import { describe, expect, test } from "bun:test";
import { ConfidenceSteppingEngine, DurableVectorMemory, PromptCacheEngine } from "../src/index.js";

describe("PromptCacheEngine (jcode architecture)", () => {
  test("stabilizes static prompt prefix and tracks append-only history", () => {
    const engine = new PromptCacheEngine("System Prompt Baseline");
    engine.appendTurn("user", "Hello");
    engine.appendTurn("assistant", "Hi there!");

    const history = engine.getHistory();
    expect(history.length).toBe(3);
    expect(history[0]?.content).toBe("System Prompt Baseline");
    expect(engine.calculateCacheHitRatio()).toBeGreaterThan(0.5);
  });
});

describe("ConfidenceSteppingEngine (jcode architecture)", () => {
  test("triggers verification pass on sudden confidence jump", () => {
    const engine = new ConfidenceSteppingEngine();
    const todo = engine.addTodo("Implement ACP protocol", 60);

    const result = engine.completeTodo(todo.id, 98);
    expect(result.requiresVerificationPass).toBe(true);
    expect(result.reason).toBe("Confidence spike detected");
  });

  test("generates Auto-Poke when turn ends with pending todos", () => {
    const engine = new ConfidenceSteppingEngine();
    engine.addTodo("Task A");

    const poke = engine.checkForAutoPoke();
    expect(poke.shouldPoke).toBe(true);
    expect(poke.pokeMessage).toContain("Auto-Poke");
  });
});

describe("DurableVectorMemory (jcode architecture)", () => {
  test("stores and queries semantic memories by cosine similarity", () => {
    const memory = new DurableVectorMemory();
    memory.storeMemory("gcloud", "Configured Google Cloud ADC for dohaezz46@gmail.com");
    memory.storeMemory("jcode", "Installed jcode CLI v0.64.1 in /Users/mamdouhaboammar/.local/bin");

    const results = memory.queryMemory("Google Cloud ADC");
    expect(results.length).toBeGreaterThan(0);
  });
});
