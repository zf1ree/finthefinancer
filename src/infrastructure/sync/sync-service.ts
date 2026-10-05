import { and, between, eq, gt, isNull, notInArray, sql, type Column } from "drizzle-orm";
import {
  dedupeInvoicesByMonth,
  mapAccount,
  mapBill,
  mapCreditCard,
  mapInvestment,
  mapTransaction,
  syncWindow,
  type TransactionRow,
} from "@/application/sync/mapping";
import {
  ProviderError,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderBill,
  type ProviderInstitution,
  type ProviderInvestment,
  type ProviderItem,
  type ProviderTransaction,
} from "@/application/sync/provider";
import { DEFAULT_TIME_ZONE, localDate, today, type DateRange } from "@/domain/dates";
import type { Tx, UserId } from "@/infrastructure/db/scoped";
import {
  account,
  auditLog,
  consent,
  creditCard,
  creditCardInvoice,
  institution,
  investment,
  investmentSnapshot,
  ofConnection,
  syncRun,
  transaction,
} from "@/infrastructure/db/schema";
import { logger } from "@/infrastructure/observability/logger";

export type SyncTrigger = "cron" | "manual" | "initial";

export type SyncStats = {
  connections: number;
  failedConnections: number;
  accounts: number;
  transactionsNew: number;
  transactionsUpdated: number;
  transactionsRemoved: number;
  invoices: number;
  investments: number;
};

export type SyncResult = {
  status: "ok" | "partial" | "failed" | "skipped";
  stats: SyncStats;
};

type Runners = {
  withUser<T>(userId: UserId, fn: (tx: Tx) => Promise<T>): Promise<T>;
  withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
};

type Deps = {
  runners: Runners;
  provider: OpenFinanceProvider;
  now?: () => Date;
  timeZone?: string;
};

/** Uma sincronização "running" mais nova que isto bloqueia outra (evita duas ao mesmo tempo). */
const RUNNING_GUARD_MINUTES = 10;
const CHUNK = 500;

type FetchedAccount = {
  account: ProviderAccount;
  transactions: ProviderTransaction[];
  bills: ProviderBill[];
};

type Fetched = {
  item: ProviderItem;
  window: DateRange;
  accounts: FetchedAccount[];
  investments: ProviderInvestment[];
};

type ConnectionRow = {
  id: string;
  externalItemId: string;
  txCursorDate: string | null;
};

/** `excluded.coluna` no ON CONFLICT DO UPDATE. */
function excluded(column: Column) {
  return sql.raw(`excluded.${column.name}`);
}

function emptyStats(): SyncStats {
  return {
    connections: 0,
    failedConnections: 0,
    accounts: 0,
    transactionsNew: 0,
    transactionsUpdated: 0,
    transactionsRemoved: 0,
    invoices: 0,
    investments: 0,
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export function errorCode(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  return "internal";
}

export function createSyncService({
  runners,
  provider,
  now = () => new Date(),
  timeZone = DEFAULT_TIME_ZONE,
}: Deps) {
  const { withUser, withSystem } = runners;

  async function fetchConnection(connection: ConnectionRow): Promise<Fetched | null> {
    const item = await provider.getItem(connection.externalItemId);
    if (!item) return null;
    const window = syncWindow(
      connection.txCursorDate ? localDate(connection.txCursorDate) : null,
      today(now(), timeZone),
    );
    const accounts: FetchedAccount[] = [];
    for (const providerAccount of await provider.listAccounts(item.externalId)) {
      // Em sequência: o plano gratuito do Pluggy e o limite de 5 min da Vercel pedem calma, não pressa.
      const transactions = await provider.listTransactions(providerAccount.externalId, window);
      const bills =
        providerAccount.kind === "credit_card"
          ? await provider.listBills(providerAccount.externalId)
          : [];
      accounts.push({ account: providerAccount, transactions, bills });
    }
    const investments = await provider.listInvestments(item.externalId);
    return { item, window, accounts, investments };
  }

  /** Catálogo global de bancos: escrito pelo servidor, lido por todos. Sem dado de usuário. */
  async function upsertInstitution(value: ProviderInstitution): Promise<string> {
    return withSystem(async (tx) => {
      const [row] = await tx
        .insert(institution)
        .values({
          provider: "pluggy",
          externalId: value.externalId,
          name: value.name.slice(0, 120),
          logoUrl: value.logoUrl,
          primaryColor: value.primaryColor,
        })
        .onConflictDoUpdate({
          target: [institution.provider, institution.externalId],
          set: {
            name: excluded(institution.name),
            logoUrl: excluded(institution.logoUrl),
            primaryColor: excluded(institution.primaryColor),
          },
        })
        .returning({ id: institution.id });
      if (!row) throw new Error("institution upsert sem retorno");
      return row.id;
    });
  }

  async function writeConnection(
    tx: Tx,
    userId: UserId,
    connection: ConnectionRow,
    data: Fetched,
    institutionId: string | null,
    stats: SyncStats,
  ): Promise<void> {
    const syncedAt = now();
    const day = today(syncedAt, timeZone);

    await tx
      .update(ofConnection)
      .set({
        status: data.item.status,
        statusDetail: data.item.statusDetail,
        institutionId,
        lastProviderUpdateAt: data.item.lastUpdatedAt,
        lastSyncedAt: syncedAt,
        txCursorDate: day,
      })
      .where(eq(ofConnection.id, connection.id));

    if (data.item.consentExpiresAt) {
      await tx
        .insert(consent)
        .values({ userId, connectionId: connection.id, expiresAt: data.item.consentExpiresAt })
        .onConflictDoUpdate({
          target: consent.connectionId,
          set: { expiresAt: excluded(consent.expiresAt) },
        });
    }

    for (const fetched of data.accounts) {
      const row = mapAccount(fetched.account);
      const [saved] = await tx
        .insert(account)
        .values({ ...row, userId, connectionId: connection.id, balanceAt: syncedAt })
        .onConflictDoUpdate({
          target: [account.connectionId, account.externalId],
          set: {
            type: excluded(account.type),
            numberMasked: excluded(account.numberMasked),
            currency: excluded(account.currency),
            balanceCents: excluded(account.balanceCents),
            balanceAt: excluded(account.balanceAt),
            deletedAt: null,
            // o nome pode ter sido renomeado pelo usuário: não sobrescrever
          },
        })
        .returning({ id: account.id });
      if (!saved) throw new Error("account upsert sem retorno");
      stats.accounts++;

      const card = mapCreditCard(fetched.account, timeZone);
      if (card) {
        await tx
          .insert(creditCard)
          .values({ ...card, accountId: saved.id, userId })
          .onConflictDoUpdate({
            target: creditCard.accountId,
            set: {
              brand: excluded(creditCard.brand),
              creditLimitCents: excluded(creditCard.creditLimitCents),
              availableLimitCents: excluded(creditCard.availableLimitCents),
              dueDay: sql`coalesce(excluded.due_day, ${creditCard.dueDay})`,
              // dia de fechamento informado pelo usuário vence o do provedor
              closingDay: sql`case when ${creditCard.closingDaySource} = 'user' then ${creditCard.closingDay} else coalesce(excluded.closing_day, ${creditCard.closingDay}) end`,
              closingDaySource: sql`case when ${creditCard.closingDaySource} = 'user' then 'user' else coalesce(excluded.closing_day_source, ${creditCard.closingDaySource}) end`,
              updatedAt: syncedAt,
            },
          });
      }

      const invoiceIds = new Map<string, string>();
      const invoices = dedupeInvoicesByMonth(fetched.bills.map((bill) => mapBill(bill, timeZone)));
      if (invoices.length > 0) {
        const savedInvoices = await tx
          .insert(creditCardInvoice)
          .values(
            invoices.map((invoice) => ({ ...invoice, userId, accountId: saved.id, isOpen: false })),
          )
          .onConflictDoUpdate({
            target: [creditCardInvoice.accountId, creditCardInvoice.referenceMonth],
            set: {
              externalId: excluded(creditCardInvoice.externalId),
              closeDate: excluded(creditCardInvoice.closeDate),
              dueDate: excluded(creditCardInvoice.dueDate),
              totalCents: excluded(creditCardInvoice.totalCents),
              minimumCents: excluded(creditCardInvoice.minimumCents),
              isOpen: false,
            },
          })
          .returning({ id: creditCardInvoice.id, externalId: creditCardInvoice.externalId });
        for (const invoice of savedInvoices) {
          if (invoice.externalId) invoiceIds.set(invoice.externalId, invoice.id);
        }
        stats.invoices += savedInvoices.length;
      }

      const rows = fetched.transactions
        .map((providerTx) => mapTransaction(fetched.account.kind, providerTx, timeZone))
        .filter((value): value is TransactionRow => value !== null);
      // O provedor pode repetir um id entre páginas; o último vence.
      const unique = [...new Map(rows.map((value) => [value.externalId, value])).values()];

      for (const batch of chunks(unique, CHUNK)) {
        const result = await tx
          .insert(transaction)
          .values(
            batch.map(({ billExternalId, ...value }) => ({
              ...value,
              userId,
              accountId: saved.id,
              invoiceId: billExternalId ? (invoiceIds.get(billExternalId) ?? null) : null,
            })),
          )
          .onConflictDoUpdate({
            target: [transaction.accountId, transaction.externalId],
            // Categoria, nota, tipo e "oculta" são do usuário: a sincronização não mexe.
            set: {
              date: excluded(transaction.date),
              amountCents: excluded(transaction.amountCents),
              direction: excluded(transaction.direction),
              currency: excluded(transaction.currency),
              status: excluded(transaction.status),
              descriptionRaw: excluded(transaction.descriptionRaw),
              merchantNameRaw: excluded(transaction.merchantNameRaw),
              merchantCnpj: excluded(transaction.merchantCnpj),
              merchantKey: excluded(transaction.merchantKey),
              paymentMethod: excluded(transaction.paymentMethod),
              installmentNumber: excluded(transaction.installmentNumber),
              installmentTotal: excluded(transaction.installmentTotal),
              invoiceId: sql`coalesce(excluded.invoice_id, ${transaction.invoiceId})`,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        for (const { inserted } of result) {
          if (inserted) stats.transactionsNew++;
          else stats.transactionsUpdated++;
        }
      }

      // Pendente que sumiu do provedor dentro da janela: foi cancelada ou virou outra transação.
      const seen = unique.map((value) => value.externalId);
      const removed = await tx
        .update(transaction)
        .set({ status: "removed" })
        .where(
          and(
            eq(transaction.accountId, saved.id),
            eq(transaction.status, "pending"),
            between(transaction.date, data.window.from, data.window.to),
            seen.length > 0 ? notInArray(transaction.externalId, seen) : undefined,
          ),
        )
        .returning({ id: transaction.id });
      stats.transactionsRemoved += removed.length;
    }

    for (const providerInvestment of data.investments) {
      const row = mapInvestment(providerInvestment);
      const { active, ...values } = row;
      const [saved] = await tx
        .insert(investment)
        .values({
          ...values,
          userId,
          connectionId: connection.id,
          balanceAt: syncedAt,
          deletedAt: active ? null : syncedAt,
        })
        .onConflictDoUpdate({
          target: [investment.connectionId, investment.externalId],
          set: {
            type: excluded(investment.type),
            subtype: excluded(investment.subtype),
            balanceCents: excluded(investment.balanceCents),
            amountInvestedCents: excluded(investment.amountInvestedCents),
            rateDescription: excluded(investment.rateDescription),
            balanceAt: excluded(investment.balanceAt),
            deletedAt: excluded(investment.deletedAt),
          },
        })
        .returning({ id: investment.id });
      if (!saved) throw new Error("investment upsert sem retorno");
      await tx
        .insert(investmentSnapshot)
        .values({ investmentId: saved.id, userId, day, balanceCents: row.balanceCents })
        .onConflictDoUpdate({
          target: [investmentSnapshot.investmentId, investmentSnapshot.day],
          set: { balanceCents: excluded(investmentSnapshot.balanceCents) },
        });
      if (active) stats.investments++;
    }
  }

  /**
   * Sincroniza todas as conexões ativas do usuário (ou só uma). Busca tudo no provedor primeiro
   * e grava cada conexão numa transação: se algo falhar no meio, nada pela metade fica salvo.
   * Mesmo vindo do cron, grava como o próprio usuário (RLS continua valendo).
   */
  async function syncUser(
    userId: UserId,
    trigger: SyncTrigger,
    options: { connectionId?: string } = {},
  ): Promise<SyncResult> {
    const stats = emptyStats();

    const start = await withUser(userId, async (tx) => {
      const [running] = await tx
        .select({ id: syncRun.id })
        .from(syncRun)
        .where(
          and(
            eq(syncRun.userId, userId),
            eq(syncRun.status, "running"),
            gt(syncRun.startedAt, sql`now() - make_interval(mins => ${RUNNING_GUARD_MINUTES})`),
          ),
        )
        .limit(1);
      if (running) return null;
      const [run] = await tx
        .insert(syncRun)
        .values({ userId, trigger, status: "running", step: "fetch" })
        .returning({ id: syncRun.id });
      const connections = await tx
        .select({
          id: ofConnection.id,
          externalItemId: ofConnection.externalItemId,
          txCursorDate: ofConnection.txCursorDate,
        })
        .from(ofConnection)
        .where(
          and(
            eq(ofConnection.userId, userId),
            isNull(ofConnection.deletedAt),
            options.connectionId ? eq(ofConnection.id, options.connectionId) : undefined,
          ),
        );
      return run ? { runId: run.id, connections } : null;
    });

    if (!start) return { status: "skipped", stats };

    let status: SyncResult["status"] = "failed";
    let failure: string | null = null;
    try {
      for (const connection of start.connections) {
        stats.connections++;
        try {
          const data = await fetchConnection(connection);
          if (!data) {
            stats.failedConnections++;
            await withUser(userId, (tx) =>
              tx
                .update(ofConnection)
                .set({ status: "revoked", statusDetail: "item_not_found" })
                .where(eq(ofConnection.id, connection.id)),
            );
            continue;
          }
          const institutionId = data.item.institution
            ? await upsertInstitution(data.item.institution)
            : null;
          await withUser(userId, (tx) =>
            writeConnection(tx, userId, connection, data, institutionId, stats),
          );
        } catch (error) {
          stats.failedConnections++;
          const code = errorCode(error);
          logger.error("sync.connection_failed", { connectionId: connection.id, code, error });
          await withUser(userId, (tx) =>
            tx
              .update(ofConnection)
              .set({ statusDetail: `sync_${code}`.slice(0, 60) })
              .where(eq(ofConnection.id, connection.id)),
          );
        }
      }
      status =
        stats.failedConnections === 0
          ? "ok"
          : stats.failedConnections < stats.connections
            ? "partial"
            : "failed";
    } catch (error) {
      failure = errorCode(error);
      logger.error("sync.failed", { runId: start.runId, error });
      throw error;
    } finally {
      await withUser(userId, async (tx) => {
        await tx
          .update(syncRun)
          .set({
            status,
            step: null,
            stats,
            errorCode: failure ?? (status === "ok" ? null : "connection_errors"),
            finishedAt: now(),
          })
          .where(eq(syncRun.id, start.runId));
        await tx.insert(auditLog).values({
          userId,
          actor: trigger === "cron" ? "system" : "user",
          action: "sync.completed",
          targetType: "sync_run",
          targetId: start.runId,
          metadata: { status, trigger, ...stats },
        });
      });
      logger.info("sync.finished", { runId: start.runId, status, ...stats });
    }

    return { status, stats };
  }

  /** Para o cron: quem tem alguma conexão ativa. Só lê ids. */
  async function usersWithConnections(): Promise<UserId[]> {
    const rows = await withSystem((tx) =>
      tx
        .selectDistinct({ userId: ofConnection.userId })
        .from(ofConnection)
        .where(isNull(ofConnection.deletedAt)),
    );
    return rows.map((row) => row.userId as UserId);
  }

  return {
    syncUser,
    usersWithConnections,
    fetchItem: (id: string) => provider.getItem(id),
    upsertInstitution,
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
