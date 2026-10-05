import { describe, expect, it } from "vitest";
import { localDate } from "../dates";
import { cents } from "../money";
import { limitUsage, openInvoiceTotal, type CardTransaction } from "./open-invoice";

function tx(
  partial: Partial<CardTransaction> & Pick<CardTransaction, "amountCents">,
): CardTransaction {
  return {
    date: localDate("2026-10-03"),
    direction: "out",
    description: "COMPRA",
    invoiceId: null,
    status: "posted",
    ...partial,
  };
}

describe("openInvoiceTotal", () => {
  it("soma compras depois do último fechamento e ignora as de faturas fechadas", () => {
    const total = openInvoiceTotal(
      [
        tx({ amountCents: cents(4590) }),
        tx({ amountCents: cents(10000), date: localDate("2026-09-20") }), // antes do fechamento
        tx({ amountCents: cents(2000), invoiceId: "fatura-setembro" }),
        tx({ amountCents: cents(1500), status: "pending" }),
      ],
      localDate("2026-09-25"),
    );
    expect(total).toBe(6090);
  });

  it("estorno abate; pagamento da fatura anterior não", () => {
    const total = openInvoiceTotal(
      [
        tx({ amountCents: cents(10000) }),
        tx({ amountCents: cents(3000), direction: "in", description: "ESTORNO LOJA" }),
        tx({ amountCents: cents(218000), direction: "in", description: "Pagamento recebido" }),
      ],
      null,
    );
    expect(total).toBe(7000);
  });

  it("ignora removidas e nunca fica negativa", () => {
    const total = openInvoiceTotal(
      [
        tx({ amountCents: cents(500), status: "removed" }),
        tx({ amountCents: cents(900), direction: "in", description: "ESTORNO" }),
      ],
      null,
    );
    expect(total).toBe(0);
  });
});

describe("limitUsage", () => {
  it("calcula o percentual usado do limite", () => {
    expect(limitUsage(cents(500000), cents(282000))).toBe(44);
    expect(limitUsage(cents(500000), cents(-1000))).toBe(100);
    expect(limitUsage(null, cents(1))).toBeNull();
    expect(limitUsage(cents(0), cents(0))).toBeNull();
  });
});
