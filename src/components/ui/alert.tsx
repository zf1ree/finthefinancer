import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: "border-border bg-surface-2 text-text",
  warning: "border-warning/40 bg-warning-soft text-warning",
  negative: "border-negative/40 bg-negative-soft text-negative",
  positive: "border-positive/40 bg-positive-soft text-positive",
} as const;

export function Alert({
  tone = "info",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}
