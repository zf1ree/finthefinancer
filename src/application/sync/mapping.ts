import {
  addDays,
  DEFAULT_TIME_ZONE,
  firstDay,
  today,
  yearMonthOf,
  type DateRange,
  type LocalDate,
} from "@/domain/dates";
import { fromDecimal, type Cents } from "@/domain/money";
import { merchantKey } from "@/domain/transactions/merchant-key";
import { normalizeProviderAmount, type Direction } from "@/domain/transactions/normalize-amount";
import type {
  ProviderAccount,
  ProviderBill,
  ProviderInvestment,
  ProviderTransaction,
} from "./provider";

/** Transações pendentes mudam de valor e de data por alguns dias; relemos essa janela. */
export const LOOKBACK_DAYS = 7;
/** Primeira sincronização: 12 meses, o mínimo que as instituições compartilham. */
export const INITIAL_DAYS = 365;

export function syncWindow(cursor: LocalDate | null, now: LocalDate): DateRange {
  const from = cursor === null ? addDays(now, -INITIAL_DAYS) : addDays(cursor, -LOOKBACK_DAYS);
  return { from, to: now };
}

/** Data contábil no fuso do usuário (o Pluggy manda meia-noite de Brasília em UTC). */
export function toLocalDate(value: Date, timeZone: string = DEFAULT_TIME_ZONE): LocalDate {
  return today(value, timeZone);
}

function clean(text: string | null | undefined, max: number): string | null {
  const value = text?.replace(/\s+/g, " ").trim().slice(0, max).trim();
  return value ? value : null;
}

export type AccountRow = {
  externalId: string;
  type: "checking" | "savings" | "credit_card";
  name: string;
  numberMasked: string | null;
  currency: string;
  /** Conta: saldo. Cartão: limite usado (positivo = devendo). */
  balanceCents: Cents;
};

export function mapAccount(account: ProviderAccount): AccountRow {
  const digits = account.number?.replace(/\D/g, "") ?? "";
  return {
    externalId: account.externalId,
    type: account.kind,
    name: clean(account.name, 120) ?? "Conta",
    numberMasked: digits.length >= 4 ? digits.slice(-4) : null,
    currency: account.currency.slice(0, 3).toUpperCase(),
    balanceCents: fromDecimal(account.balance),
  };
}

export type CreditCardRow = {
  brand: string | null;
  creditLimitCents: Cents | null;
  availableLimitCents: Cents | null;
  closingDay: number | null;
  dueDay: number | null;
  closingDaySource: "provider" | null;
};

export function mapCreditCard(account: ProviderAccount, timeZone?: string): CreditCardRow | null {
  const credit = account.credit;
  if (account.kind !== "credit_card" || !credit) return null;
  const day = (value: Date | null) =>
    value ? Number(toLocalDate(value, timeZone).slice(8)) : null;
  const closingDay = day(credit.closeDate);
  return {
    brand: clean(credit.brand, 40),
    creditLimitCents: credit.limit === null ? null : fromDecimal(Math.max(credit.limit, 0)),
    availableLimitCents: credit.available === null ? null : fromDecimal(credit.available),
    closingDay,
    dueDay: day(credit.dueDate),
    closingDaySource: closingDay === null ? null : "provider",
  };
}

export type TransactionRow = {
  externalId: string;
  date: LocalDate;
  amountCents: Cents;
  direction: Direction;
  currency: string;
  status: "pending" | "posted";
  descriptionRaw: string;
  merchantNameRaw: string | null;
  merchantCnpj: string | null;
  merchantKey: string | null;
  paymentMethod: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  billExternalId: string | null;
};

/** null para valor zero (não é movimentação). */
export function mapTransaction(
  accountKind: ProviderAccount["kind"],
  tx: ProviderTransaction,
  timeZone?: string,
): TransactionRow | null {
  const normalized = normalizeProviderAmount(
    accountKind === "credit_card" ? "credit_card" : "bank",
    tx.amount,
  );
  if (!normalized) return null;

  const description = clean(tx.description, 300) ?? "Sem descrição";
  const merchantName = clean(tx.merchantName, 120);
  const cnpj = tx.merchantCnpj?.replace(/\D/g, "") ?? "";
  const installmentsValid =
    tx.installmentNumber !== null &&
    tx.installmentTotal !== null &&
    tx.installmentNumber > 0 &&
    tx.installmentNumber <= tx.installmentTotal &&
    tx.installmentTotal <= 999;

  return {
    externalId: tx.externalId,
    date: toLocalDate(tx.date, timeZone),
    amountCents: normalized.amountCents,
    direction: normalized.direction,
    currency: tx.currency.slice(0, 3).toUpperCase(),
    status: tx.status,
    descriptionRaw: description,
    merchantNameRaw: merchantName,
    merchantCnpj: cnpj.length === 14 ? cnpj : null,
    merchantKey: merchantKey(merchantName ?? description),
    paymentMethod: clean(tx.paymentMethod, 40),
    installmentNumber: installmentsValid ? tx.installmentNumber : null,
    installmentTotal: installmentsValid ? tx.installmentTotal : null,
    billExternalId: tx.billExternalId,
  };
}

export type InvoiceRow = {
  externalId: string;
  /** Mês da fatura = mês do vencimento ("fatura de outubro" vence em outubro). */
  referenceMonth: LocalDate;
  closeDate: LocalDate | null;
  dueDate: LocalDate;
  totalCents: Cents;
  minimumCents: Cents | null;
};

export function mapBill(bill: ProviderBill, timeZone?: string): InvoiceRow {
  const dueDate = toLocalDate(bill.dueDate, timeZone);
  return {
    externalId: bill.externalId,
    referenceMonth: firstDay(yearMonthOf(dueDate)),
    closeDate: bill.closeDate ? toLocalDate(bill.closeDate, timeZone) : null,
    dueDate,
    totalCents: fromDecimal(bill.total),
    minimumCents: bill.minimum === null ? null : fromDecimal(bill.minimum),
  };
}

/**
 * Quando duas faturas caem no mesmo mês de vencimento (raro, mas o banco único por mês exige),
 * fica a de vencimento mais recente.
 */
export function dedupeInvoicesByMonth(rows: readonly InvoiceRow[]): InvoiceRow[] {
  const byMonth = new Map<string, InvoiceRow>();
  for (const row of rows) {
    const current = byMonth.get(row.referenceMonth);
    if (!current || row.dueDate > current.dueDate) byMonth.set(row.referenceMonth, row);
  }
  return [...byMonth.values()];
}

export type InvestmentRow = {
  externalId: string;
  name: string;
  type: string;
  subtype: string | null;
  balanceCents: Cents;
  amountInvestedCents: Cents | null;
  rateDescription: string | null;
  active: boolean;
};

export function mapInvestment(investment: ProviderInvestment): InvestmentRow {
  return {
    externalId: investment.externalId,
    name: clean(investment.name, 120) ?? "Investimento",
    type: investment.type,
    subtype: investment.subtype,
    balanceCents: fromDecimal(investment.balance),
    amountInvestedCents:
      investment.amountOriginal === null ? null : fromDecimal(investment.amountOriginal),
    rateDescription: clean(investment.rateDescription, 60),
    active: investment.active,
  };
}
