import { describe, test, expect } from "bun:test";
import { SecretBroker } from "@harness/secrets";

describe("SecretBroker Unit Suite", () => {
  const broker = new SecretBroker();

  test("parseReference_extracts_scheme_namespace_and_key", () => {
    const parsed = broker.parseReference("secret://supabase/project-a/service_role");
    expect(parsed).not.toBeNull();
    expect(parsed?.scheme).toBe("secret");
    expect(parsed?.namespace).toBe("supabase/project-a");
    expect(parsed?.key).toBe("service_role");
  });

  test("resolveSecret_retrieves_registered_in_memory_secret", () => {
    const ref = "secret://test/app/token";
    broker.registerSecretInMemory(ref, "super_secret_val_123");

    const val = broker.resolveSecret(ref);
    expect(val).toBe("super_secret_val_123");
  });

  test("injectSecretsIntoEnv_populates_target_env_dictionary", () => {
    broker.registerSecretInMemory("secret://db/pass", "my_db_password_99");

    const initialEnv = { NODE_ENV: "production" };
    const mappings = { DATABASE_PASSWORD: "secret://db/pass" };

    const injected = broker.injectSecretsIntoEnv(initialEnv, mappings);
    expect(injected.NODE_ENV).toBe("production");
    expect(injected.DATABASE_PASSWORD).toBe("my_db_password_99");
  });

  test("sanitizeOutput_redacts_registered_secret_values", () => {
    broker.registerSecretInMemory("secret://keychain/token", "top_secret_token_abc");
    const rawOutput = "Process output containing top_secret_token_abc inside output log.";

    const sanitized = broker.sanitizeOutput(rawOutput);
    expect(sanitized).not.toContain("top_secret_token_abc");
    expect(sanitized).toContain("[REDACTED_KEYCHAIN_SECRET]");
  });
});
