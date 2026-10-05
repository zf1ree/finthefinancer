import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@/application/auth/access";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase";
import { EnrollTotp } from "./enroll-totp";
import { VerifyTotpForm } from "./verify-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage({ searchParams }: PageProps<"/verificacao">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    redirect(ROUTES.login);
  }
  const hasVerifiedTotp = data.totp.some((factor) => factor.status === "verified");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Verificação em duas etapas</h1>
        <p className="text-muted text-sm">
          {hasVerifiedTotp
            ? "Digite o código de 6 números do seu app autenticador."
            : "Para proteger seus dados bancários, o Fin exige um app autenticador (Google Authenticator, 1Password, Authy…)."}
        </p>
      </div>
      {hasVerifiedTotp ? <VerifyTotpForm next={nextPath} /> : <EnrollTotp next={nextPath} />}
    </div>
  );
}
