import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Money } from "./money";

type StatCardProps = {
  title: string;
  value: number | null;
  footer?: ReactNode;
};

/** Número de destaque com contexto. `value` null = dado indisponível (nunca mostrar como zero). */
export function StatCard({ title, value, footer }: StatCardProps) {
  return (
    <Card className="flex min-w-44 flex-col gap-2">
      <CardTitle>{title}</CardTitle>
      {value === null ? (
        <p className="text-muted text-2xl font-semibold">—</p>
      ) : (
        <Money value={value} className="text-2xl font-semibold tracking-tight" />
      )}
      {footer ? <div>{footer}</div> : null}
    </Card>
  );
}
