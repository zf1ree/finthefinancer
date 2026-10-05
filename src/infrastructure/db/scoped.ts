import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

export type Db = PostgresJsDatabase;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type UserId = string & { readonly __brand: "UserId" };

const uuidSchema = z.uuid();

export function toUserId(value: string): UserId {
  return uuidSchema.parse(value) as UserId;
}

/**
 * Cria os executores de transação com escopo de segurança.
 * Fica separado do client para os testes de banco usarem a mesma lógica com outra conexão.
 */
export function createTransactionRunners(db: Db) {
  return {
    async withUser<T>(userId: UserId, fn: (tx: Tx) => Promise<T>): Promise<T> {
      const id = toUserId(userId);
      const claims = JSON.stringify({ sub: id, role: "authenticated" });
      return db.transaction(async (tx) => {
        // set_config(..., true) e SET LOCAL valem só até o fim desta transação.
        await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
        await tx.execute(sql`set local role authenticated`);
        return fn(tx);
      });
    },

    async withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`set local role service_role`);
        return fn(tx);
      });
    },
  };
}
