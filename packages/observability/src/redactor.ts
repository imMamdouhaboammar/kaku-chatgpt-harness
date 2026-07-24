/**
 * Secret and sensitive data redaction utility.
 */

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /secret:\/\/[A-Za-z0-9_\-\/]+/g,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  /(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|pass|secret|token)\s*[:=]\s*["']?([^\s"']{8,})["']?/gi
];

export function redactText(text: string): string {
  if (!text) return "";
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED_SECRET]");
  }
  return redacted;
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (/password|secret|token|key|cred/i.test(key) && typeof val === "string") {
        result[key] = "[REDACTED_SECRET]";
      } else {
        result[key] = redactValue(val);
      }
    }
    return result;
  }
  return value;
}
