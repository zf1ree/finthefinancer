import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withSystem } from "@/infrastructure/db/client";
import { isProviderConfigured } from "@/infrastructure/openfinance";
import { getSyncService } from "@/infrastructure/sync";
import { logger } from "@/infrastructure/observability/logger";
import { cronSecret } from "@/lib/env";

// Limite do plano Hobby da Vercel.
export const maxDuration = 300;

function authorized(header: string | null): boolean {
  const secret = cronSecret();
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Rotina diária (vercel.json): sincroniza as conexões de cada usuário.
 * Também mantém o Supabase gratuito acordado (ele pausa após 7 dias sem uso).
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isProviderConfigured()) {
    await withSystem((tx) => tx.execute(sql`select 1`)); // ainda mantém o banco acordado
    return NextResponse.json({ users: 0, skipped: "pluggy_not_configured" });
  }

  const service = getSyncService();
  const users = await service.usersWithConnections();
  const results: { status: string }[] = [];
  for (const userId of users) {
    try {
      results.push(await service.syncUser(userId, "cron"));
    } catch (error) {
      logger.error("cron.user_failed", { error });
      results.push({ status: "failed" });
    }
  }
  const failed = results.filter((result) => result.status === "failed").length;
  return NextResponse.json({ users: users.length, failed }, { status: failed > 0 ? 500 : 200 });
}
