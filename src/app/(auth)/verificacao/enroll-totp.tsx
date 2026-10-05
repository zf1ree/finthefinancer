"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startTotpEnrollment, type EnrollState } from "../actions";
import { VerifyTotpForm } from "./verify-form";

export function EnrollTotp({ next }: { next?: string | undefined }) {
  const [state, setState] = useState<EnrollState>({});
  const [pending, startTransition] = useTransition();

  if (!state.factorId || !state.qrCode) {
    return (
      <div className="flex flex-col gap-4">
        {state.error ? <Alert tone="negative">{state.error}</Alert> : null}
        <Button
          size="lg"
          block
          disabled={pending}
          onClick={() => startTransition(async () => setState(await startTotpEnrollment()))}
        >
          {pending ? "Gerando…" : "Configurar app autenticador"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>Abra o app autenticador e escaneie o QR code.</li>
        <li>Se não conseguir escanear, digite a chave abaixo.</li>
        <li>Digite o código de 6 números que o app mostrar.</li>
      </ol>
      {/* O QR code vem do Supabase como SVG em data URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.qrCode}
        alt="QR code para cadastrar o Fin no app autenticador"
        className="mx-auto size-48 rounded-md bg-white p-2"
      />
      <p
        className="bg-surface-2 rounded-md p-3 text-center font-mono text-sm break-all"
        aria-label="Chave manual"
      >
        {state.secret}
      </p>
      <VerifyTotpForm next={next} factorId={state.factorId} enrolling />
    </div>
  );
}
