import { cents, formatBRL } from "@/domain/money";
import { cn } from "@/lib/cn";

type MoneyProps = {
  /** Valor em centavos. */
  value: number;
  signed?: boolean;
  /** Pinta entradas de verde e saídas de vermelho (o sinal continua visível). */
  colored?: boolean;
  className?: string;
};

export function Money({ value, signed = false, colored = false, className }: MoneyProps) {
  const amount = cents(value);
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        colored && amount > 0 && "text-positive",
        colored && amount < 0 && "text-negative",
        className,
      )}
    >
      {formatBRL(amount, { signed })}
    </span>
  );
}
