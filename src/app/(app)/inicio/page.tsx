import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/infrastructure/auth/session";
import { getOrCreateProfile } from "@/infrastructure/repositories/profile";

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
  const profile = await getOrCreateProfile(session.userId, session.email?.split("@")[0] ?? "Você");

  return (
    <>
      <PageHeader
        title={`${greeting(new Date())}, ${profile.displayName}`}
        subtitle="Sua situação financeira"
      />
      <EmptyState
        icon={Landmark}
        title="Conecte suas contas para começar"
        description="Assim que seus bancos estiverem conectados pelo Open Finance, seu saldo, gastos e avisos aparecem aqui. A conexão chega na próxima etapa do desenvolvimento."
      />
    </>
  );
}
