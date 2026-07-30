export type JsonRpcId = string | number | null;
export type JsonRpcParams = Record<string, unknown> | unknown[];

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: JsonRpcParams;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: T;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class JsonRpcProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    assertIntegerCode(code);
    super(message);
    this.name = "JsonRpcProtocolError";
  }
}

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (!isRecord(value)) {
    throw new JsonRpcProtocolError(-32600, "Invalid Request: body must be an object.");
  }
  if (value.jsonrpc !== "2.0") {
    throw new JsonRpcProtocolError(-32600, "Invalid Request: jsonrpc must equal '2.0'.");
  }
  if (typeof value.method !== "string" || !value.method.trim()) {
    throw new JsonRpcProtocolError(-32600, "Invalid Request: method must be a non-empty string.");
  }
  if ("id" in value && !isJsonRpcId(value.id)) {
    throw new JsonRpcProtocolError(-32600, "Invalid Request: id must be a string, number, or null.");
  }
  if ("params" in value && value.params !== undefined && !isRecord(value.params) && !Array.isArray(value.params)) {
    throw new JsonRpcProtocolError(-32602, "Invalid params: params must be an object or array.");
  }

  return {
    jsonrpc: "2.0",
    ...(Object.hasOwn(value, "id") ? { id: value.id as JsonRpcId } : {}),
    method: value.method,
    ...(value.params === undefined ? {} : { params: value.params as JsonRpcParams })
  };
}

export function jsonRpcResult<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcFailure {
  assertIntegerCode(code);
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function assertIntegerCode(code: number): void {
  if (!Number.isInteger(code)) {
    throw new TypeError("JSON-RPC error code must be an integer.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

export * from "./acp.js";

