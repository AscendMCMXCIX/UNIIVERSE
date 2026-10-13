import type { Db } from "@/server/db/types";
import { comparePatches } from "@/domain/patch";
import type { HistoryBucket } from "@/domain/player-stats";
import { listAccountsForPlayers, loadHistoryForAccounts } from "@/server/accounts/repository";
import { listPatchesDesc } from "@/server/repositories/champions";

/**
 * Stored champion history for a set of players, as buckets with the patch distance resolved
 * (0 = current patch). One query for accounts, one for history, one for the patch list; no
 * Riot calls. Several accounts of one player are simply added together.
 */
export async function loadHistoryBuckets(db: Db, playerIds: string[]): Promise<Map<string, HistoryBucket[]>> {
  const out = new Map<string, HistoryBucket[]>();
  for (const id of playerIds) out.set(id, []);
  if (playerIds.length === 0) return out;
  const accounts = await listAccountsForPlayers(db, playerIds);
  if (accounts.length === 0) return out;
  const ownerOf = new Map(accounts.map((a) => [a.id, a.playerId!]));
  const [rows, patches] = await Promise.all([loadHistoryForAccounts(db, accounts.map((a) => a.id)), listPatchesDesc(db)]);
  for (const r of rows) {
    const owner = ownerOf.get(r.accountId);
    if (!owner) continue;
    const idx = patches.findIndex((p) => comparePatches(p, r.patch) <= 0);
    out.get(owner)!.push({ championId: r.championId, queueGroup: r.queueGroup, patchDistance: patches.length && idx >= 0 ? idx : null, games: r.games, wins: r.wins, lastPlayedAt: r.lastPlayedAt });
  }
  return out;
}
