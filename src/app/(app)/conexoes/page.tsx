import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/infrastructure/auth/session";
import { isProviderConfigured } from "@/infrastructure/openfinance";
import {
  listConnections,
  recentSyncRuns,
  type ConnectionView,
} from "@/infrastructure/repositories/finance";
import { daysUntil, formatDateTime } from "@/lib/format-date";
import { disconnect } from "./actions";
import { AddConnectionForm, DisconnectButton, SyncNowButton } from "./connection-forms";

export const metadata: Metadata = { title: "Conexões" };
// A primeira leitura de 12 meses pode levar alguns segundos por banco.
export const maxDuration = 300;

const STATUS: Record<ConnectionView["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Ativa", tone: "positive" },
  updating: { label: "Atualizando no banco", tone: "neutral" },
  login_error: { label: "Precisa reautorizar", tone: "negative" },
  outdated: { label: "Desatualizada", tone: "warning" },
  revoked: { label: "Sem acesso", tone: "negative" },
  error: { label: "Com erro", tone: "negative" },
};

const RUN_STATUS: Record<string, string> = {
  ok: "Concluída",
  partial: "Parcial",
  failed: "Falhou",
  running: "Em andamento",
};

const TRIGGER: Record<string, string> = {
  cron: "automática",
  manual: "manual",
  initial: "inicial",
};

function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const status = STATUS[connection.status];
  const name = connection.institutionName ?? "Banco";
  const expiresIn = connection.consentExpiresAt ? daysUntil(connection.consentExpiresAt) : null;
  const failed = connection.statusDetail?.startsWith("sync_");

  return (
    <li className="border-border flex flex-col gap-3 border-b py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium">{name}</p>
          <p className="text-muted text-sm">
            {connection.accounts} {connection.accounts === 1 ? "conta" : "contas"} ·{" "}
            {connection.lastSyncedAt
              ? `atualizada ${formatDateTime(connection.lastSyncedAt)}`
              : "ainda não lida"}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {connection.status === "login_error" || connection.status === "outdated" ? (
        <Alert tone="warning">
          O banco pediu uma nova autorização. Abra o Meu Pluggy, reconecte {name} e depois toque em
          “Atualizar agora”.
        </Alert>
      ) : null}
      {connection.status === "revoked" ? (
        <Alert tone="negative">
          O Pluggy não encontrou mais esta conexão. Confira se ela continua autorizada para a sua
          aplicação no Pluggy Dashboard.
        </Alert>
      ) : null}
      {failed ? (
        <Alert tone="warning">A última leitura falhou. Os dados mostrados são da anterior.</Alert>
      ) : null}
      {expiresIn !== null && expiresIn <= 15 ? (
        <Alert tone="warning">
          {expiresIn > 0
            ? `O consentimento vence em ${expiresIn} ${expiresIn === 1 ? "dia" : "dias"}. Renove no Meu Pluggy.`
            : "O consentimento venceu. Renove no Meu Pluggy."}
        </Alert>
      ) : null}
      <form action={disconnect} className="self-end">
        <input type="hidden" name="connectionId" value={connection.id} />
        <DisconnectButton institution={name} />
      </form>
    </li>
  );
}

export default async function ConnectionsPage() {
  const session = await requireSession();
  const [connections, runs] = await Promise.all([
    listConnections(session.userId),
    recentSyncRuns(session.userId),
  ]);
  const configured = isProviderConfigured();

  return (
    <>
      <PageHeader
        title="Conexões"
        subtitle="Seus bancos pelo Open Finance, só leitura. Atualiza sozinho todo dia às 7h."
        action={connections.length > 0 && configured ? <SyncNowButton /> : null}
      />

      {!configured ? (
        <Alert tone="warning">
          Falta cadastrar PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis de ambiente da
          Vercel. O passo a passo está no README.
        </Alert>
      ) : null}

      {connections.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhum banco conectado"
          description="Conecte seus bancos no Meu Pluggy, autorize cada conexão para a sua aplicação no Pluggy Dashboard e cole o Item ID abaixo."
        />
      ) : (
        <Card>
          <CardTitle>Bancos conectados</CardTitle>
          <ul>
            {connections.map((connection) => (
              <ConnectionCard key={connection.id} connection={connection} />
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <CardTitle>Adicionar conexão</CardTitle>
        <AddConnectionForm />
        <details className="text-sm">
          <summary className="text-accent cursor-pointer font-medium">Onde acho o Item ID?</summary>
          <ol className="text-muted mt-3 flex list-decimal flex-col gap-2 pl-5">
            <li>No Meu Pluggy, conecte o banco e autorize no app dele.</li>
            <li>
              No Pluggy Dashboard, autorize essa conexão para a sua aplicação (uma vez por banco).
            </li>
            <li>Copie o Item ID que aparece na conexão e cole aqui.</li>
          </ol>
        </details>
      </Card>

      {runs.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>Últimas atualizações</CardTitle>
          <ul className="flex flex-col gap-2 text-sm">
            {runs.map((run) => (
              <li key={run.startedAt.toISOString()} className="flex justify-between gap-3">
                <span>
                  {formatDateTime(run.startedAt)}{" "}
                  <span className="text-muted">({TRIGGER[run.trigger] ?? run.trigger})</span>
                </span>
                <span className={run.status === "ok" ? "text-muted" : "text-warning"}>
                  {RUN_STATUS[run.status] ?? run.status}
                  {run.status === "ok" && run.stats.transactionsNew
                    ? ` · ${run.stats.transactionsNew} novas`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
