import {
  Bell,
  ChevronRight,
  CreditCard,
  Link2,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Mais" };

const ITEMS: { label: string; icon: LucideIcon; href?: string }[] = [
  { label: "Contas e caixinhas", icon: Wallet },
  { label: "Cartões", icon: CreditCard },
  { label: "Avisos", icon: Bell },
  { label: "Conexões", icon: Link2 },
  { label: "Configurações e privacidade", icon: Settings, href: "/configuracoes" },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="Mais" />
      <ul className="divide-border border-border bg-surface divide-y overflow-hidden rounded-lg border">
        {ITEMS.map(({ label, icon: Icon, href }) => {
          const content = (
            <>
              <Icon aria-hidden className="text-muted size-5" />
              <span className="flex-1">{label}</span>
              {href ? (
                <ChevronRight aria-hidden className="text-muted size-4" />
              ) : (
                <span className="text-muted text-xs">Em breve</span>
              )}
            </>
          );
          return (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  className="hover:bg-surface-2 flex min-h-14 items-center gap-3 px-4"
                >
                  {content}
                </Link>
              ) : (
                <div
                  className="flex min-h-14 items-center gap-3 px-4 opacity-70"
                  aria-disabled="true"
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
