"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { verifyTotp, type FormState } from "../actions";

type Props = { next?: string | undefined; factorId?: string | undefined; enrolling?: boolean };

export function VerifyTotpForm({ next, factorId, enrolling = false }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyTotp, {});
  const codeError = state.fieldErrors?.code;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <input type="hidden" name="enrolling" value={enrolling ? "1" : "0"} />
      {state.error ? <Alert tone="negative">{state.error}</Alert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Código</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="tabular text-center text-2xl tracking-[0.5em]"
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? "code-error" : undefined}
        />
        <FieldError id="code-error" message={codeError} />
      </div>
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Verificando…" : "Confirmar"}
      </Button>
    </form>
  );
}
