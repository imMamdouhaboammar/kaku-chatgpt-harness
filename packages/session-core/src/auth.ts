import { createHmac, randomBytes } from "node:crypto";
import { CapabilityProfile, SessionTokenPayload } from "./types.ts";

export class SessionAuth {
  private readonly secretKey: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey || randomBytes(32).toString("hex");
  }

  public signToken(payload: SessionTokenPayload): string {
    const jsonStr = JSON.stringify(payload);
    const base64Payload = Buffer.from(jsonStr).toString("base64url");
    const signature = createHmac("sha256", this.secretKey)
      .update(base64Payload)
      .digest("base64url");
    return `${base64Payload}.${signature}`;
  }

  public verifyToken(token: string): SessionTokenPayload | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [base64Payload, signature] = parts;
    const expectedSignature = createHmac("sha256", this.secretKey)
      .update(base64Payload)
      .digest("base64url");

    if (signature !== expectedSignature) return null;

    try {
      const decoded = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf8")) as SessionTokenPayload;
      if (Date.now() > decoded.exp) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  public isActionAllowed(profile: CapabilityProfile, action: "read" | "write" | "exec" | "git"): boolean {
    if (profile === "full-local") return true;
    if (profile === "read") return action === "read";
    if (profile === "write-project") return action === "read" || action === "write" || action === "git";
    if (profile === "git") return action === "read" || action === "git";
    if (profile === "process") return action === "read" || action === "exec";
    return false;
  }
}
