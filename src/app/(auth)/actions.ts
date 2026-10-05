"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ROUTES, safeNextPath } from "@/application/auth/access";
import { getSession } from "@/infrastructure/auth/session";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase";
import { logger } from "@/infrastructure/observability/logger";
import { recordAudit } from "@/infrastructure/repositories/profile";

export type FormState = {
  error?: string | undefined;
  fieldErrors?: Record<string, string> | undefined;
  email?: string | undefined;
};

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").max(254),
  password: z.string().min(1, "Informe a senha.").max(200),
  next: z.string().max(500).optional(),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, email: String(formData.get("email") ?? "").slice(0, 254) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    logger.warn("auth.sign_in_failed", { reason: error.code ?? "unknown" });
    // Mensagem genérica: não revela se o e-mail existe.
    return { error: "E-mail ou senha incorretos.", email: parsed.data.email };
  }
  const next = safeNextPath(parsed.data.next);
  redirect(`${ROUTES.mfa}?next=${encodeURIComponent(next)}`);
}

export type EnrollState = FormState & {
  factorId?: string;
  qrCode?: string;
  secret?: string;
};

/** Cadastra um app autenticador (TOTP). Remove cadastros antigos não confirmados antes. */
export async function startTotpEnrollment(): Promise<EnrollState> {
  const supabase = await createSupabaseServerClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    logger.error("auth.mfa_list_failed", { reason: listError.code ?? "unknown" });
    return { error: "Não foi possível iniciar a verificação. Entre de novo." };
  }
  if (factors.totp.some((factor) => factor.status === "verified")) {
    return { error: "Você já tem um app autenticador cadastrado." };
  }
  for (const factor of factors.all.filter(
    (f) => f.factor_type === "totp" && f.status === "unverified",
  )) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Fin",
  });
  if (error) {
    logger.error("auth.mfa_enroll_failed", { reason: error.code ?? "unknown" });
    return { error: "Não foi possível gerar o QR code. Tente de novo." };
  }
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const verifySchema = z.object({
  factorId: z.uuid().optional(),
  code: z.string().regex(/^\d{6}$/, "O código tem 6 números."),
  next: z.string().max(500).optional(),
  enrolling: z.enum(["0", "1"]).optional(),
});

export async function verifyTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifySchema.safeParse({
    factorId: formData.get("factorId") || undefined,
    code: String(formData.get("code") ?? "").replace(/\s/g, ""),
    next: formData.get("next") ?? undefined,
    enrolling: formData.get("enrolling") ?? undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: { code: parsed.error.issues[0]?.message ?? "Código inválido." } };
  }

  const supabase = await createSupabaseServerClient();
  let factorId = parsed.data.factorId;
  if (!factorId) {
    const { data } = await supabase.auth.mfa.listFactors();
    factorId = data?.totp.find((factor) => factor.status === "verified")?.id;
  }
  if (!factorId) {
    return { error: "Nenhum app autenticador cadastrado." };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: parsed.data.code,
  });
  if (error) {
    logger.warn("auth.mfa_verify_failed", { reason: error.code ?? "unknown" });
    return { fieldErrors: { code: "Código incorreto ou expirado." } };
  }

  const session = await getSession();
  if (session) {
    try {
      if (parsed.data.enrolling === "1") await recordAudit(session.userId, "auth.mfa_enrolled");
      await recordAudit(session.userId, "auth.login");
    } catch (auditError) {
      logger.error("audit.write_failed", { error: auditError });
    }
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  if (session) {
    try {
      await recordAudit(session.userId, "auth.logout");
    } catch (auditError) {
      logger.error("audit.write_failed", { error: auditError });
    }
  }
  redirect(ROUTES.login);
}
