import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { MemberSide, MembersInGame } from "@/domain/history-refine";

/*
  Team members in a player's stored games, for Match History's Refine: which members played each
  game on the player's side and which on the other. A member is a current team member (the rule of
  the match cards, matches/compositions teamMembersByPuuid: on the team, not archived, a team
  member) with a verified linked account (a PUUID); they were in a game when that account's own
  stored games hold it, the rule of Team → Matches → Played together, never by name. The sides are
  each stored game's team_id, copied from its record when the record is stored
  (accounts/match-summary), so no record's JSON is read here: a game whose record is not stored, or
  not summarised yet, places nobody. No Riot request.

  Two narrow reads over the games the other filters leave, both counted in the database through
  account_matches' keys: how many of them each member played with the player and against them (a
  row per member: the choices), and, only while a member is chosen, the games that member (or any
  member) played on the side chosen.
*/

export interface HistoryMember {
  id: string;
  name: string;
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const uuids = (ids: readonly string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** The team's other current members with a verified linked account, by name, with those accounts. */
export async function historyMembers(db: Db, teamId: string, playerId: string): Promise<Array<HistoryMember & { accountIds: string[] }>> {
  const rows = rowsOf<{ id: string; name: string; account_id: string }>(
    await db.execute(sql`
      SELECT p.id, p.display_name AS name, ra.id AS account_id
      FROM players p
      JOIN riot_accounts ra ON ra.player_id = p.id AND ra.owner_type = 'player' AND ra.puuid IS NOT NULL
      WHERE p.team_id = ${teamId}::uuid AND p.archived_at IS NULL AND p.team_member AND p.id <> ${playerId}::uuid`),
  );
  const out = new Map<string, HistoryMember & { accountIds: string[] }>();
  for (const r of rows) {
    const m = out.get(r.id) ?? { id: r.id, name: r.name, accountIds: [] };
    m.accountIds.push(String(r.account_id));
    out.set(r.id, m);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type Scope = { accountIds: readonly string[]; matchIds: readonly string[]; members: ReadonlyArray<{ id: string; accountIds: readonly string[] }> };

/**
 * The games, among `matchIds`, with each member on the player's side or the other, one row per
 * member and game: what both reads below build on. The player's side is read from their own
 * stored game (any of their accounts; one per match).
 */
function placements(o: Scope) {
  const memberOf = sql.join(
    o.members.flatMap((m) => m.accountIds.map((a) => sql`(${a}::uuid, ${m.id}::uuid)`)),
    sql`, `,
  );
  return sql`
    WITH member(account_id, player_id) AS (VALUES ${memberOf}),
    mine AS (
      SELECT DISTINCT ON (am.match_id) am.match_id, am.team_id
      FROM account_matches am
      WHERE am.account_id IN (${uuids(o.accountIds)}) AND am.match_id IN (${sql.join(o.matchIds.map((id) => sql`${id}`), sql`, `)}) AND am.team_id IS NOT NULL
      ORDER BY am.match_id, am.account_id
    ),
    placed AS (
      SELECT DISTINCT m.match_id, mb.player_id, o.team_id = m.team_id AS same_side
      FROM mine m
      JOIN account_matches o ON o.match_id = m.match_id AND o.team_id IS NOT NULL
      JOIN member mb ON mb.account_id = o.account_id
    )`;
}

/** How many of these games each member played with the player and against them (members with none are left out). */
export async function memberGameCounts(db: Db, o: Scope): Promise<Map<string, { with: number; against: number }>> {
  const members = o.members.filter((m) => m.accountIds.length);
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
 * The member placements in the games the chosen member (or, for "any", any member) played on the
 * side chosen, by match: what Refine's member choice keeps (domain/history-refine refineGames).
 */
export async function memberPlacements(db: Db, o: Scope & { chosen: { side: MemberSide; id: string } }): Promise<Map<string, MembersInGame>> {
  const members = o.members.filter((m) => m.accountIds.length && (o.chosen.id === "any" || m.id === o.chosen.id));
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
