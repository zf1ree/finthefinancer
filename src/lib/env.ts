import { z } from "zod";

/**
 * Variáveis de ambiente validadas na primeira leitura (não no import),
 * para o build não depender de segredos.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const serverSchema = publicSchema.extend({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "deve ser uma URL postgres://"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServer: ServerEnv | undefined;

export function publicEnv(): PublicEnv {
  // Acesso explícito: o Next só embute no bundle do navegador variáveis NEXT_PUBLIC_ lidas assim.
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function serverEnv(): ServerEnv {
  cachedServer ??= serverSchema.parse(process.env);
  return cachedServer;
}

const pluggySchema = z.object({
  PLUGGY_CLIENT_ID: z.string().min(8),
  PLUGGY_CLIENT_SECRET: z.string().min(8),
  PLUGGY_API_URL: z.url().default("https://api.pluggy.ai"),
});

export type PluggyEnv = z.infer<typeof pluggySchema>;

/** Credenciais do Pluggy; null enquanto não forem cadastradas na Vercel. */
export function pluggyEnv(): PluggyEnv | null {
  const parsed = pluggySchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}

const cronSchema = z.object({ CRON_SECRET: z.string().min(32) });

/** Segredo do cron; null se não configurado (a rota recusa tudo). */
export function cronSecret(): string | null {
  const parsed = cronSchema.safeParse(process.env);
  return parsed.success ? parsed.data.CRON_SECRET : null;
}
