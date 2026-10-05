import { PiggyBank, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/finance/money";
import { StatCard } from "@/components/finance/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { subtract } from "@/domain/money";
import { requireSession } from "@/infrastructure/auth/session";
import { getAccountsOverview, type AccountView } from "@/infrastructure/repositories/finance";
import { formatDateTime } from "@/lib/format-date";

export const metadata: Metadata = { title: "Contas e caixinhas" };

const TYPE_LABEL: Record<AccountView["type"], string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão",
  investment: "Investimento",
  loan: "Empréstimo",
  other: "Conta",
};

function groupByInstitution<T extends { institutionName: string | null }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.institutionName ?? "Outros";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

export default async function AccountsPage() {
  const session = await requireSession();
  const overview = await getAccountsOverview(session.userId);

  if (overview.accounts.length === 0 && overview.investments.length === 0) {
    return (
      <>
        <PageHeader title="Contas e caixinhas" />
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta ainda"
          description="Conecte um banco para ver seus saldos e caixinhas aqui."
          action={
            <Link href="/conexoes" className={buttonVariants()}>
              Conectar banco
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Contas e caixinhas" subtitle="Onde está o seu dinheiro" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard title="Em contas" value={overview.totalAccountsCents} />
        <StatCard title="Em caixinhas e investimentos" value={overview.totalInvestmentsCents} />
      </div>

      {groupByInstitution(overview.accounts).map(([name, accounts]) => (
        <Card key={name} className="flex flex-col gap-2">
          <CardTitle>{name}</CardTitle>
          <ul className="divide-border divide-y">
            {accounts.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted text-xs">
                    {TYPE_LABEL[row.type]}
                    {row.numberMasked ? ` · final ${row.numberMasked}` : ""}
                    {row.balanceAt ? ` · ${formatDateTime(row.balanceAt)}` : ""}
                  </span>
                </div>
                <Money value={row.balanceCents} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card className="flex flex-col gap-2">
        <CardTitle>Caixinhas e investimentos</CardTitle>
        {overview.investments.length === 0 ? (
          <div className="flex items-start gap-3 py-2">
            <PiggyBank aria-hidden className="text-muted mt-0.5 size-5 shrink-0" />
            <p className="text-muted text-sm">
              Nenhuma caixinha encontrada. Se você tem caixinhas no Nubank, confira se o
              consentimento no Meu Pluggy inclui investimentos.
            </p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {overview.investments.map((row) => {
              const gain =
                row.amountInvestedCents === null
                  ? null
                  : subtract(row.balanceCents, row.amountInvestedCents);
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-muted text-xs">
                      {[row.institutionName, row.rateDescription].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <Money value={row.balanceCents} className="font-semibold" />
                    {gain !== null && gain !== 0 ? (
                      <span className="text-muted text-xs">
                        <Money value={gain} signed colored /> sobre o aplicado
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
