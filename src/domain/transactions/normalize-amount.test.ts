import { describe, expect, it } from "vitest";
import { normalizeProviderAmount } from "./normalize-amount";

describe("normalizeProviderAmount", () => {
  it("conta bancária: negativo é saída, positivo é entrada", () => {
    expect(normalizeProviderAmount("bank", -59.9)).toEqual({ amountCents: 5990, direction: "out" });
    expect(normalizeProviderAmount("bank", 4500)).toEqual({ amountCents: 450000, direction: "in" });
  });

  it("cartão: positivo é compra (saída), negativo é pagamento ou estorno (entrada)", () => {
    expect(normalizeProviderAmount("credit_card", 120.5)).toEqual({
      amountCents: 12050,
      direction: "out",
    });
    expect(normalizeProviderAmount("credit_card", "-2180.00")).toEqual({
      amountCents: 218000,
      direction: "in",
    });
  });

  it("ignora valor zero", () => {
    expect(normalizeProviderAmount("bank", 0)).toBeNull();
    expect(normalizeProviderAmount("credit_card", "-0.001")).toBeNull();
  });

  it("sempre devolve valor positivo", () => {
    for (const amount of [-1, 1, -0.01, 0.01, -99999.99]) {
      for (const kind of ["bank", "credit_card"] as const) {
        const result = normalizeProviderAmount(kind, amount);
        expect(result?.amountCents).toBeGreaterThan(0);
      }
    }
  });
});
