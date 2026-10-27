import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, rankedBlocks, rankedGames, riotAccounts } from "@/server/db/schema";
import { compareMeasure, describeEvidence, MAX_GAMES, type EvidenceResult, type EvidenceText } from "@/domain/development/evidence";
import { CS_CHECKPOINT_MS, earlyDeathsOf, MEASURES, measureValue, MIN_MEASURED_GAME_SEC, type MeasuredGame, type MeasureKey } from "@/domain/development/measures";
import { executionTrend, type ExecutionTrend } from "@/domain/development/reviews";
import { SOLO_DUO_QUEUE } from "@/domain/development/sessions";
import { valueAt } from "@/domain/matchups";
import { isRole, type Role } from "@/domain/roles";
import type { ObjectiveView } from "./repository";

/*
  The evidence behind an objective (domain/development/evidence): the player's Solo/Duo games in the
  objective's role (and champions), before practice started and since. Reads are bounded (the
  newest MAX_GAMES games of each period) and select only the figures used; a timeline statistic
  reads only the player's own CS array and death times from the stored timeline, never whole
  records, so following an objective costs a few kilobytes however long the history grows.
*/

export interface ObjectiveEvidence {
  measure: MeasureKey;
  role: Role | null;
  /** When practice started (its first session, else when it moved past Identified); null when not yet practised. */
  practiceStart: Date | null;
  result: EvidenceResult;
  text: EvidenceText | null;
  /** Before practice: the statistic's average over the recent games, as a reference. */
  reference: { games: number; mean: number } | null;
}

type Row = { matchId: string; accountId: string; gameCreation: number; gameDuration: number | null; role: string | null; championId: string | null; win: boolean | null; kills: number | null; deaths: number | null; assists: number | null; cs: number | null; visionScore: number | null; teamKills: number | null; controlWards: number | null; puuid: string | null };

/** When practising an objective started: its first session, else when it left Identified. */
export async function practiceStartOf(db: Db, ownerPlayerId: string, objective: Pick<ObjectiveView, "id" | "status" | "statusChangedAt" | "identifiedAt">): Promise<Date | null> {
  const [first] = await db.select({ at: sql<string | null>`min(${rankedBlocks.startedAt})` }).from(rankedBlocks).where(and(eq(rankedBlocks.playerId, ownerPlayerId), eq(rankedBlocks.objectiveId, objective.id)));
  if (first?.at) return new Date(first.at);
  return objective.status === "identified" ? null : objective.statusChangedAt;
}

/** The role the player plays most in their recent Solo/Duo games (UNKNOWN left out). */
export async function mainSoloRole(db: Db, accountIds: string[]): Promise<Role | null> {
  if (accountIds.length === 0) return null;
  const recent = db
    .select({ role: accountMatches.role })
    .from(accountMatches)
    .where(and(inArray(accountMatches.accountId, accountIds), eq(accountMatches.queueId, SOLO_DUO_QUEUE), sql`${accountMatches.championId} IS NOT NULL`))
    .orderBy(desc(accountMatches.gameCreation))
    .limit(40)
    .as("recent");
  const rows = await db.select({ role: recent.role, n: sql<number>`count(*)` }).from(recent).groupBy(recent.role).orderBy(desc(sql`count(*)`));
  return rows.map((r) => r.role).find((r): r is Role => isRole(r)) ?? null;
}

async function loadGames(db: Db, accountIds: string[], filter: { role: Role | null; championIds: string[]; before?: Date; from?: Date }): Promise<Row[]> {
  const where = [
    inArray(accountMatches.accountId, accountIds),
    eq(accountMatches.queueId, SOLO_DUO_QUEUE),
    sql`${accountMatches.championId} IS NOT NULL`,
    sql`${accountMatches.win} IS NOT NULL`,
    // Remakes and games cut short say nothing about a habit; a record Riot no longer serves has kills = -1.
    sql`coalesce(${accountMatches.gameDuration}, 0) >= ${MIN_MEASURED_GAME_SEC}`,
    sql`coalesce(${accountMatches.kills}, 0) >= 0`,
  ];
  if (filter.role) where.push(eq(accountMatches.role, filter.role));
  if (filter.championIds.length) where.push(inArray(accountMatches.championId, filter.championIds));
  if (filter.before) where.push(lt(accountMatches.gameCreation, filter.before.getTime()));
  if (filter.from) where.push(gte(accountMatches.gameCreation, filter.from.getTime()));
  return db
    .select({
      matchId: accountMatches.matchId,
      accountId: accountMatches.accountId,
      gameCreation: accountMatches.gameCreation,
      gameDuration: accountMatches.gameDuration,
      role: accountMatches.role,
      championId: accountMatches.championId,
      win: accountMatches.win,
      kills: accountMatches.kills,
      deaths: accountMatches.deaths,
      assists: accountMatches.assists,
      cs: accountMatches.cs,
      visionScore: accountMatches.visionScore,
      teamKills: accountMatches.teamKills,
      controlWards: sql<number | null>`(${accountMatches.extraStats}->>'controlWardsBought')::int`,
      puuid: riotAccounts.puuid,
    })
    .from(accountMatches)
    .innerJoin(riotAccounts, eq(riotAccounts.id, accountMatches.accountId))
    .where(and(...where))
    .orderBy(desc(accountMatches.gameCreation))
    .limit(MAX_GAMES);
}

/** The player's CS at ten minutes and death times, from stored timelines: only their own arrays are read. */
async function timelineFigures(db: Db, rows: Row[]): Promise<Map<string, { csAt10: number | null; earlyDeaths: number | null }>> {
  const out = new Map<string, { csAt10: number | null; earlyDeaths: number | null }>();
  const withPuuid = rows.filter((r) => r.puuid);
  if (withPuuid.length === 0) return out;
  const pairs = sql.join(withPuuid.map((r) => sql`(${r.matchId}, ${r.puuid})`), sql`, `);
  const result = await db.execute(sql`
    SELECT m.match_id, t.frames->'t' AS t, t.frames->'p'->m.puuid->'c' AS c,
      (SELECT e->'deaths' FROM jsonb_array_elements(t.participants) e WHERE e->>'puuid' = m.puuid LIMIT 1) AS deaths
    FROM (VALUES ${pairs}) AS m(match_id, puuid)
    JOIN match_timelines t ON t.match_id = m.match_id`);
  const list = ((result as { rows?: unknown[] }).rows ?? result) as Array<{ match_id: string; t: number[] | null; c: number[] | null; deaths: number[] | null }>;
  for (const r of list) {
    const t = Array.isArray(r.t) ? r.t : [];
    const c = Array.isArray(r.c) ? r.c : [];
    const csAt10 = t.length && c.length === t.length && t[t.length - 1]! >= CS_CHECKPOINT_MS ? valueAt(t, c, CS_CHECKPOINT_MS) : null;
    out.set(r.match_id, { csAt10: csAt10 === null ? null : Math.round(csAt10), earlyDeaths: Array.isArray(r.deaths) ? earlyDeathsOf(r.deaths) : null });
  }
  return out;
}

function measured(rows: Row[], timeline: Map<string, { csAt10: number | null; earlyDeaths: number | null }>): MeasuredGame[] {
  return rows.map((r) => ({
    matchId: r.matchId,
    playedAt: r.gameCreation,
    role: isRole(r.role) ? r.role : null,
    championId: r.championId ?? "",
    win: !!r.win,
    durationSec: r.gameDuration,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    cs: r.cs,
    visionScore: r.visionScore,
    teamKills: r.teamKills,
    controlWards: r.controlWards === null || r.controlWards === undefined ? null : Number(r.controlWards),
    csAt10: timeline.get(r.matchId)?.csAt10 ?? null,
    earlyDeaths: timeline.get(r.matchId)?.earlyDeaths ?? null,
  }));
}

/** The statistic behind one objective: before practice and since, or a reference while not practised yet. */
export async function objectiveEvidence(db: Db, ownerPlayerId: string, objective: ObjectiveView): Promise<ObjectiveEvidence | null> {
  if (!objective.measure) return null;
  const accounts = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
  const accountIds = accounts.map((a) => a.id);
  const measure = objective.measure;
  const role = objective.role ?? (await mainSoloRole(db, accountIds));
  const practiceStart = await practiceStartOf(db, ownerPlayerId, objective);
  if (accountIds.length === 0) return { measure, role, practiceStart, result: { state: "insufficient", measure, baseline: 0, practice: 0, needed: 5, missingPractice: 0 }, text: describeEvidence({ state: "insufficient", measure, baseline: 0, practice: 0, needed: 5, missingPractice: 0 }), reference: null };
  const filter = { role, championIds: objective.championIds };
  const timeline = MEASURES[measure].source === "timeline";
  if (!practiceStart) {
    const rows = await loadGames(db, accountIds, filter);
    const games = measured(rows, timeline ? await timelineFigures(db, rows) : new Map());
    const values = games.map((g) => measureValue(measure, g)).filter((v): v is number => v !== null);
    const reference = values.length ? { games: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length } : null;
    return { measure, role, practiceStart, result: { state: "insufficient", measure, baseline: values.length, practice: 0, needed: 5, missingPractice: 0 }, text: null, reference };
  }
  const [before, during] = await Promise.all([loadGames(db, accountIds, { ...filter, before: practiceStart }), loadGames(db, accountIds, { ...filter, from: practiceStart })]);
  const figures = timeline ? await timelineFigures(db, [...before, ...during]) : new Map();
  const result = compareMeasure(measure, measured(before, figures), measured(during, figures));
  return { measure, role, practiceStart, result, text: describeEvidence(result), reference: null };
}

/** Self-reported plan follow-through for one objective, from its reviewed games. */
export async function objectiveExecution(db: Db, ownerPlayerId: string, objectiveId: string): Promise<ExecutionTrend> {
  const rows = await db
    .select({ execution: rankedGames.execution, reviewedAt: rankedGames.reviewedAt })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.objectiveId, objectiveId), eq(rankedGames.reviewStatus, "done"), sql`${rankedGames.execution} IS NOT NULL`))
    .orderBy(desc(rankedGames.reviewedAt))
    .limit(16);
  return executionTrend(rows.map((r) => ({ execution: r.execution, reviewedAt: r.reviewedAt?.getTime() ?? 0 })));
}

/** The statistic for one session's games (the figures shown on each game in a session or review). */
export async function gameFigures(db: Db, ownerPlayerId: string, matchIds: string[]): Promise<Map<string, { kills: number | null; deaths: number | null; assists: number | null; cs: number | null; durationSec: number | null; visionScore: number | null; csAt10: number | null; earlyDeaths: number | null }>> {
  const out = new Map<string, { kills: number | null; deaths: number | null; assists: number | null; cs: number | null; durationSec: number | null; visionScore: number | null; csAt10: number | null; earlyDeaths: number | null }>();
  if (matchIds.length === 0) return out;
  const rows = await db
    .select({ matchId: accountMatches.matchId, accountId: accountMatches.accountId, gameCreation: accountMatches.gameCreation, gameDuration: accountMatches.gameDuration, role: accountMatches.role, championId: accountMatches.championId, win: accountMatches.win, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, cs: accountMatches.cs, visionScore: accountMatches.visionScore, teamKills: accountMatches.teamKills, controlWards: sql<number | null>`null`, puuid: riotAccounts.puuid })
    .from(accountMatches)
    .innerJoin(riotAccounts, eq(riotAccounts.id, accountMatches.accountId))
    .where(and(eq(riotAccounts.playerId, ownerPlayerId), inArray(accountMatches.matchId, matchIds)));
  const timeline = await timelineFigures(db, rows);
  for (const r of rows) {
    const known = r.kills !== null && r.kills >= 0;
    out.set(r.matchId, { kills: known ? r.kills : null, deaths: known ? r.deaths : null, assists: known ? r.assists : null, cs: r.cs, durationSec: r.gameDuration, visionScore: r.visionScore, csAt10: timeline.get(r.matchId)?.csAt10 ?? null, earlyDeaths: timeline.get(r.matchId)?.earlyDeaths ?? null });
  }
  return out;
}
