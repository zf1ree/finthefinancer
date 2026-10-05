import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  OpenFinanceProvider,
  ProviderAccount,
  ProviderBill,
  ProviderInvestment,
  ProviderItem,
  ProviderTransaction,
} from "@/application/sync/provider";
import type { DateRange } from "@/domain/dates";
import type { UserId } from "@/infrastructure/db/scoped";
import { createSyncService } from "@/infrastructure/sync/sync-service";
import { connect, createAuthUser } from "./helpers";

/** Provedor falso com estado mutável, para simular o banco mudando entre sincronizações. */
class FakeProvider implements OpenFinanceProvider {
  items = new Map<string, ProviderItem>();
  accounts = new Map<string, ProviderAccount[]>();
  transactions = new Map<string, ProviderTransaction[]>();
  bills = new Map<string, ProviderBill[]>();
  investments = new Map<string, ProviderInvestment[]>();
  ranges: DateRange[] = [];
  failOn: string | null = null;

  async getItem(itemId: string) {
    return this.items.get(itemId) ?? null;
  }
  async listAccounts(itemId: string) {
    return this.accounts.get(itemId) ?? [];
  }
  async listTransactions(accountId: string, range: DateRange) {
    if (this.failOn === accountId) throw new Error("falha simulada");
    this.ranges.push(range);
    return this.transactions.get(accountId) ?? [];
  }
  async listBills(accountId: string) {
    return this.bills.get(accountId) ?? [];
  }
  async listInvestments(itemId: string) {
    return this.investments.get(itemId) ?? [];
  }
}

function tx(
  id: string,
  amount: number,
  extra: Partial<ProviderTransaction> = {},
): ProviderTransaction {
  return {
    externalId: id,
    date: new Date("2026-10-03T03:00:00Z"),
    description: `COMPRA ${id}`,
    amount,
    currency: "BRL",
    status: "posted",
    merchantName: null,
    merchantCnpj: null,
    paymentMethod: null,
    installmentNumber: null,
    installmentTotal: null,
    billExternalId: null,
    ...extra,
  };
}

const { client, withUser, withSystem } = connect();
let clock = new Date("2026-10-05T12:00:00Z");
const provider = new FakeProvider();
const service = createSyncService({
  runners: { withUser, withSystem },
  provider,
  now: () => clock,
});

let user: UserId;
let other: UserId;
let connectionId: string;

async function count(table: string, where = "true"): Promise<number> {
  const rows = await withSystem((t) =>
    t.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from public.${table} where ${where}`),
    ),
  );
  return rows[0]?.n ?? 0;
}

function seedProvider(itemId: string) {
  provider.items.set(itemId, {
    externalId: itemId,
    institution: { externalId: "212", name: "Nubank", logoUrl: null, primaryColor: "820AD1" },
    status: "active",
    statusDetail: null,
    lastUpdatedAt: new Date("2026-10-05T10:00:00Z"),
    consentExpiresAt: new Date("2027-10-01T00:00:00Z"),
  });
  provider.accounts.set(itemId, [
    {
      externalId: `${itemId}-checking`,
      kind: "checking",
      name: "Conta",
      number: "12345-6",
      balance: 1520.33,
      currency: "BRL",
      credit: null,
    },
    {
      externalId: `${itemId}-card`,
      kind: "credit_card",
      name: "Cartão",
      number: "4321",
      balance: 2180,
      currency: "BRL",
      credit: {
        brand: "MASTERCARD",
        limit: 5000,
        available: 2820,
        closeDate: new Date("2026-10-25T12:00:00Z"),
        dueDate: new Date("2026-11-01T12:00:00Z"),
      },
    },
  ]);
  provider.transactions.set(`${itemId}-checking`, [
    tx("c1", -120.5),
    tx("c2", 6000),
    tx("c3", -30, { status: "pending" }),
  ]);
  provider.transactions.set(`${itemId}-card`, [
    tx("k1", 45.9, { billExternalId: "bill-sep" }),
    tx("k2", 300, { installmentNumber: 1, installmentTotal: 3 }),
    tx("k0", 0),
  ]);
  provider.bills.set(`${itemId}-card`, [
    {
      externalId: "bill-sep",
      dueDate: new Date("2026-10-01T12:00:00Z"),
      closeDate: new Date("2026-09-24T12:00:00Z"),
      total: 2180,
      minimum: 327,
    },
  ]);
  provider.investments.set(itemId, [
    {
      externalId: "inv-viagem",
      name: "Viagem",
      type: "FIXED_INCOME",
      subtype: "CDB",
      balance: 7400.12,
      amountOriginal: 7000,
      rateDescription: "100% do CDI",
      active: true,
      date: null,
    },
  ]);
}

beforeAll(async () => {
  user = await createAuthUser(client);
  other = await createAuthUser(client);
  seedProvider("item-a");
  seedProvider("item-b");
  const [row] = await withUser(user, (t) =>
    t.execute<{ id: string }>(
      sql`insert into of_connection (user_id, external_item_id) values (${user}, 'item-a') returning id`,
    ),
  );
  connectionId = row!.id;
  await withUser(other, (t) =>
    t.execute(
      sql`insert into of_connection (user_id, external_item_id) values (${other}, 'item-b')`,
    ),
  );
});

beforeEach(() => {
  clock = new Date("2026-10-05T12:00:00Z");
  provider.failOn = null;
});

afterAll(async () => {
  await client.end();
});

describe("sincronização", () => {
  it("primeira vez: grava contas, cartão, fatura, transações e caixinhas", async () => {
    const result = await service.syncUser(user, "initial");
    expect(result.status).toBe("ok");
    expect(result.stats).toMatchObject({
      connections: 1,
      accounts: 2,
      transactionsNew: 5, // o valor zero é descartado
      transactionsUpdated: 0,
      invoices: 1,
      investments: 1,
    });
    expect(provider.ranges[0]).toEqual({ from: "2025-10-05", to: "2026-10-05" });

    const where = `user_id = '${user}'`;
    expect(await count("account", where)).toBe(2);
    expect(await count("credit_card", where)).toBe(1);
    expect(await count("investment_snapshot", where)).toBe(1);
    expect(await count("consent", where)).toBe(1);

    const [card] = await withUser(user, (t) =>
      t.execute<{ credit_limit_cents: number; available_limit_cents: number; closing_day: number }>(
        sql`select credit_limit_cents::int, available_limit_cents::int, closing_day from credit_card`,
      ),
    );
    expect(card).toEqual({
      credit_limit_cents: 500000,
      available_limit_cents: 282000,
      closing_day: 25,
    });

    const linked = await withUser(user, (t) =>
      t.execute<{ external_id: string; invoice: string | null }>(
        sql`select t.external_id, i.reference_month::text as invoice
            from transaction t left join credit_card_invoice i on i.id = t.invoice_id
            where t.external_id in ('k1','k2') order by t.external_id`,
      ),
    );
    expect(linked).toEqual([
      { external_id: "k1", invoice: "2026-10-01" },
      { external_id: "k2", invoice: null },
    ]);

    const [connection] = await withUser(user, (t) =>
      t.execute<{ status: string; tx_cursor_date: string; institution: string }>(
        sql`select c.status, c.tx_cursor_date::text, i.name as institution
            from of_connection c join institution i on i.id = c.institution_id`,
      ),
    );
    expect(connection).toEqual({
      status: "active",
      tx_cursor_date: "2026-10-05",
      institution: "Nubank",
    });
  });

  it("segunda vez: não duplica, relê 7 dias e respeita o que o usuário mudou", async () => {
    await withUser(user, async (t) => {
      await t.execute(
        sql`update account set name = 'Minha conta' where external_id = 'item-a-checking'`,
      );
      await t.execute(
        sql`update transaction set note = 'jantar', is_hidden = true where external_id = 'c1'`,
      );
      await t.execute(sql`update credit_card set closing_day = 20, closing_day_source = 'user'`);
    });
    clock = new Date("2026-10-06T12:00:00Z");
    provider.ranges = [];
    provider.transactions.set("item-a-checking", [tx("c1", -125), tx("c2", 6000)]); // c3 (pendente) sumiu

    const result = await service.syncUser(user, "cron");
    expect(result.stats).toMatchObject({
      transactionsNew: 0,
      transactionsUpdated: 4,
      transactionsRemoved: 1,
    });
    expect(provider.ranges[0]).toEqual({ from: "2026-09-28", to: "2026-10-06" });
    expect(await count("transaction", `user_id = '${user}'`)).toBe(5);

    const rows = await withUser(user, (t) =>
      t.execute<{
        external_id: string;
        amount_cents: number;
        note: string | null;
        is_hidden: boolean;
        status: string;
      }>(
        sql`select external_id, amount_cents::int, note, is_hidden, status from transaction
            where external_id in ('c1','c3') order by external_id`,
      ),
    );
    expect(rows).toEqual([
      { external_id: "c1", amount_cents: 12500, note: "jantar", is_hidden: true, status: "posted" },
      { external_id: "c3", amount_cents: 3000, note: null, is_hidden: false, status: "removed" },
    ]);
    const [names] = await withUser(user, (t) =>
      t.execute<{ name: string; closing_day: number }>(
        sql`select a.name, c.closing_day from account a, credit_card c where a.external_id = 'item-a-checking'`,
      ),
    );
    expect(names).toEqual({ name: "Minha conta", closing_day: 20 });
    expect(await count("investment_snapshot", `user_id = '${user}'`)).toBe(2);
  });

  it("não mistura usuários: cada um só sincroniza e vê as próprias conexões", async () => {
    await service.syncUser(other, "manual");
    const visible = await withUser(user, (t) =>
      t.execute<{ n: number }>(sql`select count(*)::int as n from account`),
    );
    expect(visible[0]?.n).toBe(2);
    expect(await count("account", `user_id = '${other}'`)).toBe(2);

    const users = await service.usersWithConnections();
    expect(users).toEqual(expect.arrayContaining([user, other]));
  });

  it("não sincroniza a conexão de outro usuário nem pelo id", async () => {
    const result = await service.syncUser(other, "manual", { connectionId });
    expect(result.stats.connections).toBe(0);
  });

  it("falha numa conexão não salva nada pela metade e fica registrada", async () => {
    clock = new Date("2026-10-07T12:00:00Z");
    provider.failOn = "item-a-card";
    provider.transactions.set("item-a-checking", [tx("c1", -125), tx("c2", 6000), tx("c4", -10)]);

    const result = await service.syncUser(user, "manual");
    expect(result.status).toBe("failed");
    expect(await count("transaction", `user_id = '${user}' and external_id = 'c4'`)).toBe(0);

    const [run] = await withUser(user, (t) =>
      t.execute<{ status: string; error_code: string; finished: boolean }>(
        sql`select status, error_code, finished_at is not null as finished from sync_run order by started_at desc limit 1`,
      ),
    );
    expect(run).toEqual({ status: "failed", error_code: "connection_errors", finished: true });
    const [connection] = await withUser(user, (t) =>
      t.execute<{ status_detail: string; tx_cursor_date: string }>(
        sql`select status_detail, tx_cursor_date::text from of_connection`,
      ),
    );
    expect(connection).toEqual({ status_detail: "sync_internal", tx_cursor_date: "2026-10-06" });
  });

  it("não roda duas sincronizações ao mesmo tempo", async () => {
    await withUser(user, (t) =>
      t.execute(
        sql`insert into sync_run (user_id, trigger, status) values (${user}, 'manual', 'running')`,
      ),
    );
    const result = await service.syncUser(user, "manual");
    expect(result.status).toBe("skipped");
    await withSystem((t) => t.execute(sql`delete from sync_run where status = 'running'`));
  });

  it("item removido no Pluggy marca a conexão como revogada", async () => {
    provider.items.delete("item-a");
    const result = await service.syncUser(user, "manual");
    expect(result.status).toBe("failed");
    const [connection] = await withUser(user, (t) =>
      t.execute<{ status: string }>(sql`select status from of_connection`),
    );
    expect(connection?.status).toBe("revoked");
  });

  it("toda sincronização deixa registro na auditoria", async () => {
    expect(
      await count("audit_log", `user_id = '${user}' and action = 'sync.completed'`),
    ).toBeGreaterThanOrEqual(3);
  });
});
