import { describe, expect, it } from "vitest";
import { localDate } from "@/domain/dates";
import {
  dedupeInvoicesByMonth,
  mapAccount,
  mapBill,
  mapCreditCard,
  mapInvestment,
  mapTransaction,
  syncWindow,
} from "./mapping";
import type { ProviderAccount, ProviderTransaction } from "./provider";

const card: ProviderAccount = {
  externalId: "acc-card",
  kind: "credit_card",
  name: "  Nubank   Mastercard ",
  number: "5162 **** **** 4321",
  balance: 2180.5,
  currency: "brl",
  credit: {
    brand: "MASTERCARD",
    limit: 5000,
    available: 2819.5,
    closeDate: new Date("2026-10-25T03:00:00.000Z"),
    dueDate: new Date("2026-11-01T03:00:00.000Z"),
  },
};

function providerTx(partial: Partial<ProviderTransaction> = {}): ProviderTransaction {
  return {
    externalId: "tx-1",
    date: new Date("2026-10-03T03:00:00.000Z"),
    description: "IFOOD *RESTAURANTE",
    amount: 45.9,
    currency: "BRL",
    status: "posted",
    merchantName: null,
    merchantCnpj: null,
    paymentMethod: null,
    installmentNumber: null,
    installmentTotal: null,
    billExternalId: null,
    ...partial,
  };
}

describe("syncWindow", () => {
  it("primeira vez puxa 12 meses; depois relê 7 dias antes do cursor", () => {
    const now = localDate("2026-10-05");
    expect(syncWindow(null, now)).toEqual({ from: "2025-10-05", to: "2026-10-05" });
    expect(syncWindow(localDate("2026-10-04"), now)).toEqual({ from: "2026-09-27", to: now });
  });
});

describe("mapAccount e mapCreditCard", () => {
  it("guarda só os 4 últimos dígitos e normaliza nome e moeda", () => {
    expect(mapAccount(card)).toEqual({
      externalId: "acc-card",
      type: "credit_card",
      name: "Nubank Mastercard",
      numberMasked: "4321",
      currency: "BRL",
      balanceCents: 218050,
    });
  });

  it("converte limite em centavos e o dia de fechamento no fuso de São Paulo", () => {
    expect(mapCreditCard(card)).toEqual({
      brand: "MASTERCARD",
      creditLimitCents: 500000,
      availableLimitCents: 281950,
      closingDay: 25,
      dueDay: 1,
      closingDaySource: "provider",
    });
  });

  it("conta bancária não gera dados de cartão", () => {
    expect(mapCreditCard({ ...card, kind: "checking", credit: null })).toBeNull();
  });
});

describe("mapTransaction", () => {
  it("compra no cartão (positivo) é saída, com data local", () => {
    const row = mapTransaction("credit_card", providerTx());
    expect(row).toMatchObject({
      date: "2026-10-03",
      amountCents: 4590,
      direction: "out",
      merchantKey: "ifood restaurante",
    });
  });

  it("na conta, negativo é saída e positivo é entrada", () => {
    expect(mapTransaction("checking", providerTx({ amount: -120 }))?.direction).toBe("out");
    expect(mapTransaction("checking", providerTx({ amount: 6000 }))?.direction).toBe("in");
  });

  it("23h em Brasília continua no mesmo dia", () => {
    const row = mapTransaction("checking", providerTx({ date: new Date("2026-10-04T02:30:00Z") }));
    expect(row?.date).toBe("2026-10-03");
  });

  it("descarta valor zero", () => {
    expect(mapTransaction("checking", providerTx({ amount: 0 }))).toBeNull();
  });

  it("aceita parcelas só quando coerentes e CNPJ só com 14 dígitos", () => {
    const ok = mapTransaction(
      "credit_card",
      providerTx({
        installmentNumber: 2,
        installmentTotal: 10,
        merchantCnpj: "12.345.678/0001-90",
      }),
    );
    expect(ok).toMatchObject({
      installmentNumber: 2,
      installmentTotal: 10,
      merchantCnpj: "12345678000190",
    });
    const bad = mapTransaction(
      "credit_card",
      providerTx({ installmentNumber: 5, installmentTotal: 3, merchantCnpj: "123" }),
    );
    expect(bad).toMatchObject({
      installmentNumber: null,
      installmentTotal: null,
      merchantCnpj: null,
    });
  });

  it("descrição vazia vira texto padrão", () => {
    expect(mapTransaction("checking", providerTx({ description: "   " }))?.descriptionRaw).toBe(
      "Sem descrição",
    );
  });
});

describe("faturas", () => {
  it("o mês de referência é o mês do vencimento", () => {
    const row = mapBill({
      externalId: "bill-1",
      dueDate: new Date("2026-10-01T03:00:00Z"),
      closeDate: new Date("2026-09-24T03:00:00Z"),
      total: 2180,
      minimum: 327,
    });
    expect(row).toEqual({
      externalId: "bill-1",
      referenceMonth: "2026-10-01",
      closeDate: "2026-09-24",
      dueDate: "2026-10-01",
      totalCents: 218000,
      minimumCents: 32700,
    });
  });

  it("duas faturas no mesmo mês: fica a de vencimento mais recente", () => {
    const a = mapBill({
      externalId: "a",
      dueDate: new Date("2026-10-01T03:00:00Z"),
      closeDate: null,
      total: 1,
      minimum: null,
    });
    const b = mapBill({
      externalId: "b",
      dueDate: new Date("2026-10-30T03:00:00Z"),
      closeDate: null,
      total: 2,
      minimum: null,
    });
    expect(dedupeInvoicesByMonth([a, b]).map((row) => row.externalId)).toEqual(["b"]);
  });
});

describe("mapInvestment", () => {
  it("caixinha vira investimento com saldo e valor aplicado em centavos", () => {
    expect(
      mapInvestment({
        externalId: "inv-1",
        name: "Viagem",
        type: "FIXED_INCOME",
        subtype: "CDB",
        balance: 7400.12,
        amountOriginal: 7000,
        rateDescription: "100% CDI",
        active: true,
        date: null,
      }),
    ).toEqual({
      externalId: "inv-1",
      name: "Viagem",
      type: "FIXED_INCOME",
      subtype: "CDB",
      balanceCents: 740012,
      amountInvestedCents: 700000,
      rateDescription: "100% CDI",
      active: true,
    });
  });
});
