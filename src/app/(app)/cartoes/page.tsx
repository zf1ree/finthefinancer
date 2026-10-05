import { CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { subtract } from "@/domain/money";
import { requireSession } from "@/infrastructure/auth/session";
import { getCards, type CardView } from "@/infrastructure/repositories/finance";
import { formatLocalDate, formatMonth } from "@/lib/format-date";

export const metadata: Metadata = { title: "Cartões" };

function CardSummary({ card }: { card: CardView }) {
  const used =
    card.creditLimitCents !== null && card.availableLimitCents !== null
      ? subtract(card.creditLimitCents, card.availableLimitCents)
      : null;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">{card.name}</h2>
          <p className="text-muted text-xs">
            {[card.institutionName, card.brand, card.numberMasked && `final ${card.numberMasked}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <CreditCard aria-hidden className="text-muted size-5" />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-muted text-sm">Fatura aberta</p>
        <Money value={card.openInvoiceCents} className="text-3xl font-semibold tracking-tight" />
        <p className="text-muted text-xs">
          Calculada pelas compras desde o último fechamento
          {card.closingDay ? ` · fecha dia ${card.closingDay}` : ""}
          {card.dueDay ? ` · vence dia ${card.dueDay}` : ""}
        </p>
      </div>

      {card.usedPercent !== null && used !== null && card.creditLimitCents !== null ? (
        <div className="flex flex-col gap-2">
          <Progress value={card.usedPercent} label="Limite usado" />
          <div className="flex justify-between text-xs">
            <span>
              Usado <Money value={used} className="font-medium" />
            </span>
            <span className="text-muted">
              Disponível <Money value={card.availableLimitCents ?? 0} /> de{" "}
              <Money value={card.creditLimitCents} />
            </span>
          </div>
        </div>
      ) : (
        <p className="text-muted text-sm">O banco não informou o limite deste cartão.</p>
      )}

      <div className="flex flex-col gap-2">
        <CardTitle>Faturas fechadas</CardTitle>
        {card.closedInvoices.length === 0 ? (
          <p className="text-muted text-sm">
            Seu banco não informou faturas fechadas. A fatura aberta acima é calculada pelas
            compras.
          </p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {card.closedInvoices.map((invoice) => (
              <li key={invoice.referenceMonth} className="flex justify-between gap-3 py-2">
                <span>
                  {formatMonth(invoice.referenceMonth)}
                  {invoice.dueDate ? (
                    <span className="text-muted"> · venceu {formatLocalDate(invoice.dueDate)}</span>
                  ) : null}
                </span>
                {invoice.totalCents === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <Money value={invoice.totalCents} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default async function CardsPage() {
  const session = await requireSession();
  const cards = await getCards(session.userId);

  return (
    <>
      <PageHeader title="Cartões" subtitle="Fatura e limite de cada cartão" />
      {cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão conectado"
          description="Quando você conectar um banco com cartão de crédito, a fatura e o limite aparecem aqui."
          action={
            <Link href="/conexoes" className={buttonVariants()}>
              Conectar banco
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <CardSummary key={card.id} card={card} />
          ))}
        </div>
      )}
    </>
  );
}
