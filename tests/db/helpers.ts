import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inject } from "vitest";
import { createTransactionRunners, toUserId, type UserId } from "@/infrastructure/db/scoped";

export function connect() {
  const client = postgres(inject("appDatabaseUrl"), { max: 2, onnotice: () => {} });
  const db = drizzle(client);
  return { client, db, ...createTransactionRunners(db) };
}

/** Cria um usuário em auth.users (no Supabase quem faz isso é o Auth). */
export async function createAuthUser(client: postgres.Sql): Promise<UserId> {
  const id = toUserId(randomUUID());
  await client.begin(async (tx) => {
    await tx.unsafe("set local role service_role");
    await tx`insert into auth.users (id, email) values (${id}, ${`${id}@example.com`})`;
  });
  return id;
}
