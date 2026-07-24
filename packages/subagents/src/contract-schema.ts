export type SubagentBackend = "codex" | "agy" | "opencode" | "gemini" | "minimax" | "self";

export interface DelegateContract {
  taskId: string;
  goal: string;
  projectRoot: string;
  mode: "read-only" | "mutating";
  backend?: SubagentBackend;
  allowedPaths: string[];
  forbiddenPaths: string[];
  requiredSkills: string[];
  requiredTests: string[];
  timeoutSeconds: number;
}

export interface SubagentTaskRecord {
  subagentId: string;
  taskId: string;
  goal: string;
  backend: SubagentBackend;
  projectRoot: string;
  status: "running" | "completed" | "failed" | "killed";
  pid: number;
  logFilePath: string;
  createdAt: string;
  finishedAt?: string;
  output?: string;
}

export interface SubagentExecutionResult {
  taskId: string;
  success: boolean;
  evidence: string[];
  changedFiles: string[];
  testResults: { testName: string; passed: boolean }[];
  unresolvedRisks: string[];
  output: string;
}
