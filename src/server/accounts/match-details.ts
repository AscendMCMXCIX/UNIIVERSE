import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, type MatchParticipantDetail, type MatchTeamDetail, type ParticipantExtraStats } from "@/server/db/schema";
import type { RiotMatch, RiotParticipant } from "@/server/riot/api/schemas";
import { erasureFilter, type ErasureFilter } from "@/server/privacy/ledger";
import { redactParticipants } from "@/server/privacy/redact";
import { summariseMatches } from "./match-summary";

/*
  Compact match records for the personal match history. Built from a match the account sync has
  already fetched (no extra request) and stored once per match. Missing fields stay null; nothing
  is invented.
*/

const opt = (v: number | undefined): number | null => (typeof v === "number" ? v : null);

/**
 * The match records any of these players appear in, found through the players' index
 * (match_details_puuids_idx), so a search for a few players opens only their games' records. The
 * expression must stay the index's own. `participants`: the column as the query names it.
 */
export function playedIn(puuids: readonly string[], participants: SQL = sql`d.participants`): SQL {
  return sql`jsonb_path_query_array(${participants}, '$[*].puuid') ?| ARRAY[${sql.join(puuids.map((p) => sql`${p}`), sql`, `)}]::text[]`;
}

export function participantDetail(p: RiotParticipant, keyToId: Map<number, string>): MatchParticipantDetail {
  const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
  const hasItems = items.some((i) => typeof i === "number");
  const styles = p.perks?.styles ?? [];
  const primary = styles.find((s) => s.description === "primaryStyle") ?? styles[0];
  const secondary = styles.find((s) => s.description === "subStyle") ?? styles[1];
  const name = p.riotIdGameName ? `${p.riotIdGameName}${p.riotIdTagline ? `#${p.riotIdTagline}` : ""}` : p.summonerName || null;
  return {
    puuid: p.puuid,
    name,
    teamId: p.teamId,
    championId: keyToId.get(p.championId) ?? p.championName ?? null,
    championKey: p.championId,
    champLevel: opt(p.champLevel),
    position: p.teamPosition || p.individualPosition || null,
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.totalMinionsKilled === undefined && p.neutralMinionsKilled === undefined ? null : (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    gold: opt(p.goldEarned),
    damage: opt(p.totalDamageDealtToChampions),
    damageTaken: opt(p.totalDamageTaken),
    vision: opt(p.visionScore),
    wardsPlaced: opt(p.wardsPlaced),
    items: hasItems ? items.map((i) => i ?? 0) : null,
    spells: typeof p.summoner1Id === "number" && typeof p.summoner2Id === "number" ? [p.summoner1Id, p.summoner2Id] : null,
    stats: extraStats(p),
    runes: p.perks ? { keystone: primary?.selections[0]?.perk ?? null, primary: primary?.style ?? null, secondary: secondary?.style ?? null, primaryPerks: primary?.selections.map((x) => x.perk) ?? [], secondaryPerks: secondary?.selections.map((x) => x.perk) ?? [] } : null,
  };
}

/** The leaderboard figures Riot sent for this participant (fields it left out stay absent). */
export function extraStats(p: RiotParticipant): ParticipantExtraStats {
  const out: ParticipantExtraStats = {};
  const num = (k: keyof ParticipantExtraStats, v: number | undefined) => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) (out as Record<string, number>)[k] = v;
  };
  num("doubleKills", p.doubleKills);
  num("tripleKills", p.tripleKills);
  num("quadraKills", p.quadraKills);
  num("pentaKills", p.pentaKills);
  num("largestMultiKill", p.largestMultiKill);
  num("largestKillingSpree", p.largestKillingSpree);
  num("wardsKilled", p.wardsKilled);
  num("controlWardsBought", p.visionWardsBoughtInGame);
  num("objectiveDamage", p.damageDealtToObjectives);
  num("buildingDamage", p.damageDealtToBuildings);
  num("turretTakedowns", p.turretTakedowns);
  num("ccSeconds", p.timeCCingOthers);
  num("soloKills", p.challenges?.soloKills);
  if (typeof p.firstBloodKill === "boolean") out.firstBloodKill = p.firstBloodKill;
  if (typeof p.firstBloodAssist === "boolean") out.firstBloodAssist = p.firstBloodAssist;
  return out;
}

/** The stored record of a Riot game; with `erased`, everyone whose personal data was erased becomes a "Removed player". */
export function matchDetailRow(platform: string | null, match: RiotMatch, keyToId: Map<number, string>, erased?: ErasureFilter): typeof matchDetails.$inferInsert {
  const teams: MatchTeamDetail[] = match.info.teams.map((t) => ({
    teamId: t.teamId,
    win: t.win,
    bans: t.bans.map((b) => keyToId.get(b.championId)).filter((id): id is string => !!id),
    objectives: Object.fromEntries(Object.entries(t.objectives ?? {}).map(([k, v]) => [k, v.kills ?? 0])),
  }));
  return {
    matchId: match.metadata.matchId,
    platform,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
    gameDuration: match.info.gameDuration,
    gameVersion: match.info.gameVersion,
    teams,
    participants: redactParticipants(
      match.info.participants.map((p) => participantDetail(p, keyToId)),
      (p) => !!erased && erased.participant(p),
    ).participants,
  };
}

/**
 * Stores a match's details once (a second account in the same game changes nothing), and copies
 * each linked player's figures onto their stored game. Anyone whose personal data was erased is
 * stored as a "Removed player" (server/privacy).
 */
export async function storeMatchDetail(db: Db, platform: string | null, match: RiotMatch, keyToId: Map<number, string>, options: { summarise?: boolean } = {}): Promise<void> {
  const erased = await erasureFilter(db);
  await db.insert(matchDetails).values(matchDetailRow(platform, match, keyToId, erased)).onConflictDoNothing();
  await erased.remember(db);
  // The caller may summarise once itself, after it has stored the game's ledger row (foldMatch).
  if (options.summarise !== false) await summariseMatches(db, { matchIds: [match.metadata.matchId], maxBatches: 1 });
}

/** Stored games of an account whose details are not kept yet, newest first (for the backfill). */
export async function matchesWithoutDetails(db: Db, accountId: string, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const rows = await db
    .select({ matchId: accountMatches.matchId })
    .from(accountMatches)
    .where(and(eq(accountMatches.accountId, accountId), isNotNull(accountMatches.championId), sql`coalesce(${accountMatches.kills}, 0) >= 0`, sql`NOT EXISTS (SELECT 1 FROM match_details d WHERE d.match_id = ${accountMatches.matchId})`))
    .orderBy(desc(accountMatches.gameCreation))
    .limit(limit);
  return rows.map((r) => r.matchId);
}

/**
 * Marks a stored game whose full record Riot no longer returns: an empty record (no players), so
 * the backfill does not ask again and the match history can say the details are unavailable.
 */
export async function storeMatchUnavailable(db: Db, accountId: string, matchId: string): Promise<void> {
  const [row] = await db.select({ gameCreation: accountMatches.gameCreation, gameDuration: accountMatches.gameDuration, queueId: accountMatches.queueId }).from(accountMatches).where(and(eq(accountMatches.accountId, accountId), eq(accountMatches.matchId, matchId)));
  if (!row) return;
  await db.insert(matchDetails).values({ matchId, platform: null, queueId: row.queueId, gameCreation: row.gameCreation, gameDuration: row.gameDuration ?? 0, gameVersion: null, teams: [], participants: [] }).onConflictDoNothing();
  await summariseMatches(db, { matchIds: [matchId], maxBatches: 1 });
}
