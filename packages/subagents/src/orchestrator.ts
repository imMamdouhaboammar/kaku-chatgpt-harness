import { DelegateContract, SubagentExecutionResult, SubagentTaskRecord, SubagentBackend } from "./contract-schema.ts";
import { SubagentRunner } from "./subagent-runner.ts";
import { join } from "node:path";

export class SubagentOrchestrator {
  private activeMutatingWorktrees: Set<string> = new Set();
  public readonly runner: SubagentRunner = new SubagentRunner();

  public validateContract(contract: DelegateContract): string[] {
    const errors: string[] = [];
    if (!contract.taskId) errors.push("Missing taskId in delegate contract");
    if (!contract.goal) errors.push("Missing goal in delegate contract");
    if (!contract.projectRoot) errors.push("Missing projectRoot in delegate contract");

    if (contract.mode === "mutating") {
      if (this.activeMutatingWorktrees.has(contract.projectRoot)) {
        errors.push(`Mutating subagent conflict: worktree '${contract.projectRoot}' is already being mutated by another agent.`);
      }
    }
    return errors;
  }

  public spawnSubagent(goal: string, backend: SubagentBackend = "codex", projectRoot: string, mode: "read-only" | "mutating" = "read-only"): SubagentTaskRecord {
    const taskId = `task_${crypto.randomUUID().slice(0, 8)}`;
    const contract: DelegateContract = {
      taskId,
      goal,
      projectRoot,
      mode,
      backend,
      allowedPaths: [projectRoot],
      forbiddenPaths: [],
      requiredSkills: [],
      requiredTests: [],
      timeoutSeconds: 900
    };

    const errors = this.validateContract(contract);
    if (errors.length > 0) throw new Error(errors.join("; "));

    this.registerTaskStart(contract);
    const logFilePath = join("/tmp", "subagents", `${taskId}.log`);

    return this.runner.spawn({
      taskId,
      goal,
      projectRoot,
      backend,
      logFilePath
    });
  }

  public getSubagentStatus(subagentId: string): SubagentTaskRecord | null {
    return this.runner.getStatus(subagentId);
  }

  public listSubagents(): SubagentTaskRecord[] {
    return this.runner.listTasks();
  }

  public killSubagent(subagentId: string): boolean {
    return this.runner.kill(subagentId);
  }

  public registerTaskStart(contract: DelegateContract): void {
    if (contract.mode === "mutating") {
      this.activeMutatingWorktrees.add(contract.projectRoot);
    }
  }

  public registerTaskComplete(contract: DelegateContract): void {
    if (contract.mode === "mutating") {
      this.activeMutatingWorktrees.delete(contract.projectRoot);
    }
  }

  public createResult(contract: DelegateContract, success: boolean, output: string, changedFiles: string[] = []): SubagentExecutionResult {
    return {
      taskId: contract.taskId,
      success,
      evidence: [`Executed task '${contract.taskId}' for goal: ${contract.goal}`],
      changedFiles,
      testResults: contract.requiredTests.map((t) => ({ testName: t, passed: success })),
      unresolvedRisks: success ? [] : ["Subagent execution reported failure or timeout."],
      output
    };
  }
}
