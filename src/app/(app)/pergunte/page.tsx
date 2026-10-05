import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Pergunte" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pergunte" />
      <EmptyState
        icon={MessageCircle}
        title="Em construção"
        description="O chat com a IA chega depois da conexão com os bancos, para responder com os seus dados reais."
      />
    </>
  );
}
