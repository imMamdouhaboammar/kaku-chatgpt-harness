import { JsonRpcRequest, parseJsonRpcRequest } from "./index.js";

export interface AcpTodoItem {
  id: string;
  title: string;
  completed: boolean;
  confidenceScoreAtAssignment?: number; // 0 - 100
  confidenceScoreAtCompletion?: number; // 0 - 100
}

export interface AcpStateNotification {
  jsonrpc: "2.0";
  method: "acp/state/update";
  params: {
    sessionId: string;
    status: "idle" | "thinking" | "executing" | "error";
    currentGoal?: string;
    todos: AcpTodoItem[];
    overallConfidence: number; // 0 - 100
    cacheHitRatio: number; // 0.0 - 1.0
  };
}

export function buildAcpStateNotification(
  sessionId: string,
  status: "idle" | "thinking" | "executing" | "error",
  todos: AcpTodoItem[],
  overallConfidence = 90,
  cacheHitRatio = 0.95,
  currentGoal?: string
): AcpStateNotification {
  return {
    jsonrpc: "2.0",
    method: "acp/state/update",
    params: {
      sessionId,
      status,
      currentGoal,
      todos,
      overallConfidence,
      cacheHitRatio
    }
  };
}

export function parseAcpRequest(value: unknown): JsonRpcRequest {
  return parseJsonRpcRequest(value);
}
