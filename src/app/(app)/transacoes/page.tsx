import { LayoutList } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Transações" };

export default function Page() {
  return (
    <>
      <PageHeader title="Transações" />
      <EmptyState
        icon={LayoutList}
        title="Em construção"
        description="Suas transações aparecem aqui depois que os bancos forem conectados."
      />
    </>
  );
}
