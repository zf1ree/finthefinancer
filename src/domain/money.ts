/**
 * Dinheiro sempre em centavos inteiros. Nunca usar float para valores monetários.
 */
export type Cents = number & { readonly __brand: "Cents" };

export class InvalidMoneyError extends Error {
  override name = "InvalidMoneyError";
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidMoneyError(`Valor em centavos inválido: ${value}`);
  }
  return value as Cents;
}

export const ZERO = cents(0);

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Converte um valor decimal (como vem das APIs: 1247.3, "-59.90") para centavos,
 * arredondando a terceira casa "meio para longe do zero" sem passar por float.
 */
export function fromDecimal(value: number | string): Cents {
  const text = typeof value === "number" ? numberToPlainString(value) : value.trim();
  const match = DECIMAL.exec(text);
  if (!match) {
    throw new InvalidMoneyError(`Valor decimal inválido: ${String(value)}`);
  }
  const [, sign, whole = "0", fraction = ""] = match;
  const padded = fraction.padEnd(3, "0");
  let result = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) {
    result += 1;
  }
  return cents(sign && result !== 0 ? -result : result);
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InvalidMoneyError(`Valor decimal inválido: ${value}`);
  }
  const text = String(value);
  if (/e/i.test(text)) {
    throw new InvalidMoneyError(`Valor fora da faixa suportada: ${value}`);
  }
  return text;
}

export function add(...values: Cents[]): Cents {
  return cents(values.reduce<number>((total, value) => total + value, 0));
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negate(value: Cents): Cents {
  return cents(value === 0 ? 0 : -value);
}

export function abs(value: Cents): Cents {
  return cents(Math.abs(value));
}

/**
 * Variação percentual de `base` para `current`, em pontos percentuais com 1 casa.
 * Retorna null quando a base é zero (não existe variação percentual definida).
 */
export function percentChange(current: Cents, base: Cents): number | null {
  if (base === 0) {
    return null;
  }
  return Math.round(((current - base) / Math.abs(base)) * 1000) / 10;
}

/** Fração de `part` em `total`, em % com 1 casa. Null quando total é zero. */
export function percentOf(part: Cents, total: Cents): number | null {
  if (total === 0) {
    return null;
  }
  return Math.round((part / total) * 1000) / 10;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlSigned = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  signDisplay: "exceptZero",
});

export function formatBRL(value: Cents, options: { signed?: boolean } = {}): string {
  const formatter = options.signed ? brlSigned : brl;
  return formatter.format(value / 100);
}
