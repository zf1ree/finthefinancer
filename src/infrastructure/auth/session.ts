import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ROUTES, type AssuranceLevel } from "@/application/auth/access";
import { toUserId, type UserId } from "@/infrastructure/db/scoped";
import { createSupabaseServerClient } from "./supabase";

export type Session = {
  readonly userId: UserId;
  readonly email: string | null;
  readonly aal: AssuranceLevel;
};

/** Lê e valida a sessão (JWT verificado pelo Supabase). Null se não houver. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return null;
  }
  const { claims } = data;
  return {
    userId: toUserId(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
  };
});

/**
 * Segunda barreira (a primeira é o proxy): toda página e ação do app chama isto.
 * Sem sessão completa (com MFA), redireciona.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(ROUTES.login);
  }
  if (session.aal !== "aal2") {
    redirect(ROUTES.mfa);
  }
  return session;
}
