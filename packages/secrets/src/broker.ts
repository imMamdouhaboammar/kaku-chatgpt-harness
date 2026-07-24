import { execSync } from "node:child_process";
import { redactText } from "@harness/observability";

export interface SecretReference {
  scheme: "secret";
  namespace: string;
  key: string;
  rawRef: string;
}

export class SecretBroker {
  private memoryCache: Map<string, string> = new Map();

  public parseReference(refString: string): SecretReference | null {
    if (!refString.startsWith("secret://")) return null;
    const path = refString.slice("secret://".length);
    const parts = path.split("/");
    if (parts.length < 2) return null;
    return {
      scheme: "secret",
      namespace: parts.slice(0, parts.length - 1).join("/"),
      key: parts[parts.length - 1],
      rawRef: refString
    };
  }

  public registerSecretInMemory(refString: string, secretValue: string): void {
    this.memoryCache.set(refString, secretValue);
  }

  public resolveSecret(refString: string): string | null {
    if (this.memoryCache.has(refString)) {
      return this.memoryCache.get(refString)!;
    }
    const parsed = this.parseReference(refString);
    if (!parsed) return null;

    try {
      const output = execSync(
        `security find-generic-password -a "${parsed.key}" -s "${parsed.namespace}" -w 2>/dev/null`,
        { encoding: "utf8" }
      );
      const val = output.trim();
      if (val) {
        this.memoryCache.set(refString, val);
        return val;
      }
    } catch {
      // Secret not found in Keychain
    }
    return null;
  }

  public injectSecretsIntoEnv(env: Record<string, string>, mappings: Record<string, string>): Record<string, string> {
    const nextEnv = { ...env };
    for (const [envVar, secretRef] of Object.entries(mappings)) {
      const val = this.resolveSecret(secretRef);
      if (val) {
        nextEnv[envVar] = val;
      }
    }
    return nextEnv;
  }

  public sanitizeOutput(output: string): string {
    let sanitized = redactText(output);
    for (const secretVal of this.memoryCache.values()) {
      if (secretVal && secretVal.length > 3) {
        sanitized = sanitized.replaceAll(secretVal, "[REDACTED_KEYCHAIN_SECRET]");
      }
    }
    return sanitized;
  }
}
