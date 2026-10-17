import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts } from "@/server/db/schema";

/*
  Both teams of a Riot game, as the match lists show them (a player's Match History and Team →
  Matches): each side's five champions in lane order, with the name Riot gave for each player,
  which of them is the player the list is about, and which are UNIIVERSE team members (by their
  linked Riot accounts). Only stored match details are used: no Riot request, no guessed names,
  and nothing about who queued together. A game without its full record has no composition.
*/

/** One player of a game, as the composition preview shows them. */
export interface CompSlot {
  championId: string | null;
  /** The Riot name without its tag; null when Riot did not provide one. */
  name: string | null;
  /** A current team member on this Riot account (their profile and display name), else null. */
  member: { id: string; name: string } | null;
  /** The player whose list this is. */
  you: boolean;
}

export interface Composition {
  blue: CompSlot[];
  red: CompSlot[];
  /** The side of the player (or the team members) the list is about; null when not known. */
  side: "blue" | "red" | null;
}

/** The few fields of a participant a composition needs. */
export interface CompParticipant {
  puuid: string;
  championId: string | null;
  name: string | null;
  teamId: number;
  position: string | null;
}

/** Riot's positions (and the demo's role names) in lane order; anything else after them. */
const LANE: Record<string, number> = { TOP: 0, JUNGLE: 1, MIDDLE: 2, MID: 2, BOTTOM: 3, ADC: 3, UTILITY: 4, SUPPORT: 4 };
const lane = (p: CompParticipant) => LANE[p.position ?? ""] ?? 5;

export const BLUE_TEAM = 100;
export const RED_TEAM = 200;

export function compositionOf(participants: readonly CompParticipant[], members: ReadonlyMap<string, { id: string; name: string }>, you: (puuid: string) => boolean, focusTeamId: number | null): Composition | null {
  // Only a full record: ten players, five a side.
  if (participants.length !== 10) return null;
  const side = (teamId: number) =>
    participants
      .filter((p) => p.teamId === teamId)
      .sort((a, b) => lane(a) - lane(b))
      .map((p): CompSlot => ({ championId: p.championId, name: p.name ? p.name.split("#")[0]!.trim() || null : null, member: members.get(p.puuid) ?? null, you: you(p.puuid) }));
  const blue = side(BLUE_TEAM);
  const red = side(RED_TEAM);
  if (blue.length !== 5 || red.length !== 5) return null;
  return { blue, red, side: focusTeamId === BLUE_TEAM ? "blue" : focusTeamId === RED_TEAM ? "red" : null };
}

/**
 * The current team members among these Riot accounts (one query): puuid → their profile id and
 * display name. Archived, personal-use and other teams' profiles are not members.
 */
export async function teamMembersByPuuid(db: Db, teamId: string, puuids: readonly string[]): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(puuids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  // The same membership rule as listPlayers (on the team, not archived, a team member), in one
  // indexed query instead of loading every profile with its pools.
  const rows = await db
    .select({ puuid: riotAccounts.puuid, playerId: players.id, name: players.displayName })
    .from(riotAccounts)
    .innerJoin(players, eq(players.id, riotAccounts.playerId))
    .where(and(inArray(riotAccounts.puuid, unique), eq(riotAccounts.ownerType, "player"), eq(players.teamId, teamId), isNull(players.archivedAt), eq(players.teamMember, true)));
  return new Map(rows.filter((r): r is typeof r & { puuid: string } => !!r.puuid).map((r) => [r.puuid, { id: r.playerId, name: r.name }]));
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/**
 * The participants of these games, reduced in the database to the five fields a composition
 * needs (not the stored items, runes and figures), for lists that do not load the full details.
 */
export async function loadCompositionParticipants(db: Db, matchIds: readonly string[]): Promise<Map<string, CompParticipant[]>> {
  const ids = [...new Set(matchIds)];
  if (ids.length === 0) return new Map();
  const result = await db.execute(sql`
    SELECT md.match_id,
           json_agg(json_build_array(p->>'puuid', p->>'championId', p->>'name', (p->>'teamId')::int, p->>'position') ORDER BY t.ord) AS parts
    FROM match_details md
    CROSS JOIN LATERAL jsonb_array_elements(md.participants) WITH ORDINALITY AS t(p, ord)
    WHERE md.match_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    GROUP BY md.match_id`);
  const out = new Map<string, CompParticipant[]>();
  for (const row of rowsOf<{ match_id: string; parts: unknown }>(result)) {
    const parts = (typeof row.parts === "string" ? JSON.parse(row.parts) : row.parts) as Array<[string, string | null, string | null, number, string | null]>;
    out.set(
      row.match_id,
      parts.map(([puuid, championId, name, teamId, position]) => ({ puuid, championId, name, teamId: Number(teamId), position })),
    );
  }
  return out;
}
