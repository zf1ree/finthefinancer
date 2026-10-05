import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess, type SessionState } from "@/application/auth/access";
import { publicEnv } from "@/lib/env";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security-headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Roda antes de cada página: renova a sessão do Supabase, aplica a regra de acesso
 * (login + MFA obrigatório) e define a Content-Security-Policy com nonce.
 */
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    isDev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const env = publicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims valida o JWT; não usar getSession aqui (não verifica a assinatura).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const session: SessionState = claims?.sub
    ? { aal: claims.aal === "aal2" ? "aal2" : "aal1" }
    : null;

  const decision = decideAccess(request.nextUrl.pathname, session);
  if (decision.type === "redirect") {
    const target = NextResponse.redirect(new URL(decision.to, request.url));
    for (const cookie of response.cookies.getAll()) {
      target.cookies.set(cookie);
    }
    target.headers.set("Content-Security-Policy", csp);
    return target;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
