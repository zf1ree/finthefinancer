import { cn } from "@/lib/cn";

/** Barra de progresso com texto acessível; a cor muda em 80% e 100%. */
export function Progress({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className="bg-surface-2 h-2 w-full overflow-hidden rounded-full"
    >
      <div
        className={cn(
          "h-full rounded-full",
          clamped >= 100 ? "bg-negative" : clamped >= 80 ? "bg-warning" : "bg-accent",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
