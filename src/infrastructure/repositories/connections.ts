import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { withUser, type UserId } from "@/infrastructure/db/client";
import { account, investment, ofConnection } from "@/infrastructure/db/schema";

/** Cria a conexão ou reativa uma removida antes. Retorna o id. */
export async function saveConnection(userId: UserId, externalItemId: string): Promise<string> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(ofConnection)
      .values({ userId, provider: "pluggy", externalItemId })
      .onConflictDoUpdate({
        target: [ofConnection.userId, ofConnection.provider, ofConnection.externalItemId],
        set: { deletedAt: null, status: "active", statusDetail: null },
      })
      .returning({ id: ofConnection.id });
    if (!row) throw new Error("connection upsert sem retorno");
    return row.id;
  });
}

/**
 * Remove do app: a conexão para de sincronizar e as contas somem das telas.
 * Os dados lidos ficam guardados (podem ser apagados em "Apagar tudo").
 * O consentimento no banco é revogado pelo usuário no Meu Pluggy ou no app do banco.
 */
export async function removeConnection(userId: UserId, connectionId: string): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const removedAt = new Date();
    const [row] = await tx
      .update(ofConnection)
      .set({ deletedAt: removedAt, status: "revoked" })
      .where(
        and(
          eq(ofConnection.id, connectionId),
          eq(ofConnection.userId, userId),
          isNull(ofConnection.deletedAt),
        ),
      )
      .returning({ id: ofConnection.id });
    if (!row) return false;
    await tx
      .update(account)
      .set({ deletedAt: removedAt })
      .where(and(eq(account.connectionId, connectionId), isNull(account.deletedAt)));
    await tx
      .update(investment)
      .set({ deletedAt: removedAt })
      .where(and(eq(investment.connectionId, connectionId), isNull(investment.deletedAt)));
    return true;
  });
}
