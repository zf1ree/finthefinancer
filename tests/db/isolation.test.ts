import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserId } from "@/infrastructure/db/scoped";
import { connect, createAuthUser } from "./helpers";
import { seedUserGraph, type SeededIds } from "./seed";

/**
 * Regra mais importante do projeto: o usuário A nunca enxerga nem altera dados do usuário B.
 */
const { client, withUser, withSystem } = connect();

let userA: UserId;
let userB: UserId;
let idsB: SeededIds;

const USER_TABLES = [
  "user_profile",
  "of_connection",
  "consent",
  "account",
  "credit_card",
  "credit_card_invoice",
  "categorization_rule",
  "transaction",
  "investment",
  "investment_snapshot",
  "budget",
  "budget_line",
  "reserve",
  "spending_plan",
  "spending_plan_allocation",
  "financial_insight",
  "ai_conversation",
  "ai_message",
  "ai_pending_action",
  "sync_run",
  "audit_log",
] as const;

beforeAll(async () => {
  userA = await createAuthUser(client);
  userB = await createAuthUser(client);
  await withUser(userA, (tx) => seedUserGraph(tx, userA, "a"));
  idsB = await withUser(userB, (tx) => seedUserGraph(tx, userB, "b"));
});

afterAll(async () => {
  await client.end();
});

async function expectDenied(promise: Promise<unknown>) {
  await expect(promise).rejects.toThrow();
}

describe("isolamento entre usuários (RLS)", () => {
  it.each(USER_TABLES)("A só lê as próprias linhas em %s", async (table) => {
    const rows = await withUser(userA, (tx) =>
      tx.execute<{ user_id: string }>(sql.raw(`select user_id::text from public.${table}`)),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.user_id === userA)).toBe(true);
  });

  it("A vê as categorias do sistema e as próprias, nunca as de B", async () => {
    const owners = await withUser(userA, (tx) =>
      tx.execute<{ user_id: string | null }>(sql`select distinct user_id::text from category`),
    );
    const ownerIds = owners.map((row) => row.user_id);
    expect(ownerIds).toContain(null);
    expect(ownerIds).toContain(userA);
    expect(ownerIds).not.toContain(userB);
  });

  it("A não consegue alterar nem apagar linhas de B", async () => {
    await withUser(userA, async (tx) => {
      const updated = await tx.execute(
        sql`update transaction set note = 'invadido' where id = ${idsB.transaction} returning id`,
      );
      expect(updated.length).toBe(0);
      const deleted = await tx.execute(
        sql`delete from account where id = ${idsB.account} returning id`,
      );
      expect(deleted.length).toBe(0);
    });
    const note = await withUser(userB, (tx) =>
      tx.execute<{ note: string | null }>(
        sql`select note from transaction where id = ${idsB.transaction}`,
      ),
    );
    expect(note[0]?.note).toBeNull();
  });

  it("A não consegue inserir linhas em nome de B", async () => {
    await expectDenied(
      withUser(userA, (tx) =>
        tx.execute(sql`insert into ai_conversation (user_id, title) values (${userB}, 'x')`),
      ),
    );
  });

  it("A não consegue apontar para a conta de B, mesmo sabendo o id", async () => {
    await expectDenied(
      withUser(userA, (tx) =>
        tx.execute(sql`insert into transaction (user_id, account_id, external_id, date, amount_cents, direction, description_raw)
                       values (${userA}, ${idsB.account}, 'x', '2026-10-01', 100, 'out', 'x')`),
      ),
    );
  });

  it("A não consegue vincular reserva à caixinha de B", async () => {
    await expectDenied(
      withUser(userA, (tx) =>
        tx.execute(sql`insert into reserve (user_id, name, kind, investment_id, created_by)
                       values (${userA}, 'x', 'travel', ${idsB.investment}, 'user')`),
      ),
    );
  });

  it("A não consegue usar a categoria própria de B", async () => {
    await expectDenied(
      withUser(userA, (tx) =>
        tx.execute(sql`insert into categorization_rule (user_id, match_type, match_value, category_id)
                       values (${userA}, 'merchant_exact', 'uber', ${idsB.category})`),
      ),
    );
  });

  it("audit_log não pode ser alterado nem apagado pelo usuário", async () => {
    await expectDenied(
      withUser(userA, (tx) => tx.execute(sql`update audit_log set action = 'x.y'`)),
    );
    await expectDenied(withUser(userA, (tx) => tx.execute(sql`delete from audit_log`)));
  });

  it("sem usuário na sessão, nada aparece", async () => {
    const rows = await client.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      return tx`select count(*)::int as n from transaction`;
    });
    expect(rows[0]?.n).toBe(0);
  });

  it("anon não tem acesso a nenhuma tabela", async () => {
    await expect(
      client.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        return tx`select 1 from transaction limit 1`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("service_role (cron) enxerga todos os usuários", async () => {
    const rows = await withSystem((tx) =>
      tx.execute<{ n: number }>(sql`select count(distinct user_id)::int as n from transaction`),
    );
    expect(rows[0]?.n).toBeGreaterThanOrEqual(2);
  });

  it("apagar o usuário apaga todos os dados dele (exclusão de conta)", async () => {
    const temp = await createAuthUser(client);
    await withUser(temp, (tx) => seedUserGraph(tx, temp, "tmp"));
    await client.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      await tx`delete from auth.users where id = ${temp}`;
    });
    for (const table of USER_TABLES) {
      const rows = await withSystem((tx) =>
        tx.execute<{ n: number }>(
          sql.raw(`select count(*)::int as n from public.${table} where user_id = '${temp}'`),
        ),
      );
      expect(rows[0]?.n, table).toBe(0);
    }
  });
});
