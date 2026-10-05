import { Target } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Plano" };

export default function Page() {
  return (
    <>
      <PageHeader title="Plano" />
      <EmptyState
        icon={Target}
        title="Em construção"
        description="Orçamento, reservas e plano de gastos chegam numa próxima etapa."
      />
    </>
  );
}
