/**
 * Decide o que fazer com uma requisição de página, dado o estado da sessão.
 * MFA é obrigatório: sem `aal2`, nenhuma tela do app abre.
 */
export type AssuranceLevel = "aal1" | "aal2";

export type SessionState = { readonly aal: AssuranceLevel } | null;

export type AccessDecision = { type: "allow" } | { type: "redirect"; to: string };

export const ROUTES = {
  login: "/entrar",
  mfa: "/verificacao",
  home: "/inicio",
} as const;

const allow: AccessDecision = { type: "allow" };
const redirect = (to: string): AccessDecision => ({ type: "redirect", to });

export function decideAccess(pathname: string, session: SessionState): AccessDecision {
  if (pathname.startsWith("/api/")) {
    return allow; // rotas de API validam a própria autorização
  }

  if (pathname === ROUTES.login) {
    if (!session) return allow;
    return redirect(session.aal === "aal2" ? ROUTES.home : ROUTES.mfa);
  }

  if (pathname === ROUTES.mfa) {
    if (!session) return redirect(ROUTES.login);
    return session.aal === "aal2" ? redirect(ROUTES.home) : allow;
  }

  if (!session) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return redirect(`${ROUTES.login}${next}`);
  }
  if (session.aal !== "aal2") {
    return redirect(ROUTES.mfa);
  }
  return pathname === "/" ? redirect(ROUTES.home) : allow;
}

/**
 * Só aceita caminhos internos do próprio app no parâmetro `next`,
 * para o login não virar um redirecionador aberto ("//site-malicioso.com").
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return ROUTES.home;
  }
  if (next === ROUTES.login || next === ROUTES.mfa) {
    return ROUTES.home;
  }
  return next;
}
