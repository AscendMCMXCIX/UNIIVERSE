import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { platformOfMatchId, type KnownRiotId } from "@/domain/opgg";

/*
  The Riot ID to link a player by, from what UNIIVERSE already stores: no Riot request is made.
  A match records the Riot ID a player had in that game, which goes stale when they rename (the
  old name can then open nobody, or someone else). So, by PUUID:
    1. a linked account's Riot ID, which the account sync keeps current, on its confirmed server;
    2. otherwise the Riot ID from the newest stored game after `since` that the player appears in,
       on that game's server.
  Players found in neither keep the Riot ID their own match recorded (domain/opgg opggLinkFor).
*/

type Row = { puuid: string; name: string | null; match_id: string };

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/**
 * Newest known Riot IDs for these players. `since` (ms) bounds the search to games newer than the
 * ones on screen, so only the stored games that could hold a newer name are read.
 */
export async function knownRiotIds(db: Db, puuids: readonly string[], since: number): Promise<Map<string, KnownRiotId>> {
  const ids = [...new Set(puuids.filter(Boolean))];
  const out = new Map<string, KnownRiotId>();
  if (!ids.length) return out;
  const linked = await db
    .select({ puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, platform: riotAccounts.platform })
    .from(riotAccounts)
    // Demo accounts carry made-up Riot IDs that could belong to a real stranger: never linked.
    .where(and(eq(riotAccounts.ownerType, "player"), ne(riotAccounts.syncStatus, "demo"), isNotNull(riotAccounts.puuid), inArray(riotAccounts.puuid, ids)));
  for (const a of linked) if (a.puuid && a.gameName && a.tagLine) out.set(a.puuid, { riotId: `${a.gameName}#${a.tagLine}`, platform: a.platform });
  const rest = ids.filter((id) => !out.has(id));
  if (!rest.length) return out;
  // game_creation is checked before the participants are read, so only newer games are opened.
  const result = await db.execute(sql`
    SELECT DISTINCT ON (p->>'puuid') p->>'puuid' AS puuid, p->>'name' AS name, d.match_id
    FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
    WHERE d.game_creation > ${since} AND p->>'puuid' IN (${sql.join(rest.map((id) => sql`${id}`), sql`, `)})
    ORDER BY p->>'puuid', d.game_creation DESC`);
  for (const r of rowsOf<Row>(result)) if (r.name?.includes("#")) out.set(r.puuid, { riotId: r.name, platform: platformOfMatchId(r.match_id) });
  return out;
}
