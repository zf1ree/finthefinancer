import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

type DeltaProps = {
  /** Variação em %, ou null quando não há base de comparação. */
  percent: number | null;
  /** O que é bom para este número: subir (receita) ou descer (despesa). */
  goodWhen: "up" | "down";
  comparedTo: string;
  className?: string;
};

const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Comparação sempre com ícone + texto, nunca só com cor. */
export function Delta({ percent, goodWhen, comparedTo, className }: DeltaProps) {
  if (percent === null) {
    return <span className={cn("text-muted text-sm", className)}>Sem base para comparar</span>;
  }
  const flat = Math.abs(percent) < 0.5;
  const up = percent > 0;
  const good = flat ? null : (up && goodWhen === "up") || (!up && goodWhen === "down");
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const label = flat
    ? `Igual à ${comparedTo}`
    : `${pct.format(Math.abs(percent))}% ${up ? "acima" : "abaixo"} da ${comparedTo}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        good === null ? "text-muted" : good ? "text-positive" : "text-negative",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </span>
  );
}
