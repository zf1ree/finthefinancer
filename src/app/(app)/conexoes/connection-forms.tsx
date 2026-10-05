"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { addConnection, syncNow, type ActionState } from "./actions";

export function AddConnectionForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addConnection, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="itemId">Item ID do Pluggy</Label>
        <Input
          id="itemId"
          name="itemId"
          autoComplete="off"
          spellCheck={false}
          placeholder="00000000-0000-0000-0000-000000000000"
          defaultValue={state.itemId}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "itemId-error" : undefined}
          className="font-mono text-sm"
        />
        <FieldError id="itemId-error" message={state.error} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Conectando e lendo os dados…" : "Adicionar conexão"}
      </Button>
    </form>
  );
}

export function SyncNowButton() {
  const [state, action, pending] = useActionState<ActionState>(syncNow, {});
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <Button type="submit" variant="secondary" disabled={pending}>
        <RefreshCw aria-hidden className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Atualizando…" : "Atualizar agora"}
      </Button>
      {state.error ? <Alert tone="negative">{state.error}</Alert> : null}
      {state.success ? <Alert tone="positive">{state.success}</Alert> : null}
    </form>
  );
}

export function DisconnectButton({ institution }: { institution: string }) {
  return (
    <Button
      type="submit"
      variant="ghost"
      className="text-negative"
      onClick={(event) => {
        const message = `Remover ${institution} do Fin? As contas somem das telas e a sincronização para. Para revogar o acesso no banco, use o Meu Pluggy.`;
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      Remover
    </Button>
  );
}
