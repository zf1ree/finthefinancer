import "server-only";
import { ProviderError, type OpenFinanceProvider } from "@/application/sync/provider";
import { pluggyEnv } from "@/lib/env";
import { createPluggyProvider } from "./pluggy";

let cached: OpenFinanceProvider | undefined;

export function isProviderConfigured(): boolean {
  return pluggyEnv() !== null;
}

/** Provedor único do app (Pluggy). Reaproveita a chave de API entre chamadas na mesma instância. */
export function getProvider(): OpenFinanceProvider {
  if (cached) return cached;
  const env = pluggyEnv();
  if (!env) {
    throw new ProviderError("not_configured", "PLUGGY_CLIENT_ID/SECRET não configurados");
  }
  cached = createPluggyProvider({
    clientId: env.PLUGGY_CLIENT_ID,
    clientSecret: env.PLUGGY_CLIENT_SECRET,
    baseUrl: env.PLUGGY_API_URL,
  });
  return cached;
}
