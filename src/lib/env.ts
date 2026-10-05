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
