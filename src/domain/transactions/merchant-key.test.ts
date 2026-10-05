import { describe, expect, it } from "vitest";
import { merchantKey } from "./merchant-key";

describe("merchantKey", () => {
  it("ignora caixa, acentos, números e pontuação", () => {
    expect(merchantKey("IFOOD *RESTAURANTE 123")).toBe("ifood restaurante");
    expect(merchantKey("Ifood*Restaurante")).toBe("ifood restaurante");
    expect(merchantKey("Padaria São João 02/03")).toBe("padaria sao joao");
  });

  it("remove prefixos de adquirente", () => {
    expect(merchantKey("PG *LOJA XYZ")).toBe("loja xyz");
    expect(merchantKey("MP*MERCADO")).toBe("mercado");
  });

  it("retorna null quando não sobra texto útil", () => {
    expect(merchantKey("12345")).toBeNull();
    expect(merchantKey("*")).toBeNull();
  });
});
