import { describe, expect, it } from "vitest";
import { daysUntil, formatDateTime, formatLocalDate, formatMonth } from "./format-date";

describe("datas na tela", () => {
  const now = new Date("2026-10-05T15:00:00Z"); // 12h em Brasília

  it("fala hoje, ontem ou a data, no fuso de Brasília", () => {
    expect(formatDateTime(new Date("2026-10-05T10:12:00Z"), now)).toBe("hoje às 07:12");
    expect(formatDateTime(new Date("2026-10-05T02:30:00Z"), now)).toBe("ontem às 23:30");
    expect(formatDateTime(new Date("2026-10-03T10:12:00Z"), now)).toBe("03/10 às 07:12");
  });

  it("formata dia, mês e dias restantes", () => {
    expect(formatLocalDate("2026-10-01")).toBe("01/10/2026");
    expect(formatMonth("2026-10-01")).toBe("out/2026");
    expect(daysUntil(new Date("2026-10-20T15:00:00Z"), now)).toBe(15);
  });
});
