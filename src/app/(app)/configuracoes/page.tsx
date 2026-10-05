import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/infrastructure/auth/session";
import { cn } from "@/lib/cn";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import { signOut } from "../../(auth)/actions";
import { setTheme } from "./actions";

export const metadata: Metadata = { title: "Configurações" };

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const current = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader title="Configurações" />
      <Card className="flex flex-col gap-3">
        <CardTitle>Aparência</CardTitle>
        <form action={setTheme} className="grid grid-cols-3 gap-2" aria-label="Tema">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="submit"
              name="theme"
              value={value}
              aria-pressed={current === value}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border text-sm",
                current === value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border hover:bg-surface-2",
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </button>
          ))}
        </form>
      </Card>
      <Card className="flex flex-col gap-3">
        <CardTitle>Segurança</CardTitle>
        <p className="text-sm">
          Conectado como <span className="font-medium">{session.email ?? "você"}</span>, com
          verificação em duas etapas ativa.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            <LogOut aria-hidden className="size-4" />
            Sair
          </Button>
        </form>
      </Card>
      <Card className="flex flex-col gap-2">
        <CardTitle>Privacidade</CardTitle>
        <p className="text-muted text-sm">
          Exportar e apagar todos os seus dados chegam junto com a conexão dos bancos.
        </p>
      </Card>
    </>
  );
}
