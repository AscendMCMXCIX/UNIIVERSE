import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { playedIn } from "@/server/accounts/match-details";
import type { MemberSide, MembersInGame } from "@/domain/history-refine";

/*
  Team members in a player's stored games, for Match History's Refine: which members the stored
  record of each game places on the player's side and which on the other. A member is a current
  team member (the rule of the match cards, matches/compositions teamMembersByPuuid: on the team,
  not archived, a team member) found by their linked accounts' PUUIDs, never by name; the player's
  own side is read from the same record, from their own linked account. Games stored without a
  record (or with the player's entry removed) place nobody. No Riot request.

  Two narrow reads over the games the other filters leave, both counted in the database and found
  through the players index (match_details_puuids_idx): how many of them each member played with
  the player and against them (a row per member: the choices), and, only while a member is chosen,
  the games that member (or any member) was in.
*/

export interface HistoryMember {
  id: string;
  name: string;
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** The team's other current members with a linked account, by name. */
export async function historyMembers(db: Db, teamId: string, playerId: string): Promise<Array<HistoryMember & { puuids: string[] }>> {
  const rows = rowsOf<{ id: string; name: string; puuid: string }>(
    await db.execute(sql`
      SELECT p.id, p.display_name AS name, ra.puuid
      FROM players p
      JOIN riot_accounts ra ON ra.player_id = p.id AND ra.owner_type = 'player' AND ra.puuid IS NOT NULL
      WHERE p.team_id = ${teamId}::uuid AND p.archived_at IS NULL AND p.team_member AND p.id <> ${playerId}::uuid`),
  );
  const out = new Map<string, HistoryMember & { puuids: string[] }>();
  for (const r of rows) {
    const m = out.get(r.id) ?? { id: r.id, name: r.name, puuids: [] };
    m.puuids.push(r.puuid);
    out.set(r.id, m);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The games, among `matchIds`, with each member on the player's side or the other, one row per member and game: what both reads below build on. */
function placements(o: { accountIds: readonly string[]; matchIds: readonly string[]; members: ReadonlyArray<{ id: string; puuids: readonly string[] }> }) {
  const puuids = o.members.flatMap((m) => m.puuids);
  const memberOf = sql.join(
    o.members.flatMap((m) => m.puuids.map((p) => sql`(${p}, ${m.id}::uuid)`)),
    sql`, `,
  );
  return sql`
    WITH member(puuid, player_id) AS (VALUES ${memberOf}),
    mine AS (SELECT puuid FROM riot_accounts WHERE id IN (${sql.join(o.accountIds.map((id) => sql`${id}::uuid`), sql`, `)}) AND puuid IS NOT NULL),
    placed AS (
      SELECT DISTINCT d.match_id, m.player_id, (x->>'teamId') = (me->>'teamId') AS same_side
      FROM match_details d
      CROSS JOIN LATERAL jsonb_array_elements(d.participants) x
      JOIN member m ON m.puuid = x->>'puuid'
      CROSS JOIN LATERAL (SELECT y FROM jsonb_array_elements(d.participants) y WHERE y->>'puuid' IN (SELECT puuid FROM mine) LIMIT 1) AS own(me)
      WHERE ${playedIn(puuids)}
        AND d.match_id IN (${sql.join(o.matchIds.map((id) => sql`${id}`), sql`, `)})
        AND x->>'teamId' IS NOT NULL AND me->>'teamId' IS NOT NULL
    )`;
}

/** How many of these games each member played with the player and against them (members with none are left out). */
export async function memberGameCounts(db: Db, o: { accountIds: readonly string[]; matchIds: readonly string[]; members: ReadonlyArray<{ id: string; puuids: readonly string[] }> }): Promise<Map<string, { with: number; against: number }>> {
  const members = o.members.filter((m) => m.puuids.length);
  if (!members.length || !o.matchIds.length || !o.accountIds.length) return new Map();
  const rows = rowsOf<{ player_id: string; with_games: number | string; against_games: number | string }>(
    await db.execute(sql`
      ${placements({ ...o, members })}
      SELECT player_id, count(*) FILTER (WHERE same_side) AS with_games, count(*) FILTER (WHERE NOT same_side) AS against_games
      FROM placed GROUP BY player_id`),
  );
  return new Map(rows.map((r) => [String(r.player_id), { with: Number(r.with_games), against: Number(r.against_games) }]));
}

/**
 * The member placements in the games the chosen member (or, for "any", any member) was in, on
 * the side chosen, by match: what Refine's member choice keeps (domain/history-refine refineGames).
 */
export async function memberPlacements(db: Db, o: { accountIds: readonly string[]; matchIds: readonly string[]; members: ReadonlyArray<{ id: string; puuids: readonly string[] }>; chosen: { side: MemberSide; id: string } }): Promise<Map<string, MembersInGame>> {
  const members = o.members.filter((m) => m.puuids.length && (o.chosen.id === "any" || m.id === o.chosen.id));
  if (!members.length || !o.matchIds.length || !o.accountIds.length) return new Map();
  const rows = rowsOf<{ match_id: string; player_id: string; same_side: boolean }>(
    await db.execute(sql`
      ${placements({ ...o, members })}
      SELECT match_id, player_id, same_side FROM placed WHERE same_side = ${o.chosen.side === "with"}`),
  );
  const out = new Map<string, { with: string[]; against: string[] }>();
  for (const r of rows) {
    const entry = out.get(r.match_id) ?? { with: [], against: [] };
    entry[r.same_side ? "with" : "against"].push(String(r.player_id));
    out.set(r.match_id, entry);
  }
  return out;
}
