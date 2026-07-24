import { describe, test, expect } from "bun:test";
import { SubagentOrchestrator, DelegateContract } from "@harness/subagents";

describe("Subagents Unit Suite", () => {
  const orchestrator = new SubagentOrchestrator();

  test("validates_contract_and_catches_missing_required_fields", () => {
    const invalidContract: DelegateContract = {
      taskId: "",
      goal: "",
      projectRoot: "",
      mode: "read-only",
      allowedPaths: [],
      forbiddenPaths: [],
      requiredSkills: [],
      requiredTests: [],
      timeoutSeconds: 300
    };

    const errors = orchestrator.validateContract(invalidContract);
    expect(errors.length).toBe(3);
    expect(errors).toContain("Missing taskId in delegate contract");
  });

  test("enforces_worktree_mutation_lock_against_concurrent_mutating_agents", () => {
    const contract1: DelegateContract = {
      taskId: "t1",
      goal: "Modify backend API",
      projectRoot: "/tmp/worktree-a",
      mode: "mutating",
      allowedPaths: [],
      forbiddenPaths: [],
      requiredSkills: [],
      requiredTests: [],
      timeoutSeconds: 300
    };

    orchestrator.registerTaskStart(contract1);

    const contract2: DelegateContract = {
      taskId: "t2",
      goal: "Refactor database models",
      projectRoot: "/tmp/worktree-a",
      mode: "mutating",
      allowedPaths: [],
      forbiddenPaths: [],
      requiredSkills: [],
      requiredTests: [],
      timeoutSeconds: 300
    };

    const errors = orchestrator.validateContract(contract2);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("already being mutated");

    orchestrator.registerTaskComplete(contract1);
    const errorsAfterComplete = orchestrator.validateContract(contract2);
    expect(errorsAfterComplete.length).toBe(0);
  });

  test("creates_structured_execution_result_with_evidence", () => {
    const contract: DelegateContract = {
      taskId: "task-99",
      goal: "Fix bug in calculation",
      projectRoot: "/tmp/wt",
      mode: "read-only",
      allowedPaths: [],
      forbiddenPaths: [],
      requiredSkills: [],
      requiredTests: ["test-calc"],
      timeoutSeconds: 300
    };

    const result = orchestrator.createResult(contract, true, "Execution complete", ["src/calc.ts"]);
    expect(result.success).toBeTrue();
    expect(result.changedFiles).toContain("src/calc.ts");
    expect(result.testResults[0].testName).toBe("test-calc");
    expect(result.testResults[0].passed).toBeTrue();
  });
});
