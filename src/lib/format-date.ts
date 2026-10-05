const TIME_ZONE = "America/Sao_Paulo";

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);

/** "hoje às 07:12", "ontem às 21:40" ou "03/10 às 07:12" (fuso de São Paulo). */
export function formatDateTime(date: Date, now: Date = new Date()): string {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(date) === dayKey(now)) return `hoje às ${time}`;
  if (dayKey(date) === dayKey(yesterday)) return `ontem às ${time}`;
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `${day} às ${time}`;
}

/** "2026-10-01" → "01/10/2026". */
export function formatLocalDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10-01" → "out/2026". */
export function formatMonth(value: string): string {
  const [y, m] = value.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]}/${y}`;
}

/** Dias inteiros entre agora e a data (negativo se já passou). */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
