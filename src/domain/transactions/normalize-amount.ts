import { abs, fromDecimal, type Cents } from "../money";

export type Direction = "in" | "out";

export type ProviderAccountKind = "bank" | "credit_card";

export type NormalizedAmount = {
  readonly amountCents: Cents;
  readonly direction: Direction;
};

/**
 * Converte o valor com sinal do provedor para (valor positivo, direção).
 *
 * Convenções do Pluggy (docs.pluggy.ai/docs/transactions):
 * - conta bancária: negativo = saída, positivo = entrada;
 * - cartão de crédito: positivo = compra (aumenta a dívida, saída),
 *   negativo = pagamento ou crédito (entrada).
 *
 * Retorna null para valor zero: não é uma movimentação e o banco exige amount > 0.
 */
export function normalizeProviderAmount(
  kind: ProviderAccountKind,
  amount: number | string,
): NormalizedAmount | null {
  const value = fromDecimal(amount);
  if (value === 0) {
    return null;
  }
  const isNegative = value < 0;
  const direction: Direction =
    kind === "credit_card" ? (isNegative ? "in" : "out") : isNegative ? "out" : "in";
  return { amountCents: abs(value), direction };
}
