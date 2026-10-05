import { describe, expect, it } from "vitest";
import {
  add,
  cents,
  formatBRL,
  fromDecimal,
  InvalidMoneyError,
  negate,
  percentChange,
  percentOf,
  subtract,
} from "./money";

describe("fromDecimal", () => {
  it.each([
    [1247.3, 124730],
    ["1247.30", 124730],
    [0.1, 10],
    [0.29, 29],
    [1.005, 101],
    [1.004, 100],
    ["-59.90", -5990],
    [-0.005, -1],
    [-0.004, 0],
    [0, 0],
    ["12", 1200],
  ])("converte %s para %s centavos", (input, expected) => {
    expect(fromDecimal(input)).toBe(expected);
  });

  it("não produz -0", () => {
    expect(Object.is(fromDecimal("-0.00"), -0)).toBe(false);
  });

  it.each(["", "abc", "1,50", "1.2.3", "--1"])("rejeita texto inválido %j", (input) => {
    expect(() => fromDecimal(input)).toThrow(InvalidMoneyError);
  });

  it("rejeita NaN, infinito e notação científica", () => {
    expect(() => fromDecimal(Number.NaN)).toThrow(InvalidMoneyError);
    expect(() => fromDecimal(Number.POSITIVE_INFINITY)).toThrow(InvalidMoneyError);
    expect(() => fromDecimal(1e21)).toThrow(InvalidMoneyError);
  });
});

describe("cents", () => {
  it("rejeita valores não inteiros", () => {
    expect(() => cents(1.5)).toThrow(InvalidMoneyError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(InvalidMoneyError);
  });
});

describe("aritmética", () => {
  it("soma, subtrai e inverte sem erro de float", () => {
    expect(add(cents(10), cents(20), cents(30))).toBe(60);
    expect(add()).toBe(0);
    expect(subtract(cents(100), cents(250))).toBe(-150);
    expect(Object.is(negate(cents(0)), -0)).toBe(false);
    expect(negate(cents(5))).toBe(-5);
  });

  it("calcula variação percentual com 1 casa", () => {
    expect(percentChange(cents(124730), cents(105703))).toBe(18);
    expect(percentChange(cents(88), cents(100))).toBe(-12);
    expect(percentChange(cents(100), cents(0))).toBeNull();
    expect(percentChange(cents(-50), cents(-100))).toBe(50);
  });

  it("calcula participação percentual", () => {
    expect(percentOf(cents(72), cents(100))).toBe(72);
    expect(percentOf(cents(1), cents(3))).toBe(33.3);
    expect(percentOf(cents(1), cents(0))).toBeNull();
  });
});

describe("formatBRL", () => {
  const normalize = (text: string) => text.replace(/\s/g, " ");

  it("formata em reais no padrão brasileiro", () => {
    expect(normalize(formatBRL(cents(124730)))).toBe("R$ 1.247,30");
    expect(normalize(formatBRL(cents(-5990)))).toBe("-R$ 59,90");
  });

  it("mostra o sinal quando pedido", () => {
    expect(normalize(formatBRL(cents(5990), { signed: true }))).toBe("+R$ 59,90");
    expect(normalize(formatBRL(cents(0), { signed: true }))).toBe("R$ 0,00");
  });
});
