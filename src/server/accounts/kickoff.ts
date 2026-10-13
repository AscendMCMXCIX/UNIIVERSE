import type { Db } from "@/server/db/types";
import { listAccountsForPlayer } from "./repository";
import { syncAccount } from "./sync";
import { createRiotClient } from "@/server/riot/api/client";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

/**
 * Best-effort first verification of a player's freshly linked accounts, run after the sign-up
 * response has been sent. Riot being slow or down costs nothing: the accounts stay Pending and
 * the account-sync job retries them. Errors are swallowed on purpose (they are recorded on the
 * account rows themselves).
 */
export async function kickoffAccountSync(db: Db, playerId: string, options: { maxMatchesPerRun?: number; deadlineMs?: number } = {}): Promise<void> {
  const client = createRiotClient();
  if (!client) return;
  const startedAt = Date.now();
  const deadline = options.deadlineMs ?? 20_000;
  try {
    const accounts = (await listAccountsForPlayer(db, playerId)).filter((a) => a.syncStatus === "never" || a.syncStatus === "pending");
    for (const account of accounts) {
      if (Date.now() - startedAt > deadline) break;
      await syncAccount(db, client, account, { maxMatchesPerRun: options.maxMatchesPerRun ?? 20, outOfTime: () => Date.now() - startedAt > deadline });
    }
    invalidateProficiencyCache();
  } catch (err) {
    console.warn("[accounts] first sync skipped:", (err as Error).message);
  }
}
