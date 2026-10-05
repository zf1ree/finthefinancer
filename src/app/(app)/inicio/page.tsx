import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatCard } from "@/components/finance/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { add, ZERO } from "@/domain/money";
import { requireSession } from "@/infrastructure/auth/session";
import {
  getAccountsOverview,
  getCards,
  listConnections,
} from "@/infrastructure/repositories/finance";
import { getOrCreateProfile } from "@/infrastructure/repositories/profile";
import { formatDateTime } from "@/lib/format-date";

export const metadata: Metadata = { title: "Início" };

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(now),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function HomePage() {
  const session = await requireSession();
  const [profile, connections] = await Promise.all([
    getOrCreateProfile(session.userId, session.email?.split("@")[0] ?? "Você"),
    listConnections(session.userId),
  ]);
  const title = `${greeting(new Date())}, ${profile.displayName}`;

  if (connections.length === 0) {
    return (
      <>
        <PageHeader title={title} subtitle="Sua situação financeira" />
        <EmptyState
          icon={Landmark}
          title="Conecte suas contas para começar"
          description="Assim que seus bancos estiverem conectados pelo Open Finance, seu saldo, gastos e avisos aparecem aqui."
          action={
            <Link href="/conexoes" className={buttonVariants()}>
              Conectar banco
            </Link>
          }
        />
      </>
    );
  }

  const [overview, cards] = await Promise.all([
    getAccountsOverview(session.userId),
    getCards(session.userId),
  ]);
  const lastSync = connections
    .map((connection) => connection.lastSyncedAt)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const openInvoices = add(ZERO, ...cards.map((card) => card.openInvoiceCents));

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          lastSync ? `Atualizado ${formatDateTime(lastSync)}` : "Aguardando a primeira leitura"
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="Em contas"
          value={overview.accounts.length > 0 ? overview.totalAccountsCents : null}
          footer={<FooterLink href="/contas">Ver contas</FooterLink>}
        />
        <StatCard
          title="Em caixinhas"
          value={overview.investments.length > 0 ? overview.totalInvestmentsCents : null}
          footer={<FooterLink href="/contas">Ver caixinhas</FooterLink>}
        />
        <StatCard
          title="Faturas abertas"
          value={cards.length > 0 ? openInvoices : null}
          footer={<FooterLink href="/cartoes">Ver cartões</FooterLink>}
        />
      </div>
    </>
  );
}

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="text-accent text-sm font-medium hover:underline">
      {children}
    </Link>
  );
}
