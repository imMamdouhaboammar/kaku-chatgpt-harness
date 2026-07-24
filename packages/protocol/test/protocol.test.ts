import { describe, expect, test } from "bun:test";
import {
  JsonRpcProtocolError,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpcRequest
} from "../src/index";

describe("JSON-RPC protocol boundary", () => {
  test("parses a valid request and preserves its id", () => {
    const request = parseJsonRpcRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "fs.readText", arguments: { path: "/tmp/file" } }
    });

    expect(request.id).toBe(7);
    expect(request.method).toBe("tools/call");
  });

  test("accepts notifications without an id and preserves the method selector", () => {
    const request = parseJsonRpcRequest({ jsonrpc: "2.0", method: " notifications/initialized " });

    expect(request.id).toBeUndefined();
    expect(request.method).toBe(" notifications/initialized ");
  });

  test("rejects non-object requests", () => {
    expect(() => parseJsonRpcRequest(null)).toThrow(JsonRpcProtocolError);

    try {
      parseJsonRpcRequest(null);
    } catch (error) {
      expect((error as JsonRpcProtocolError).code).toBe(-32600);
    }
  });

  test("rejects missing protocol version and method", () => {
    expect(() => parseJsonRpcRequest({ method: "tools/call" })).toThrow("jsonrpc");
    expect(() => parseJsonRpcRequest({ jsonrpc: "2.0" })).toThrow("method");
  });

  test("rejects primitive params", () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: "bad" })).toThrow("params");
  });

  test("rejects non-integer error codes", () => {
    expect(() => new JsonRpcProtocolError(1.5, "bad code")).toThrow("integer");
    expect(() => jsonRpcError(null, Number.NaN, "bad code")).toThrow("integer");
    expect(() => jsonRpcError(null, Number.POSITIVE_INFINITY, "bad code")).toThrow("integer");
  });

  test("builds standard result and error responses", () => {
    expect(jsonRpcResult("abc", { ok: true })).toEqual({
      jsonrpc: "2.0",
      id: "abc",
      result: { ok: true }
    });
    expect(jsonRpcError(null, -32601, "Method not found")).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32601, message: "Method not found" }
    });
  });
});
