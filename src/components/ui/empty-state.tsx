import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
      <span className="bg-accent-soft text-accent flex size-12 items-center justify-center rounded-full">
        <Icon aria-hidden className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted max-w-sm text-sm">{description}</p>
      {action}
    </div>
  );
}
