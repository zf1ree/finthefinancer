"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ProviderError } from "@/application/sync/provider";
import { requireSession } from "@/infrastructure/auth/session";
import { logger } from "@/infrastructure/observability/logger";
import { getProvider, isProviderConfigured } from "@/infrastructure/openfinance";
import { removeConnection, saveConnection } from "@/infrastructure/repositories/connections";
import { hasRecentSync } from "@/infrastructure/repositories/finance";
import { recordAudit } from "@/infrastructure/repositories/profile";
import { getSyncService } from "@/infrastructure/sync";

export type ActionState = { error?: string; success?: string; itemId?: string };

const MANUAL_SYNC_COOLDOWN_SECONDS = 120;

const PROVIDER_MESSAGES: Record<ProviderError["code"], string> = {
  not_configured: "As credenciais do Pluggy ainda não foram cadastradas na Vercel.",
  auth: "O Pluggy recusou as credenciais da aplicação. Confira o Client ID e o Secret na Vercel.",
  rate_limited: "O Pluggy pediu uma pausa. Tente de novo em alguns minutos.",
  unavailable: "O Pluggy não respondeu. Tente de novo em alguns minutos.",
  invalid_response: "O Pluggy respondeu num formato inesperado. O erro foi registrado.",
};

function providerMessage(error: unknown): string {
  if (error instanceof ProviderError) return PROVIDER_MESSAGES[error.code];
  return "Algo deu errado. Tente de novo.";
}

function refresh() {
  for (const path of ["/conexoes", "/contas", "/cartoes", "/inicio"]) revalidatePath(path);
}

const itemIdSchema = z.uuid({
  error: "O Item ID tem o formato 8-4-4-4-12, como no Pluggy Dashboard.",
});

export async function addConnection(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const raw = String(formData.get("itemId") ?? "").trim();
  const parsed = itemIdSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, itemId: raw };
  }
  if (!isProviderConfigured()) {
    return { error: PROVIDER_MESSAGES.not_configured, itemId: raw };
  }

  try {
    const item = await getProvider().getItem(parsed.data);
    if (!item) {
      return {
        error:
          "Não encontramos essa conexão. Confira o Item ID e se ela foi autorizada para a sua aplicação no Pluggy Dashboard.",
        itemId: raw,
      };
    }
    const connectionId = await saveConnection(session.userId, item.externalId);
    await recordAudit(session.userId, "connection.added", { connectionId });
    const result = await getSyncService().syncUser(session.userId, "initial", { connectionId });
    refresh();
    if (result.status === "ok") {
      return {
        success: `${item.institution?.name ?? "Conexão"} adicionada: ${result.stats.accounts} contas e ${result.stats.transactionsNew} transações.`,
      };
    }
    return {
      success:
        result.status === "skipped"
          ? "Conexão adicionada. Uma sincronização já está em andamento."
          : "Conexão adicionada, mas a primeira leitura falhou. Use “Atualizar agora” em instantes.",
    };
  } catch (error) {
    logger.error("connection.add_failed", { error });
    return { error: providerMessage(error), itemId: raw };
  }
}

export async function syncNow(_: ActionState): Promise<ActionState> {
  const session = await requireSession();
  if (!isProviderConfigured()) return { error: PROVIDER_MESSAGES.not_configured };
  if (await hasRecentSync(session.userId, MANUAL_SYNC_COOLDOWN_SECONDS)) {
    return { error: "Seus dados acabaram de ser atualizados. Aguarde dois minutos." };
  }
  try {
    const result = await getSyncService().syncUser(session.userId, "manual");
    refresh();
    switch (result.status) {
      case "ok":
        return {
          success:
            result.stats.transactionsNew > 0
              ? `Pronto: ${result.stats.transactionsNew} transações novas.`
              : "Pronto: nada novo desde a última atualização.",
        };
      case "partial":
        return { error: "Algumas conexões não atualizaram. Veja o status de cada uma abaixo." };
      case "skipped":
        return { success: "Uma atualização já está em andamento." };
      default:
        return { error: "Não foi possível atualizar. Veja o status das conexões abaixo." };
    }
  } catch (error) {
    logger.error("sync.manual_failed", { error });
    return { error: providerMessage(error) };
  }
}

export async function disconnect(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = z.uuid().safeParse(formData.get("connectionId"));
  if (!parsed.success) return;
  if (await removeConnection(session.userId, parsed.data)) {
    await recordAudit(session.userId, "connection.removed", { connectionId: parsed.data });
  }
  refresh();
}
