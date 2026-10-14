import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { champions, draftEnemyScouting, drafts, type EnemyChampionEvidence, type EnemyPlayerNames } from "@/server/db/schema";
import { ROLES, RIOT_POSITION_TO_ROLE, type Role } from "@/domain/roles";
import { patchFromVersion } from "@/domain/patch";
import { normaliseRiotRegionAnswer } from "@/domain/riot-platforms";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { parseRiotId } from "@/server/accounts/repository";
import { friendlyAccountError } from "@/server/accounts/sync";
import { recordRiotOutcome } from "@/server/riot/credential";
import { defaultPlatform } from "@/server/auth/signup";
import { buildEnemyTendencies, type EnemyEvidenceInput, type EnemyTendencies } from "@/domain/engine/tendencies";
import type { ChampionInfo, StatsProvider } from "@/domain/engine/types";
import type { ChampionHistoryEvidence, MasteryEvidence } from "@/domain/proficiency";
import type { ScoutedPlayer } from "@/domain/scouting";
import { inferEnemyRoles } from "@/domain/scouting/enemy-slots";
import { log } from "@/server/observability/log";

/*
  Session scouting. An enemy Riot ID entered on a draft is looked up once, with a bounded
  budget, and the few facts that matter for drafting are stored on the draft itself
  (draft_enemy_scouting): server, rank, per-champion games/wins/recency and mastery. There is no
  opponent database: rows live and die with the draft, and the next game of a series reuses a
  fresh row rather than building a profile. Riot being down never blocks anything: the row says
  "pending" and the draft works from global evidence alone.
*/

export interface EnemyScoutingView {
  /** Storage slot the player was entered in (entry order); NOT a role. */
  role: Role;
  /** Role inferred from the player's own games, when they point somewhere. */
  likelyRole: Role | null;
  /** 0..1 share of their games in that role. */
  roleCertainty: number;
  riotId: string;
  platform: string | null;
  status: "pending" | "verified" | "ok" | "unresolved" | "failed";
  error: string | null;
  rank: string | null;
  gamesAnalysed: number;
  fetchedAt: string | null;
}

export interface ScoutOptions {
  client: RiotApiClient | null;
  /** Soft budget for the whole roster; roles not reached stay pending. */
  deadlineMs?: number;
  /** Recent matches fetched per enemy (each is one Riot request). */
  maxMatchesPerEnemy?: number;
  /** Evidence from another draft for the same Riot ID is reused when newer than this. */
  reuseWithinHours?: number;
  /** Patch the draft is played on (current-patch games are counted separately). */
  currentPatch?: string | null;
  /** Only these entry slots (one enemy at a time from the scouting page); default: every slot. */
  onlyRoles?: Role[];
  now?: Date;
  log?: (m: string) => void;
}

export interface ScoutSummary {
  scouted: number;
  reused: number;
  pending: number;
  unresolved: number;
  skipped: number;
}

/** Riot IDs among the entered enemy names (anything with a #TAG); plain names are kept for the record only. */
export function enemyRiotIds(names: EnemyPlayerNames): Array<{ role: Role; riotId: string; gameName: string; tagLine: string }> {
  const out: Array<{ role: Role; riotId: string; gameName: string; tagLine: string }> = [];
  for (const role of ROLES) {
    const raw = (names[role] ?? "").trim();
    const parsed = raw.includes("#") ? parseRiotId(raw) : null;
    if (parsed) out.push({ role, riotId: `${parsed.gameName}#${parsed.tagLine}`, ...parsed });
  }
  return out;
}

const RANKED_QUEUES = [420, 440];

/** Scouts every enemy Riot ID on a draft that has not been scouted yet (or whose Riot ID changed). */
export async function scoutDraftEnemies(db: Db, draftId: string, options: ScoutOptions): Promise<ScoutSummary> {
  const summary: ScoutSummary = { scouted: 0, reused: 0, pending: 0, unresolved: 0, skipped: 0 };
  const [draft] = await db.select({ id: drafts.id, enemyPlayers: drafts.enemyPlayers, patch: drafts.patch }).from(drafts).where(eq(drafts.id, draftId));
  if (!draft) return summary;
  const wanted = enemyRiotIds(draft.enemyPlayers ?? {}).filter((w) => !options.onlyRoles || options.onlyRoles.includes(w.role));
  const existing = await db.select().from(draftEnemyScouting).where(eq(draftEnemyScouting.draftId, draftId));
  // Roles whose entry is no longer a Riot ID lose their scouting row.
  const stale = existing.filter((row) => (!options.onlyRoles || options.onlyRoles.includes(row.role)) && !wanted.some((w) => w.role === row.role));
  if (stale.length) await db.delete(draftEnemyScouting).where(and(eq(draftEnemyScouting.draftId, draftId), inArray(draftEnemyScouting.role, stale.map((r) => r.role))));
  const started = Date.now();
  const deadline = options.deadlineMs ?? 25_000;
  const now = options.now ?? new Date();
  const currentPatch = options.currentPatch ?? draft.patch;
  const logLine = options.log ?? (() => {});
  let changed = stale.length > 0;
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));

  for (const w of wanted) {
    const row = existing.find((r) => r.role === w.role);
    if (row && row.riotId.toLowerCase() === w.riotId.toLowerCase() && row.status === "ok") {
      summary.skipped += 1;
      continue;
    }
    changed = true;
    // Reuse a recent answer for the same Riot ID (a Bo3's next game, a re-entered name).
    const reuseAfter = new Date(now.getTime() - (options.reuseWithinHours ?? 24) * 3_600_000);
    const [recent] = await db
      .select()
      .from(draftEnemyScouting)
      .where(and(sql`lower(${draftEnemyScouting.riotId}) = ${w.riotId.toLowerCase()}`, eq(draftEnemyScouting.status, "ok"), sql`${draftEnemyScouting.fetchedAt} >= ${reuseAfter.toISOString()}::timestamptz`))
      .orderBy(desc(draftEnemyScouting.fetchedAt))
      .limit(1);
    if (recent) {
      await upsert(db, draftId, w.role, { riotId: w.riotId, platform: recent.platform, puuid: recent.puuid, status: "ok", error: null, tier: recent.tier, division: recent.division, leaguePoints: recent.leaguePoints, rankedWins: recent.rankedWins, rankedLosses: recent.rankedLosses, champions: recent.champions, gamesAnalysed: recent.gamesAnalysed, fetchedAt: recent.fetchedAt });
      summary.reused += 1;
      continue;
    }
    if (!options.client) {
      await upsert(db, draftId, w.role, { riotId: w.riotId, status: "pending", error: "Riot data is not available on the server yet; the draft uses global evidence for this player." });
      summary.pending += 1;
      continue;
    }
    if (Date.now() - started > deadline) {
      await upsert(db, draftId, w.role, { riotId: w.riotId, status: "pending", error: "Scouting did not finish in time; refresh scouting to try again." });
      summary.pending += 1;
      continue;
    }
    const client = options.client;
    try {
      // Already verified on the scouting page: reuse the identity instead of asking Riot again.
      const known = row && row.riotId.toLowerCase() === w.riotId.toLowerCase() && row.puuid ? { puuid: row.puuid, platform: row.platform } : null;
      const puuid = known?.puuid ?? (await client.accountByRiotId(defaultPlatform(), w.gameName, w.tagLine)).puuid;
      let platform = known?.platform ?? defaultPlatform();
      if (!known?.platform) {
        try {
          const active = normaliseRiotRegionAnswer(await client.activePlatformByPuuid(platform, puuid));
          if (active) platform = active;
        } catch (err) {
          if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
        }
      }
      let rank: { tier: string | null; division: string | null; lp: number | null; wins: number | null; losses: number | null } = { tier: null, division: null, lp: null, wins: null, losses: null };
      try {
        const entries = await client.leagueEntriesByPuuid(platform, puuid);
        const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? entries.find((e) => e.queueType === "RANKED_FLEX_SR");
        if (solo) rank = { tier: solo.tier ?? null, division: solo.rank ?? null, lp: solo.leaguePoints, wins: solo.wins, losses: solo.losses };
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
      }
      const mastery = new Map<string, { points: number; level: number }>();
      try {
        for (const m of await client.championMasteries(platform, puuid)) {
          const id = keyToId.get(m.championId);
          if (id) mastery.set(id, { points: m.championPoints, level: m.championLevel });
        }
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
      }
      const ids = await client.allMatchIdsByPuuid(platform, puuid, { startTime: Math.floor(now.getTime() / 1000) - 60 * 86_400, count: 30 });
      const evidence = new Map<string, EnemyChampionEvidence>();
      let analysed = 0;
      for (const matchId of ids) {
        if (analysed >= (options.maxMatchesPerEnemy ?? 12) || Date.now() - started > deadline) break;
        let match;
        try {
          match = await client.match(platform, matchId);
        } catch (err) {
          if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
          continue;
        }
        if (!RANKED_QUEUES.includes(match.info.queueId) || match.info.gameDuration < 300) continue;
        const me = match.info.participants.find((p) => p.puuid === puuid);
        const championId = me ? keyToId.get(me.championId) : undefined;
        if (!me || !championId) continue;
        analysed += 1;
        const role = RIOT_POSITION_TO_ROLE[me.teamPosition] ?? "UNKNOWN";
        const playedAt = new Date(match.info.gameCreation);
        const key = `${championId}|${role}`;
        const e = evidence.get(key) ?? { championId, role, games: 0, wins: 0, recentGames: 0, patchGames: 0, lastPlayedAt: null, masteryPoints: mastery.get(championId)?.points ?? null, masteryLevel: mastery.get(championId)?.level ?? null };
        e.games += 1;
        if (me.win) e.wins += 1;
        if (now.getTime() - playedAt.getTime() <= 30 * 86_400_000) e.recentGames += 1;
        if (currentPatch && patchFromVersion(match.info.gameVersion) === currentPatch) e.patchGames += 1;
        if (!e.lastPlayedAt || new Date(e.lastPlayedAt) < playedAt) e.lastPlayedAt = playedAt.toISOString();
        evidence.set(key, e);
      }
      // Mastery-only champions (not seen in the sampled games) still say what the player is familiar with.
      for (const [championId, m] of [...mastery.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, 8)) {
        if ([...evidence.values()].some((e) => e.championId === championId)) continue;
        evidence.set(`${championId}|UNKNOWN`, { championId, role: "UNKNOWN", games: 0, wins: 0, recentGames: 0, patchGames: 0, lastPlayedAt: null, masteryPoints: m.points, masteryLevel: m.level });
      }
      await upsert(db, draftId, w.role, { riotId: w.riotId, platform, puuid, status: "ok", error: null, tier: rank.tier, division: rank.division, leaguePoints: rank.lp, rankedWins: rank.wins, rankedLosses: rank.losses, champions: [...evidence.values()], gamesAnalysed: analysed, fetchedAt: now });
      await recordRiotOutcome(db, client, { ok: true });
      summary.scouted += 1;
      logLine(`scouted ${w.riotId} (${w.role}): ${analysed} ranked games, ${evidence.size} champions`);
    } catch (err) {
      const f = friendlyAccountError(err, "resolve");
      const status = f.status === "unresolved" ? "unresolved" : f.status === "failed" ? "failed" : "pending";
      await upsert(db, draftId, w.role, { riotId: w.riotId, status, error: f.message });
      if (status === "unresolved") summary.unresolved += 1;
      else summary.pending += 1;
      if (!(err instanceof RiotApiError && err.status === 404)) await recordRiotOutcome(db, client, { ok: false, error: err });
      logLine(`scouting ${w.riotId} failed: ${(err as Error).message}`);
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) {
        // The key is rejected: every remaining role gets the same answer without more requests.
        for (const rest of wanted.slice(wanted.indexOf(w) + 1)) {
          await upsert(db, draftId, rest.role, { riotId: rest.riotId, status: "pending", error: f.message });
          summary.pending += 1;
        }
        break;
      }
    }
  }
  if (changed) {
    // A new version makes the room refetch and the recommendation memo miss.
    await db.update(drafts).set({ version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
    globalThis.__uniiverseRecommendationCache = undefined;
  }
  return summary;
}

type UpsertPatch = Partial<Omit<typeof draftEnemyScouting.$inferInsert, "draftId" | "role">> & { riotId: string; status: string };

async function upsert(db: Db, draftId: string, role: Role, patch: UpsertPatch): Promise<void> {
  await db
    .insert(draftEnemyScouting)
    .values({ draftId, role, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [draftEnemyScouting.draftId, draftEnemyScouting.role], set: { ...patch, updatedAt: new Date() } });
}

export type EnemyCheck =
  | { status: "empty" }
  | { status: "invalid"; error: string }
  | { status: "ready"; reused: true }
  | { status: "verified" }
  | { status: "unresolved" | "failed" | "pending"; error: string };

/**
 * The fast first step for one enemy entry on the scouting page: is it a Riot ID, does Riot know
 * it, and do we already hold recent scouting for that player? Verifying stores the identity
 * (status "verified"); the slower evidence (rank, mastery, recent ranked games) is collected
 * afterwards by scoutDraftEnemies for this slot only. Riot being unavailable never blocks: the
 * entry is kept as pending and the draft works from global evidence.
 */
export async function verifyEnemy(db: Db, draftId: string, slot: Role, client: RiotApiClient | null, now = new Date()): Promise<EnemyCheck> {
  const [draft] = await db.select({ enemyPlayers: drafts.enemyPlayers }).from(drafts).where(eq(drafts.id, draftId));
  const raw = (draft?.enemyPlayers?.[slot] ?? "").trim();
  if (!raw) {
    await db.delete(draftEnemyScouting).where(and(eq(draftEnemyScouting.draftId, draftId), eq(draftEnemyScouting.role, slot)));
    return { status: "empty" };
  }
  const parsed = raw.includes("#") ? parseRiotId(raw) : null;
  if (!parsed) return { status: "invalid", error: "Use the Riot ID with its tag, for example Name#OCE." };
  const riotId = `${parsed.gameName}#${parsed.tagLine}`;
  const [row] = await db.select().from(draftEnemyScouting).where(and(eq(draftEnemyScouting.draftId, draftId), eq(draftEnemyScouting.role, slot)));
  if (row && row.riotId.toLowerCase() === riotId.toLowerCase() && (row.status === "ok" || row.status === "verified")) return row.status === "ok" ? { status: "ready", reused: true } : { status: "verified" };
  // Recent scouting of the same player (an earlier game of a series, a re-entered name) is used at once.
  const reuseAfter = new Date(now.getTime() - 24 * 3_600_000);
  const [recent] = await db
    .select()
    .from(draftEnemyScouting)
    .where(and(sql`lower(${draftEnemyScouting.riotId}) = ${riotId.toLowerCase()}`, eq(draftEnemyScouting.status, "ok"), sql`${draftEnemyScouting.fetchedAt} >= ${reuseAfter.toISOString()}::timestamptz`))
    .orderBy(desc(draftEnemyScouting.fetchedAt))
    .limit(1);
  if (recent) {
    await upsert(db, draftId, slot, { riotId, platform: recent.platform, puuid: recent.puuid, status: "ok", error: null, tier: recent.tier, division: recent.division, leaguePoints: recent.leaguePoints, rankedWins: recent.rankedWins, rankedLosses: recent.rankedLosses, champions: recent.champions, gamesAnalysed: recent.gamesAnalysed, fetchedAt: recent.fetchedAt });
    await bumpDraftVersion(db, draftId);
    return { status: "ready", reused: true };
  }
  if (!client) {
    await upsert(db, draftId, slot, { riotId, status: "pending", error: "Riot data is not available on the server; the draft uses global evidence for this player." });
    return { status: "pending", error: "Riot data is not available right now." };
  }
  try {
    const account = await client.accountByRiotId(defaultPlatform(), parsed.gameName, parsed.tagLine);
    let platform = defaultPlatform();
    try {
      const active = normaliseRiotRegionAnswer(await client.activePlatformByPuuid(platform, account.puuid));
      if (active) platform = active;
    } catch (err) {
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
    }
    await upsert(db, draftId, slot, { riotId, platform, puuid: account.puuid, status: "verified", error: null, champions: [], gamesAnalysed: 0, fetchedAt: null });
    return { status: "verified" };
  } catch (err) {
    const f = friendlyAccountError(err, "resolve");
    const status = f.status === "unresolved" ? "unresolved" : f.status === "failed" ? "failed" : "pending";
    await upsert(db, draftId, slot, { riotId, status, error: f.message });
    return { status, error: f.message };
  }
}

async function bumpDraftVersion(db: Db, draftId: string): Promise<void> {
  await db.update(drafts).set({ version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
  globalThis.__uniiverseRecommendationCache = undefined;
}

/** Best-effort background scouting (server actions call it with `after`). Never throws. */
export async function kickoffEnemyScouting(db: Db, draftId: string, client: RiotApiClient | null, options: Partial<ScoutOptions> = {}): Promise<void> {
  try {
    const summary = await scoutDraftEnemies(db, draftId, { client, deadlineMs: 25_000, ...options });
    log("info", "scouting.finished", { draftId, ...summary });
  } catch (err) {
    log("warn", "scouting.failed", { draftId, error: err });
  }
}

/** Scouting rows for a draft, in entry order, for the room and the prepare page (no PUUIDs). */
export async function listEnemyScouting(db: Db, draftId: string): Promise<EnemyScoutingView[]> {
  const rows = await db.select().from(draftEnemyScouting).where(eq(draftEnemyScouting.draftId, draftId));
  const roles = inferredRoles(rows.filter((r) => r.status === "ok"));
  return ROLES.filter((r) => rows.some((row) => row.role === r)).map((role) => {
    const row = rows.find((r) => r.role === role)!;
    const inferred = roles.get(role);
    return {
      role,
      likelyRole: inferred && inferred.certainty > 0 ? inferred.role : null,
      roleCertainty: inferred?.certainty ?? 0,
      riotId: row.riotId,
      platform: row.platform,
      status: row.status as EnemyScoutingView["status"],
      error: row.error,
      rank: row.tier ? `${row.tier}${row.division ? ` ${row.division}` : ""}${row.leaguePoints !== null ? ` ${row.leaguePoints} LP` : ""}` : null,
      gamesAnalysed: row.gamesAnalysed,
      fetchedAt: row.fetchedAt?.toISOString() ?? null,
    };
  });
}

function toEvidence(row: typeof draftEnemyScouting.$inferSelect): { history: ChampionHistoryEvidence[]; mastery: MasteryEvidence[] } {
  const history: ChampionHistoryEvidence[] = [];
  const mastery: MasteryEvidence[] = [];
  const seenMastery = new Set<string>();
  for (const c of row.champions) {
    const role = (ROLES as readonly string[]).includes(c.role) ? (c.role as Role) : "UNKNOWN";
    const last = c.lastPlayedAt ? new Date(c.lastPlayedAt) : null;
    if (c.games > 0) {
      const older = c.games - c.patchGames;
      const share = c.games > 0 ? c.wins / c.games : 0;
      if (c.patchGames > 0) history.push({ championId: c.championId, role, games: c.patchGames, wins: Math.round(share * c.patchGames), lastPlayedAt: last, patchDistance: 0 });
      if (older > 0) history.push({ championId: c.championId, role, games: older, wins: c.wins - Math.round(share * c.patchGames), lastPlayedAt: last, patchDistance: 1 });
    }
    if (c.masteryPoints !== null && !seenMastery.has(c.championId)) {
      seenMastery.add(c.championId);
      mastery.push({ championId: c.championId, points: c.masteryPoints, level: c.masteryLevel ?? 0, lastPlayedAt: last });
    }
  }
  return { history, mastery };
}

/** Games per role in a scouting row (from the positions in the player's own matches). */
function roleGames(row: typeof draftEnemyScouting.$inferSelect): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {};
  for (const c of row.champions) if ((ROLES as readonly string[]).includes(c.role)) out[c.role as Role] = (out[c.role as Role] ?? 0) + c.games;
  return out;
}

/** Each scouted player's likely role, inferred from their games (the slot they were entered in means nothing). */
function inferredRoles(rows: Array<typeof draftEnemyScouting.$inferSelect>) {
  return inferEnemyRoles(rows.map((row) => ({ key: row.role, games: roleGames(row) })));
}

/** Tendencies for the engine, from this draft's scouting rows (null when nobody was scouted). */
export async function loadEnemyTendencies(db: Db, draftId: string, stats: StatsProvider, championMap: Map<string, ChampionInfo>, now = new Date()): Promise<EnemyTendencies | null> {
  const rows = await db.select().from(draftEnemyScouting).where(and(eq(draftEnemyScouting.draftId, draftId), eq(draftEnemyScouting.status, "ok")));
  if (rows.length === 0) return null;
  const roles = inferredRoles(rows);
  const inputs: EnemyEvidenceInput[] = rows.map((row) => {
    const { history, mastery } = toEvidence(row);
    const inferred = roles.get(row.role);
    return { role: inferred?.role ?? row.role, roleCertainty: inferred?.certainty ?? 0, label: row.riotId, history, mastery, rank: row.tier ? `${row.tier}${row.division ? ` ${row.division}` : ""}` : null, gamesAnalysed: row.gamesAnalysed };
  });
  return buildEnemyTendencies(inputs, stats, championMap, { now });
}

/** The same rows as scouted players for the pre-draft plan (ban damage, expected priorities). */
export async function loadScoutedOpponents(db: Db, draftId: string): Promise<ScoutedPlayer[]> {
  const rows = await db.select().from(draftEnemyScouting).where(eq(draftEnemyScouting.draftId, draftId));
  const roles = inferredRoles(rows.filter((r) => r.status === "ok"));
  return rows.map((row) => {
    const { history, mastery } = toEvidence(row);
    return {
      id: `enemy-${row.role}`,
      label: row.riotId,
      likelyRole: roles.get(row.role)?.role ?? row.role,
      altRole: null,
      identityConfidence: row.status === "ok" ? "high" : "unknown",
      accountsTotal: 1,
      accountsResolved: row.status === "ok" ? 1 : 0,
      lastSyncAt: row.fetchedAt,
      history,
      mastery,
      rank: row.tier ? { tier: row.tier, division: row.division, lp: row.leaguePoints, wins: row.rankedWins, losses: row.rankedLosses } : null,
      notes: "",
    };
  });
}
