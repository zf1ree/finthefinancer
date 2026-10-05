import type { ReactNode } from "react";
import { BottomNav, SideNav } from "@/components/layout/app-nav";
import { Logo } from "@/components/layout/logo";
import { requireSession } from "@/infrastructure/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl gap-8 md:px-6">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-8 py-6 md:flex">
        <Logo />
        <SideNav />
      </aside>
      <main className="flex w-full min-w-0 flex-col gap-6 px-4 pt-6 pb-28 md:px-0 md:pb-10">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
