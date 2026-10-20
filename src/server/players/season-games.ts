import type { Db } from "@/server/db/types";
import { accountRows } from "@/server/accounts/account-rows";
import { dedupeGames, type SeasonGame } from "@/domain/season-stats";

/**
 * Every stored game of the given accounts, one row per game (duplicates across the accounts
 * removed). Remakes and unsupported queues were never stored with a champion, so they are not
 * here. Read on every profile and Team page, so an instance keeps each account's games until they
 * change (account-rows.ts: a fingerprint of every column read, taken in the database, decides).
 */
export async function loadSeasonGames(db: Db, accountIds: string[], options: { dedupe?: boolean } = {}): Promise<SeasonGame[]> {
  const games = (await accountRows(db, "games", accountIds)).map((r) => ({ ...r, championId: r.championId! }));
  // Raw rows when the caller filters by account first (then de-duplicates itself).
  return options.dedupe === false ? games : dedupeGames(games);
}
