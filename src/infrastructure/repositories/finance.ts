import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { limitUsage, openInvoiceTotal } from "@/domain/cards/open-invoice";
import { addDays, localDate } from "@/domain/dates";
import { add, cents, ZERO, type Cents } from "@/domain/money";
import { withUser, type UserId } from "@/infrastructure/db/client";
import {
  account,
  consent,
  creditCard,
  creditCardInvoice,
  institution,
  investment,
  ofConnection,
  syncRun,
  transaction,
} from "@/infrastructure/db/schema";

const activeConnection = isNull(ofConnection.deletedAt);

export type ConnectionView = {
  id: string;
  institutionName: string | null;
  status: (typeof ofConnection.$inferSelect)["status"];
  statusDetail: string | null;
  lastSyncedAt: Date | null;
  consentExpiresAt: Date | null;
  accounts: number;
};

export async function listConnections(userId: UserId): Promise<ConnectionView[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: ofConnection.id,
        institutionName: institution.name,
        status: ofConnection.status,
        statusDetail: ofConnection.statusDetail,
        lastSyncedAt: ofConnection.lastSyncedAt,
        consentExpiresAt: consent.expiresAt,
        accounts: sql<number>`(select count(*)::int from ${account} a
                               where a.connection_id = ${ofConnection.id} and a.deleted_at is null)`,
      })
      .from(ofConnection)
      .leftJoin(institution, eq(institution.id, ofConnection.institutionId))
      .leftJoin(consent, eq(consent.connectionId, ofConnection.id))
      .where(and(eq(ofConnection.userId, userId), activeConnection))
      .orderBy(ofConnection.createdAt);
    return rows;
  });
}

export type SyncRunView = {
  status: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  stats: Record<string, number>;
};

export async function recentSyncRuns(userId: UserId, limit = 5): Promise<SyncRunView[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        status: syncRun.status,
        trigger: syncRun.trigger,
        startedAt: syncRun.startedAt,
        finishedAt: syncRun.finishedAt,
        stats: syncRun.stats,
      })
      .from(syncRun)
      .where(eq(syncRun.userId, userId))
      .orderBy(desc(syncRun.startedAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, stats: (row.stats ?? {}) as Record<string, number> }));
  });
}

/** Última sincronização iniciada há menos de `seconds` (para limitar o botão "Atualizar agora"). */
export async function hasRecentSync(userId: UserId, seconds: number): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({ id: syncRun.id })
      .from(syncRun)
      .where(
        and(
          eq(syncRun.userId, userId),
          gt(syncRun.startedAt, sql`now() - make_interval(secs => ${seconds})`),
        ),
      )
      .limit(1);
    return Boolean(row);
  });
}

export type AccountView = {
  id: string;
  name: string;
  type: (typeof account.$inferSelect)["type"];
  numberMasked: string | null;
  balanceCents: Cents;
  balanceAt: Date | null;
  includeInTotals: boolean;
  institutionName: string | null;
};

export type InvestmentView = {
  id: string;
  name: string;
  subtype: string | null;
  balanceCents: Cents;
  amountInvestedCents: Cents | null;
  rateDescription: string | null;
  balanceAt: Date | null;
  institutionName: string | null;
};

export type AccountsOverview = {
  accounts: AccountView[];
  investments: InvestmentView[];
  totalAccountsCents: Cents;
  totalInvestmentsCents: Cents;
};

export async function getAccountsOverview(userId: UserId): Promise<AccountsOverview> {
  return withUser(userId, async (tx) => {
    const accountRows = await tx
      .select({
        id: account.id,
        name: account.name,
        type: account.type,
        numberMasked: account.numberMasked,
        balanceCents: account.balanceCents,
        balanceAt: account.balanceAt,
        includeInTotals: account.includeInTotals,
        institutionName: institution.name,
      })
      .from(account)
      .innerJoin(ofConnection, eq(ofConnection.id, account.connectionId))
      .leftJoin(institution, eq(institution.id, ofConnection.institutionId))
      .where(
        and(
          eq(account.userId, userId),
          isNull(account.deletedAt),
          activeConnection,
          ne(account.type, "credit_card"),
        ),
      )
      .orderBy(institution.name, account.name);

    const investmentRows = await tx
      .select({
        id: investment.id,
        name: investment.name,
        subtype: investment.subtype,
        balanceCents: investment.balanceCents,
        amountInvestedCents: investment.amountInvestedCents,
        rateDescription: investment.rateDescription,
        balanceAt: investment.balanceAt,
        institutionName: institution.name,
      })
      .from(investment)
      .innerJoin(ofConnection, eq(ofConnection.id, investment.connectionId))
      .leftJoin(institution, eq(institution.id, ofConnection.institutionId))
      .where(and(eq(investment.userId, userId), isNull(investment.deletedAt), activeConnection))
      .orderBy(desc(investment.balanceCents));

    const accounts = accountRows.map((row) => ({ ...row, balanceCents: cents(row.balanceCents) }));
    const investments = investmentRows.map((row) => ({
      ...row,
      balanceCents: cents(row.balanceCents),
      amountInvestedCents: row.amountInvestedCents === null ? null : cents(row.amountInvestedCents),
    }));

    return {
      accounts,
      investments,
      totalAccountsCents: add(
        ZERO,
        ...accounts.filter((row) => row.includeInTotals).map((row) => row.balanceCents),
      ),
      totalInvestmentsCents: add(ZERO, ...investments.map((row) => row.balanceCents)),
    };
  });
}

export type InvoiceView = {
  referenceMonth: string;
  dueDate: string | null;
  totalCents: Cents | null;
};

export type CardView = {
  id: string;
  name: string;
  numberMasked: string | null;
  institutionName: string | null;
  brand: string | null;
  creditLimitCents: Cents | null;
  availableLimitCents: Cents | null;
  usedPercent: number | null;
  closingDay: number | null;
  dueDay: number | null;
  /** Calculada pelas compras desde o último fechamento. */
  openInvoiceCents: Cents;
  closedInvoices: InvoiceView[];
};

export async function getCards(userId: UserId): Promise<CardView[]> {
  return withUser(userId, async (tx) => {
    const cards = await tx
      .select({
        id: account.id,
        name: account.name,
        numberMasked: account.numberMasked,
        institutionName: institution.name,
        brand: creditCard.brand,
        creditLimitCents: creditCard.creditLimitCents,
        availableLimitCents: creditCard.availableLimitCents,
        closingDay: creditCard.closingDay,
        dueDay: creditCard.dueDay,
      })
      .from(account)
      .innerJoin(ofConnection, eq(ofConnection.id, account.connectionId))
      .leftJoin(institution, eq(institution.id, ofConnection.institutionId))
      .leftJoin(creditCard, eq(creditCard.accountId, account.id))
      .where(
        and(
          eq(account.userId, userId),
          eq(account.type, "credit_card"),
          isNull(account.deletedAt),
          activeConnection,
        ),
      )
      .orderBy(account.name);
    if (cards.length === 0) return [];

    const ids = cards.map((card) => card.id);
    const invoices = await tx
      .select({
        accountId: creditCardInvoice.accountId,
        referenceMonth: creditCardInvoice.referenceMonth,
        closeDate: creditCardInvoice.closeDate,
        dueDate: creditCardInvoice.dueDate,
        totalCents: creditCardInvoice.totalCents,
      })
      .from(creditCardInvoice)
      .where(and(inArray(creditCardInvoice.accountId, ids), eq(creditCardInvoice.isOpen, false)))
      .orderBy(desc(creditCardInvoice.referenceMonth));

    // Só as transações desde a fatura fechada mais recente de cada cartão (ou 60 dias sem fatura).
    const openTransactions = await tx
      .select({
        accountId: transaction.accountId,
        date: transaction.date,
        amountCents: transaction.amountCents,
        direction: transaction.direction,
        description: transaction.descriptionRaw,
        invoiceId: transaction.invoiceId,
        status: transaction.status,
      })
      .from(transaction)
      .where(
        and(
          inArray(transaction.accountId, ids),
          isNull(transaction.invoiceId),
          ne(transaction.status, "removed"),
          gt(transaction.date, sql`current_date - 60`),
        ),
      );

    return cards.map((card) => {
      const own = invoices.filter((invoice) => invoice.accountId === card.id);
      // Sem data de fechamento, estima 7 dias antes do vencimento (comum nos bancos). [Validar]
      const latest = own[0];
      const lastClose = latest
        ? latest.closeDate
          ? localDate(latest.closeDate)
          : latest.dueDate
            ? addDays(localDate(latest.dueDate), -7)
            : null
        : null;
      const limit = card.creditLimitCents === null ? null : cents(card.creditLimitCents);
      const available = card.availableLimitCents === null ? null : cents(card.availableLimitCents);
      return {
        id: card.id,
        name: card.name,
        numberMasked: card.numberMasked,
        institutionName: card.institutionName,
        brand: card.brand,
        creditLimitCents: limit,
        availableLimitCents: available,
        usedPercent: limitUsage(limit, available),
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        openInvoiceCents: openInvoiceTotal(
          openTransactions
            .filter((row) => row.accountId === card.id)
            .map((row) => ({
              ...row,
              date: localDate(row.date),
              amountCents: cents(row.amountCents),
            })),
          lastClose,
        ),
        closedInvoices: own.slice(0, 6).map((invoice) => ({
          referenceMonth: invoice.referenceMonth,
          dueDate: invoice.dueDate,
          totalCents: invoice.totalCents === null ? null : cents(invoice.totalCents),
        })),
      };
    });
  });
}
