import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import { createTransactionRunners } from "./scoped";

export type { UserId } from "./scoped";

let runners: ReturnType<typeof createTransactionRunners> | undefined;

function getRunners() {
  if (!runners) {
    // prepare: false é exigido pelo pooler do Supabase em modo transação.
    const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
    runners = createTransactionRunners(drizzle(client));
  }
  return runners;
}

/** Executa `fn` como o usuário autenticado: RLS garante que só as linhas dele aparecem. */
export const withUser: ReturnType<typeof createTransactionRunners>["withUser"] = (userId, fn) =>
  getRunners().withUser(userId, fn);

/** Executa `fn` como service_role (ignora RLS). Só para o cron e tarefas do sistema. */
export const withSystem: ReturnType<typeof createTransactionRunners>["withSystem"] = (fn) =>
  getRunners().withSystem(fn);
