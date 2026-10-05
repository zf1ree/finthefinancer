import { add, cents, subtract, ZERO, type Cents } from "../money";
import type { LocalDate } from "../dates";

export type CardTransaction = {
  readonly date: LocalDate;
  readonly amountCents: Cents;
  readonly direction: "in" | "out";
  readonly description: string;
  readonly invoiceId: string | null;
  readonly status: "pending" | "posted" | "removed";
};

const BILL_PAYMENT = /\b(pagamento|pgto|pag fatura|payment)\b/i;

/**
 * Fatura aberta calculada pelas compras: o banco nem sempre informa a fatura em aberto.
 * Soma o que entrou no cartão depois do último fechamento e ainda não está numa fatura fechada.
 * Pagamentos da fatura anterior caem como crédito no cartão e não abatem a fatura aberta.
 * [Validar com dados reais] o texto dos pagamentos varia por banco.
 */
export function openInvoiceTotal(
  transactions: readonly CardTransaction[],
  lastClosingDate: LocalDate | null,
): Cents {
  let total: Cents = ZERO;
  for (const tx of transactions) {
    if (tx.status === "removed" || tx.invoiceId !== null) continue;
    if (lastClosingDate !== null && tx.date <= lastClosingDate) continue;
    if (tx.direction === "out") {
      total = add(total, tx.amountCents);
    } else if (!BILL_PAYMENT.test(tx.description)) {
      total = subtract(total, tx.amountCents); // estorno ou crédito
    }
  }
  return total < 0 ? cents(0) : total;
}

/** Uso do limite em 0–100 (inteiro), ou null sem limite informado. */
export function limitUsage(limit: Cents | null, available: Cents | null): number | null {
  if (limit === null || available === null || limit <= 0) return null;
  const used = Math.min(Math.max(limit - available, 0), limit);
  return Math.round((used / limit) * 100);
}
