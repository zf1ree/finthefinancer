import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  InvalidDateError,
  isWithin,
  localDate,
  monthRange,
  samePeriodInMonth,
  today,
  yearMonthOf,
} from "./dates";

describe("localDate", () => {
  it("aceita datas válidas, inclusive 29/02 em ano bissexto", () => {
    expect(localDate("2026-10-05")).toBe("2026-10-05");
    expect(localDate("2028-02-29")).toBe("2028-02-29");
  });

  it.each(["2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "05/10/2026", ""])(
    "rejeita %j",
    (text) => {
      expect(() => localDate(text)).toThrow(InvalidDateError);
    },
  );
});

describe("today", () => {
  it("usa o fuso de São Paulo, não UTC", () => {
    // 02:30 UTC de 06/10 ainda é 05/10 às 23:30 em São Paulo.
    expect(today(new Date("2026-10-06T02:30:00Z"))).toBe("2026-10-05");
    expect(today(new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-06");
  });
});

describe("meses", () => {
  it("soma e subtrai meses atravessando o ano", () => {
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
    expect(addMonths({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
  });

  it("gera o intervalo do mês", () => {
    expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(yearMonthOf(localDate("2026-10-05"))).toEqual({ year: 2026, month: 10 });
  });

  it("limita o mesmo período ao tamanho do mês", () => {
    expect(samePeriodInMonth({ year: 2026, month: 2 }, 31)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(samePeriodInMonth({ year: 2026, month: 9 }, 12).to).toBe("2026-09-12");
  });

  it("verifica se a data está no intervalo, com bordas inclusivas", () => {
    const range = monthRange({ year: 2026, month: 9 });
    expect(isWithin(localDate("2026-09-01"), range)).toBe(true);
    expect(isWithin(localDate("2026-09-30"), range)).toBe(true);
    expect(isWithin(localDate("2026-10-01"), range)).toBe(false);
  });
});

describe("addDays", () => {
  it("atravessa meses e anos bissextos", () => {
    expect(addDays(localDate("2026-03-01"), -1)).toBe("2026-02-28");
    expect(addDays(localDate("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(localDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(localDate("2026-10-05"), -365)).toBe("2025-10-05");
  });
});
