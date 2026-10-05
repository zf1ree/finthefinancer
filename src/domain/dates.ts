/**
 * Datas contábeis como texto ISO "AAAA-MM-DD" (sem horário), sempre no fuso do usuário.
 * Evita os erros clássicos de Date em UTC virando o dia anterior no Brasil.
 */
export type LocalDate = string & { readonly __brand: "LocalDate" };

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class InvalidDateError extends Error {
  override name = "InvalidDateError";
}

export function localDate(text: string): LocalDate {
  const match = ISO_DATE.exec(text);
  if (!match) {
    throw new InvalidDateError(`Data inválida: ${text}`);
  }
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new InvalidDateError(`Data inválida: ${text}`);
  }
  return text as LocalDate;
}

/** Dia de hoje no fuso informado. */
export function today(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return localDate(parts);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type YearMonth = { readonly year: number; readonly month: number };

export function yearMonthOf(date: LocalDate): YearMonth {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return { year: y, month: m };
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function firstDay(ym: YearMonth): LocalDate {
  return localDate(`${ym.year}-${pad(ym.month)}-01`);
}

export function lastDay(ym: YearMonth): LocalDate {
  return localDate(`${ym.year}-${pad(ym.month)}-${pad(daysInMonth(ym.year, ym.month))}`);
}

export type DateRange = { readonly from: LocalDate; readonly to: LocalDate };

export function monthRange(ym: YearMonth): DateRange {
  return { from: firstDay(ym), to: lastDay(ym) };
}

/**
 * Mesmo trecho do mês (do dia 1 até `dayOfMonth`) em um mês anterior,
 * limitado ao último dia daquele mês. Usado para comparar "até hoje" com meses passados.
 */
export function samePeriodInMonth(ym: YearMonth, dayOfMonth: number): DateRange {
  const day = Math.min(dayOfMonth, daysInMonth(ym.year, ym.month));
  return { from: firstDay(ym), to: localDate(`${ym.year}-${pad(ym.month)}-${pad(day)}`) };
}

export function isWithin(date: LocalDate, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function addDays(date: LocalDate, delta: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return localDate(
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
  );
}
