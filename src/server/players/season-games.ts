import { and, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches } from "@/server/db/schema";
import { cachedUntilChanged } from "@/server/observability/cache";
import { dedupeGames, type SeasonGame } from "@/domain/season-stats";

const columns = { matchId: accountMatches.matchId, accountId: accountMatches.accountId, queueId: accountMatches.queueId, championId: accountMatches.championId, role: accountMatches.role, win: accountMatches.win, patch: accountMatches.patch, gameCreation: accountMatches.gameCreation, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, cs: accountMatches.cs, damage: accountMatches.damage, visionScore: accountMatches.visionScore, gameDuration: accountMatches.gameDuration };

/**
 * Every stored game of the given accounts, one row per game (duplicates across the accounts
 * removed). Remakes and unsupported queues were never stored with a champion, so they are not
 * here. One indexed query; a full season for a busy player is a few thousand small rows. Those
 * rows are read on every profile page, so an instance keeps them until they change (a one-row
 * fingerprint of every column read, taken in the database, decides; see cachedUntilChanged).
 */
export async function loadSeasonGames(db: Db, accountIds: string[], options: { dedupe?: boolean } = {}): Promise<SeasonGame[]> {
  if (accountIds.length === 0) return [];
  const ids = [...new Set(accountIds)].sort();
  const where = and(inArray(accountMatches.accountId, ids), isNotNull(accountMatches.championId));
  const games = await cachedUntilChanged(
    db,
    `season-games:${ids.join(",")}`,
    async () => {
      const row = sql.join(Object.values(columns), sql`, `);
      const [r] = await db.select({ n: sql<number>`count(*)::int`, h: sql<string>`coalesce(sum(hashtextextended(row(${row})::text, 0)), 0)::text` }).from(accountMatches).where(where);
      return `${r?.n ?? 0}:${r?.h ?? 0}`;
    },
    async () => (await db.select(columns).from(accountMatches).where(where)).map((r) => ({ ...r, championId: r.championId! })),
  );
  // Raw rows when the caller filters by account first (then de-duplicates itself).
  return options.dedupe === false ? [...games] : dedupeGames(games);
}
