import "server-only";
import { withSystem, withUser } from "@/infrastructure/db/client";
import { getProvider } from "@/infrastructure/openfinance";
import { createSyncService, type SyncService } from "./sync-service";

export function getSyncService(): SyncService {
  return createSyncService({ runners: { withUser, withSystem }, provider: getProvider() });
}
