import "server-only";
import { eq } from "drizzle-orm";
import { withUser, type UserId } from "@/infrastructure/db/client";
import { auditLog, userProfile } from "@/infrastructure/db/schema";

export type Profile = typeof userProfile.$inferSelect;

/** Busca o perfil; na primeira vez, cria com um nome provisório (editável no onboarding). */
export async function getOrCreateProfile(userId: UserId, fallbackName: string): Promise<Profile> {
  return withUser(userId, async (tx) => {
    const [existing] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId));
    if (existing) return existing;
    const [created] = await tx
      .insert(userProfile)
      .values({ userId, displayName: fallbackName.slice(0, 60) || "Você" })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [raced] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId));
    if (!raced) throw new Error("Perfil não encontrado após criação");
    return raced;
  });
}

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.mfa_enrolled"
  | "settings.theme_changed"
  | "connection.added"
  | "connection.removed";

export async function recordAudit(
  userId: UserId,
  action: AuditAction,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  await withUser(userId, (tx) =>
    tx.insert(auditLog).values({ userId, actor: "user", action, metadata }),
  );
}
