import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, draftEnemyScouting, matchDetails, players, rankedGames, riotAccounts, teamBookmarks, trackedSummoners, type MatchParticipantDetail } from "@/server/db/schema";
import { filterGames, gameRole, modeBreakdown, isGameRole, isSeasonMode, performanceOfGames, recordOf, seasonsInGames, MIN_VALID_DURATION_S, type GameRole, type PerformanceSummary, type SeasonMode, type StatsFilter } from "@/domain/season-stats";
import type { GameRecord } from "@/domain/player-stats";
import { currentSeason } from "@/server/accounts/sync";
import { loadSeasonGames } from "@/server/players/season-games";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { storeMatchDetail, storeMatchUnavailable } from "@/server/accounts/match-details";
import { assetUrl, ddragonVersionOf, loadRiotAssets, type RiotAssets } from "@/server/riot/static/assets";
import { createRiotClient, RiotApiError } from "@/server/riot/api/client";
import { getCurrentPatch } from "@/server/repositories/champions";

/*
  The personal match history: the Riot games already stored for a player's linked accounts (the
  same ledger the season statistics use, one row per match across accounts), newest first, a page
  at a time. Only the page's matches load their full records; the full detail of one match loads
  when it is opened. No Riot request happens while the list renders.
*/

export const QUEUE_LABELS: Record<number, string> = { 420: "Ranked Solo/Duo", 440: "Ranked Flex", 400: "Normal Draft", 430: "Normal Blind", 480: "Swiftplay", 490: "Quickplay", 700: "Clash" };
export const queueLabel = (q: number | null) => (q !== null && QUEUE_LABELS[q]) || "Other";

export const PER_PAGE_DEFAULT = 12;
export const PER_PAGE_MIN = 5;
export const PER_PAGE_MAX = 25;

export interface MatchHistoryQuery {
  season?: number | null;
  mode?: SeasonMode;
  role?: string | null;
  /** "pool": games on the champions of the player's configured pool for the role played. */
  scope?: string | null;
  championId?: string | null;
  accountId?: string | null;
  page?: number;
  per?: number;
}

export interface Icon {
  url: string;
  name: string;
}

/** A champion in one of the two lineups of a game (row preview). */
export interface LineupSlot {
  championId: string | null;
  name: string | null;
  isPlayer: boolean;
}

export interface MatchRow {
  matchId: string;
  riotId: string | null;
  queue: string;
  queueId: number | null;
  playedAt: number;
  durationS: number | null;
  championId: string;
  role: GameRole | null;
  win: boolean;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  /** (K + A) ÷ D; null without details; perfect when no deaths. */
  kda: number | null;
  perfect: boolean;
  cs: number | null;
  csPerMin: number | null;
  damage: number | null;
  damagePerMin: number | null;
  vision: number | null;
  killParticipation: number | null;
  items: Array<Icon | null> | null;
  spells: Icon[] | null;
  keystone: Icon | null;
  secondary: Icon | null;
  /** stored = full record available; missing = not collected yet; unavailable = Riot no longer serves it. */
  record: "stored" | "missing" | "unavailable";
  /** Ranked Solo/Duo game already in the owner's Solo Queue Blocks (owner only). */
  inJournal: boolean;
  /** Both lineups, own team first, in lane order; null without the full record. */
  lineups: { own: LineupSlot[]; enemy: LineupSlot[] } | null;
}

export interface MatchHistoryPage {
  rows: MatchRow[];
  total: number;
  page: number;
  pages: number;
  per: number;
  filter: StatsFilter;
  seasons: number[];
  currentSeason: number;
  championOptions: Array<{ id: string; games: number }>;
  accountOptions: Array<{ id: string; riotId: string; label: string }>;
  accountsLinked: number;
  /** Games of the season stored but whose full record is still being collected (on this page). */
  missingOnPage: number;
  /** Accounts whose history is still being collected for this season. */
  syncing: boolean;
  /** Record and averages of every game matching the filters (not just this page). */
  summary: { record: GameRecord; performance: PerformanceSummary };
  /** Games per game mode in the chosen season, and other seasons holding the chosen mode (see modeBreakdown). */
  modes: ReturnType<typeof modeBreakdown>;
}

const perMinute = (value: number | null, durationS: number | null) => (value === null || !durationS || durationS < MIN_VALID_DURATION_S ? null : value / (durationS / 60));

function icons(p: MatchParticipantDetail, assets: RiotAssets | null, version: string | null) {
  const item = (id: number): Icon | null => (id > 0 && version ? { url: assetUrl.item(version, id), name: assets?.items[String(id)] ?? `Item ${id}` } : null);
  const spell = (key: number): Icon | null => {
    const s = assets?.spells[String(key)];
    return s && version ? { url: assetUrl.spell(version, s.id), name: s.name } : null;
  };
  const rune = (id: number | null): Icon | null => {
    const r = id !== null ? assets?.runes[String(id)] : undefined;
    return r ? { url: assetUrl.rune(r.icon), name: r.name } : null;
  };
  return {
    items: p.items ? p.items.map(item) : null,
    spells: p.spells ? p.spells.map(spell).filter((s): s is Icon => !!s) : null,
    keystone: rune(p.runes?.keystone ?? null),
    secondary: rune(p.runes?.secondary ?? null),
  };
}

function runePageOf(p: MatchParticipantDetail, assets: RiotAssets | null): RunePage | null {
  const r = p.runes;
  if (!r?.primaryPerks?.length || !assets) return null;
  const icon = (id: number | null): Icon | null => {
    const x = id !== null ? assets.runes[String(id)] : undefined;
    return x ? { url: assetUrl.rune(x.icon), name: x.name } : null;
  };
  const list = (ids: number[] | undefined) => (ids ?? []).map(icon).filter((x): x is Icon => !!x);
  return { primaryTree: icon(r.primary), primary: list(r.primaryPerks), secondaryTree: icon(r.secondary), secondary: list(r.secondaryPerks) };
}

const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const laneIndex = (p: MatchParticipantDetail) => {
  const i = LANE_ORDER.indexOf(p.position ?? "");
  return i < 0 ? LANE_ORDER.length : i;
};
const byLane = (a: MatchParticipantDetail, b: MatchParticipantDetail) => laneIndex(a) - laneIndex(b);

const teamKills = (parts: MatchParticipantDetail[], teamId: number) => parts.filter((x) => x.teamId === teamId).reduce((n, x) => n + x.kills, 0);

/** One page of the history, newest first, with the same filters as the profile's statistics. */
export async function getMatchHistory(db: Db, playerId: string, q: MatchHistoryQuery, viewerIsOwner: boolean, poolOf: (role: GameRole) => readonly string[] = () => []): Promise<MatchHistoryPage> {
  const now = new Date();
  const [accounts, seasonNow, patch] = await Promise.all([listAccountsForPlayer(db, playerId), currentSeason(db, now), getCurrentPatch(db)]);
  const ids = accounts.map((a) => a.id);
  const raw = await loadSeasonGames(db, ids, { dedupe: false });
  const seasons = [...new Set([seasonNow, ...seasonsInGames(raw)])].sort((a, b) => b - a);
  const season = q.season && seasons.includes(q.season) ? q.season : seasonNow;
  const filter: StatsFilter = {
    season,
    mode: q.mode && isSeasonMode(q.mode) ? q.mode : "all",
    role: isGameRole(q.role) ? q.role : null,
    scope: q.championId ? "champion" : q.scope === "pool" ? "pool" : "all",
    championId: q.championId ?? null,
    accountId: q.accountId && ids.includes(q.accountId) ? q.accountId : null,
  };
  const { games } = filterGames(raw, filter, poolOf);
  const modes = modeBreakdown(raw, filter);
  const sorted = [...games].sort((a, b) => b.gameCreation - a.gameCreation || a.matchId.localeCompare(b.matchId));
  const per = Math.min(PER_PAGE_MAX, Math.max(PER_PAGE_MIN, Math.round(q.per ?? PER_PAGE_DEFAULT)));
  const pages = Math.max(1, Math.ceil(sorted.length / per));
  const page = Math.min(pages, Math.max(1, Math.round(q.page ?? 1)));
  const slice = sorted.slice((page - 1) * per, page * per);

  // Champion choices: what was played this season in this mode (any role / account).
  const { games: forOptions } = filterGames(raw, { ...filter, role: null, scope: "all", championId: null, accountId: filter.accountId }, () => []);
  const counts = new Map<string, number>();
  for (const g of forOptions) counts.set(g.championId, (counts.get(g.championId) ?? 0) + 1);
  const championOptions = [...counts.entries()].map(([id, games]) => ({ id, games })).sort((a, b) => b.games - a.games || a.id.localeCompare(b.id));

  const matchIds = slice.map((g) => g.matchId);
  const [details, assets, journal] = await Promise.all([
    matchIds.length ? db.select().from(matchDetails).where(inArray(matchDetails.matchId, matchIds)) : Promise.resolve([]),
    loadRiotAssets(db),
    viewerIsOwner && matchIds.length ? db.select({ id: rankedGames.riotMatchId }).from(rankedGames).where(and(eq(rankedGames.playerId, playerId), inArray(rankedGames.riotMatchId, matchIds))) : Promise.resolve([]),
  ]);
  const byMatch = new Map(details.map((d) => [d.matchId, d]));
  const inJournal = new Set(journal.map((j) => j.id));
  const puuidOf = new Map(accounts.map((a) => [a.id, a.puuid]));
  const ownPuuids = new Set(accounts.map((a) => a.puuid).filter(Boolean));
  const riotIdOf = new Map(accounts.map((a) => [a.id, a.riotId]));
  const fallbackVersion = patch?.ddragonVersion ?? null;

  const rows: MatchRow[] = slice.map((g) => {
    const d = byMatch.get(g.matchId);
    const me = d?.participants.find((p) => p.puuid === puuidOf.get(g.accountId)) ?? d?.participants.find((p) => ownPuuids.has(p.puuid));
    const detailed = typeof g.kills === "number" && g.kills >= 0;
    const kills = detailed ? g.kills! : null;
    const deaths = detailed ? (g.deaths ?? null) : null;
    const assists = detailed ? (g.assists ?? null) : null;
    const duration = g.gameDuration ?? d?.gameDuration ?? null;
    const version = ddragonVersionOf(d?.gameVersion, fallbackVersion);
    const ic = me ? icons(me, assets, version) : { items: null, spells: null, keystone: null, secondary: null };
    const tk = me && d ? teamKills(d.participants, me.teamId) : 0;
    const slot = (p: MatchParticipantDetail): LineupSlot => ({ championId: p.championId, name: p.name, isPlayer: p === me });
    const lineups =
      me && d && d.participants.length === 10
        ? { own: d.participants.filter((p) => p.teamId === me.teamId).sort(byLane).map(slot), enemy: d.participants.filter((p) => p.teamId !== me.teamId).sort(byLane).map(slot) }
        : null;
    return {
      matchId: g.matchId,
      riotId: accounts.length > 1 ? (riotIdOf.get(g.accountId) ?? null) : null,
      queue: queueLabel(g.queueId),
      queueId: g.queueId,
      playedAt: g.gameCreation,
      durationS: duration,
      championId: g.championId,
      role: gameRole(g),
      win: !!g.win,
      kills,
      deaths,
      assists,
      kda: kills === null || deaths === null || assists === null ? null : deaths > 0 ? (kills + assists) / deaths : kills + assists,
      perfect: deaths === 0 && kills !== null,
      cs: g.cs ?? null,
      csPerMin: perMinute(g.cs ?? null, duration),
      damage: g.damage ?? null,
      damagePerMin: perMinute(g.damage ?? null, duration),
      vision: g.visionScore ?? null,
      killParticipation: me && tk > 0 ? (me.kills + me.assists) / tk : null,
      ...ic,
      record: d ? (d.participants.length ? "stored" : "unavailable") : "missing",
      inJournal: inJournal.has(g.matchId),
      lineups,
    };
  });

  return {
    rows,
    total: sorted.length,
    page,
    pages,
    per,
    filter,
    seasons,
    currentSeason: seasonNow,
    modes,
    championOptions,
    accountOptions: accounts.length > 1 ? accounts.map((a) => ({ id: a.id, riotId: a.riotId, label: a.label })) : [],
    accountsLinked: accounts.length,
    missingOnPage: rows.filter((r) => r.record === "missing").length,
    syncing: accounts.some((a) => a.syncStatus === "syncing" || a.syncStatus === "pending" || a.syncStatus === "never" || !a.historyBackfill?.completedAt),
    summary: { record: recordOf(sorted), performance: performanceOfGames(sorted) },
  };
}

/**
 * A participant's last-known Ranked Solo/Duo rank, from what UNIIVERSE already stores (no Riot
 * request): a linked or scouted account's rank snapshot, or the ladder tier of a player the meta
 * sampling tracks. It is the rank when it was last seen, not the rank at the time of the match.
 */
export interface KnownRank {
  tier: string;
  division: string | null;
  asOf: string;
}

export interface DetailParticipant {
  name: string | null;
  /** Null when UNIIVERSE has no stored rank for this player (not proof of being unranked). */
  rank: KnownRank | null;
  /** The profile's own player in this game. */
  isPlayer: boolean;
  /** A registered UNIIVERSE player (display name), when their linked account played. */
  teamMember: string | null;
  championId: string | null;
  champLevel: number | null;
  position: string | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number | null;
  csPerMin: number | null;
  gold: number | null;
  damage: number | null;
  damageTaken: number | null;
  vision: number | null;
  items: Array<Icon | null> | null;
  spells: Icon[] | null;
  keystone: Icon | null;
  secondary: Icon | null;
}

/** Every rune chosen, primary path then secondary (records stored before Phase 9 have only the keystone). */
export interface RunePage {
  primaryTree: Icon | null;
  primary: Icon[];
  secondaryTree: Icon | null;
  secondary: Icon[];
}

export interface DetailTeam {
  teamId: number;
  side: "blue" | "red";
  win: boolean;
  kills: number;
  gold: number | null;
  objectives: Record<string, number>;
  bans: string[];
  participants: DetailParticipant[];
}

export interface MatchDetailView {
  matchId: string;
  queue: string;
  queueId: number | null;
  playedAt: number;
  durationS: number;
  patch: string | null;
  win: boolean;
  championId: string | null;
  role: string | null;
  player: DetailParticipant & { killParticipation: number | null; damagePerMin: number | null; runePage: RunePage | null };
  teams: DetailTeam[];
  /** Highest damage in the game (for the damage bars). */
  maxDamage: number;
  comparison: MatchComparison;
  journal: { eligible: boolean; inJournal: boolean };
  /** Sharing this game with the team (Matches → Bookmarked): only the player's own games, by them. */
  share: { eligible: boolean; shared: boolean };
}

/** One figure for the player beside their lane opponent and their own team's average. */
export interface ComparisonFigure {
  key: "csPerMin" | "damagePerMin" | "goldPerMin" | "vision";
  label: string;
  you: number | null;
  opponent: number | null;
  teamAverage: number | null;
}

/** One team total, own team against the enemy team. */
export interface TeamTotal {
  key: "kills" | "gold" | "damage" | "tower" | "dragon" | "baron";
  label: string;
  own: number | null;
  enemy: number | null;
}

/**
 * Plain comparisons inside one game, all from the stored record (no grades or scores): the player's
 * share of their team's champion damage, gold and kills; per-minute figures beside the enemy in the
 * same position and their own team's average; and the two teams' totals.
 */
export interface MatchComparison {
  damageShare: number | null;
  goldShare: number | null;
  killParticipation: number | null;
  opponent: { championId: string | null; name: string | null } | null;
  figures: ComparisonFigure[];
  teams: TeamTotal[];
}

const sumOf = (vals: Array<number | null>) => (vals.every((v) => v !== null) ? vals.reduce<number>((n, v) => n + (v ?? 0), 0) : null);
const share = (part: number | null, whole: number | null) => (part === null || whole === null || whole <= 0 ? null : part / whole);

export function compareInMatch(participants: MatchParticipantDetail[], teams: Array<{ teamId: number; objectives: Record<string, number> }>, me: MatchParticipantDetail, durationS: number | null): MatchComparison {
  const own = participants.filter((p) => p.teamId === me.teamId);
  const enemy = participants.filter((p) => p.teamId !== me.teamId);
  // The lane opponent: the enemy in the same recorded position (none when positions are missing).
  const opp = me.position && LANE_ORDER.includes(me.position) ? (enemy.filter((p) => p.position === me.position).length === 1 ? enemy.find((p) => p.position === me.position)! : null) : null;
  const pm = (v: number | null) => perMinute(v, durationS);
  const avg = (vals: Array<number | null>) => {
    const t = sumOf(vals);
    return t === null || !vals.length ? null : t / vals.length;
  };
  const figure = (key: ComparisonFigure["key"], label: string, get: (p: MatchParticipantDetail) => number | null): ComparisonFigure => ({ key, label, you: get(me), opponent: opp ? get(opp) : null, teamAverage: avg(own.map(get)) });
  const ownKills = own.reduce((n, p) => n + p.kills, 0);
  const objective = (teamId: number | undefined, k: string) => {
    const t = teams.find((x) => x.teamId === teamId);
    return t && typeof t.objectives[k] === "number" ? t.objectives[k] : null;
  };
  const enemyTeamId = enemy[0]?.teamId;
  return {
    damageShare: share(me.damage, sumOf(own.map((p) => p.damage))),
    goldShare: share(me.gold, sumOf(own.map((p) => p.gold))),
    killParticipation: ownKills > 0 ? (me.kills + me.assists) / ownKills : null,
    opponent: opp ? { championId: opp.championId, name: opp.name } : null,
    figures: [
      figure("csPerMin", "CS/min", (p) => pm(p.cs)),
      figure("damagePerMin", "Damage/min", (p) => pm(p.damage)),
      figure("goldPerMin", "Gold/min", (p) => pm(p.gold)),
      figure("vision", "Vision score", (p) => p.vision),
    ],
    teams: [
      { key: "kills", label: "Kills", own: ownKills, enemy: enemy.reduce((n, p) => n + p.kills, 0) },
      { key: "gold", label: "Gold", own: sumOf(own.map((p) => p.gold)), enemy: sumOf(enemy.map((p) => p.gold)) },
      { key: "damage", label: "Champion damage", own: sumOf(own.map((p) => p.damage)), enemy: sumOf(enemy.map((p) => p.damage)) },
      { key: "tower", label: "Towers", own: objective(me.teamId, "tower"), enemy: objective(enemyTeamId, "tower") },
      { key: "dragon", label: "Dragons", own: objective(me.teamId, "dragon"), enemy: objective(enemyTeamId, "dragon") },
      { key: "baron", label: "Barons", own: objective(me.teamId, "baron"), enemy: objective(enemyTeamId, "baron") },
    ],
  };
}

/**
 * Last-known Solo/Duo ranks for a match's players from stored data only: three indexed lookups
 * for at most ten PUUIDs, nothing new stored and no Riot request. The most recent snapshot wins.
 */
export async function knownRanks(db: Db, puuids: string[]): Promise<Map<string, KnownRank>> {
  const ids = [...new Set(puuids.filter(Boolean))];
  const out = new Map<string, KnownRank & { at: number }>();
  if (!ids.length) return new Map();
  const [accounts, scouted, ladder] = await Promise.all([
    db.select({ puuid: riotAccounts.puuid, tier: riotAccounts.tier, division: riotAccounts.division, at: riotAccounts.rankUpdatedAt }).from(riotAccounts).where(and(inArray(riotAccounts.puuid, ids), isNotNull(riotAccounts.tier))),
    db.select({ puuid: draftEnemyScouting.puuid, tier: draftEnemyScouting.tier, division: draftEnemyScouting.division, at: draftEnemyScouting.fetchedAt }).from(draftEnemyScouting).where(and(inArray(draftEnemyScouting.puuid, ids), isNotNull(draftEnemyScouting.tier))),
    db.select({ puuid: trackedSummoners.puuid, tier: trackedSummoners.tier, at: trackedSummoners.lastSeenInLeagueAt }).from(trackedSummoners).where(inArray(trackedSummoners.puuid, ids)),
  ]);
  const offer = (puuid: string | null, tier: string | null, division: string | null, at: Date | null) => {
    if (!puuid || !tier || !at || tier === "UNRANKED") return;
    const known = out.get(puuid);
    if (known && known.at >= at.getTime()) return;
    // Apex tiers have no division; Riot reports "I" for them.
    const apex = tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER";
    out.set(puuid, { tier, division: apex ? null : division, asOf: at.toISOString(), at: at.getTime() });
  };
  for (const r of accounts) offer(r.puuid, r.tier, r.division, r.at);
  for (const r of scouted) offer(r.puuid, r.tier, r.division, r.at);
  for (const r of ladder) offer(r.puuid, r.tier, null, r.at);
  return new Map([...out].map(([k, v]) => [k, { tier: v.tier, division: v.division, asOf: v.asOf }]));
}

export type MatchDetailResult = { status: "ok"; view: MatchDetailView } | { status: "missing" | "unavailable" | "not-found"; message: string };

/**
 * The full record of one match from a player's history. The match must be one of the player's
 * stored games (any other id finds nothing). A record not collected yet is fetched once from Riot
 * and kept, when Riot access is configured; otherwise the page says it is still being collected.
 */
export async function getMatchDetail(db: Db, playerId: string, matchId: string, options: { viewerIsOwner: boolean; fetchMissing?: boolean; canShare?: boolean } = { viewerIsOwner: false }): Promise<MatchDetailResult> {
  const accounts = await listAccountsForPlayer(db, playerId);
  if (!accounts.length) return { status: "not-found", message: "This match is not in this player's history." };
  const own = await db
    .select()
    .from(accountMatches)
    .where(and(eq(accountMatches.matchId, matchId), inArray(accountMatches.accountId, accounts.map((a) => a.id)), isNotNull(accountMatches.championId)));
  const mine = own[0];
  if (!mine) return { status: "not-found", message: "This match is not in this player's history." };
  let [d] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, matchId));
  if (!d && options.fetchMissing) {
    const account = accounts.find((a) => a.id === mine.accountId)!;
    const client = createRiotClient({ maxRetries: 0, timeoutMs: 7_000 });
    if (client) {
      try {
        const { champions } = await import("@/server/db/schema");
        const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
        const match = await client.match(account.platform, matchId);
        await storeMatchDetail(db, account.platform, match, keyToId);
        [d] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, matchId));
      } catch (err) {
        if (err instanceof RiotApiError && err.status === 404) await storeMatchUnavailable(db, account.id, matchId);
      }
    }
  }
  if (!d) return { status: "missing", message: "The full record of this game is still being collected; it appears here after the next account sync." };
  if (!d.participants.length) return { status: "unavailable", message: "Riot no longer provides the full record of this game. Its result and your figures are still counted." };

  const puuids = new Set(accounts.map((a) => a.puuid).filter(Boolean));
  const meRaw = d.participants.find((p) => puuids.has(p.puuid)) ?? null;
  // Registered UNIIVERSE players in this game (any linked account), by display name.
  const members = await db
    .select({ puuid: riotAccounts.puuid, name: players.displayName })
    .from(riotAccounts)
    .innerJoin(players, eq(players.id, riotAccounts.playerId))
    .where(inArray(riotAccounts.puuid, d.participants.map((p) => p.puuid)));
  const memberOf = new Map(members.map((m) => [m.puuid, m.name]));
  const rankOf = await knownRanks(db, d.participants.map((p) => p.puuid));
  const [assets, patch] = await Promise.all([loadRiotAssets(db), getCurrentPatch(db)]);
  const version = ddragonVersionOf(d.gameVersion, patch?.ddragonVersion ?? null);
  const view = (p: MatchParticipantDetail): DetailParticipant => ({
    name: p.name,
    isPlayer: puuids.has(p.puuid),
    teamMember: memberOf.get(p.puuid) ?? null,
    rank: rankOf.get(p.puuid) ?? null,
    championId: p.championId,
    champLevel: p.champLevel,
    position: p.position,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    kda: p.deaths > 0 ? (p.kills + p.assists) / p.deaths : p.kills + p.assists,
    cs: p.cs,
    csPerMin: perMinute(p.cs, d!.gameDuration),
    gold: p.gold,
    damage: p.damage,
    damageTaken: p.damageTaken,
    vision: p.vision,
    ...icons(p, assets, version),
  });
  // The player's team first, each in lane order.
  const teamIds = [...new Set(d.participants.map((p) => p.teamId))].sort((a, b) => (a === meRaw?.teamId ? -1 : b === meRaw?.teamId ? 1 : a - b));
  const teams: DetailTeam[] = teamIds.map((teamId) => {
    const parts = d!.participants.filter((p) => p.teamId === teamId).sort(byLane);
    const t = d!.teams.find((x) => x.teamId === teamId);
    const golds = parts.map((p) => p.gold);
    return {
      teamId,
      side: teamId === 100 ? "blue" : "red",
      win: t?.win ?? parts[0]?.win ?? false,
      kills: parts.reduce((n, p) => n + p.kills, 0),
      gold: golds.every((g) => g !== null) ? golds.reduce((n, g) => n + (g ?? 0), 0) : null,
      objectives: t?.objectives ?? {},
      bans: t?.bans ?? [],
      participants: parts.map(view),
    };
  });
  const me = meRaw ? view(meRaw) : null;
  const tk = meRaw ? teamKills(d.participants, meRaw.teamId) : 0;
  const inJournal = options.viewerIsOwner ? (await db.select({ id: rankedGames.id }).from(rankedGames).where(and(eq(rankedGames.playerId, playerId), eq(rankedGames.riotMatchId, matchId)))).length > 0 : false;
  if (!me) return { status: "unavailable", message: "This player is not in the stored record of this game." };
  const canShare = !!options.canShare && options.viewerIsOwner;
  const shared = canShare ? (await db.select({ id: teamBookmarks.id }).from(teamBookmarks).where(eq(teamBookmarks.riotMatchId, matchId)).limit(1)).length > 0 : false;
  return {
    status: "ok",
    view: {
      matchId,
      queue: queueLabel(d.queueId),
      queueId: d.queueId,
      playedAt: d.gameCreation,
      durationS: d.gameDuration,
      patch: d.gameVersion ? d.gameVersion.split(".").slice(0, 2).join(".") : null,
      win: meRaw!.win,
      championId: me.championId,
      role: mine.role,
      player: { ...me, killParticipation: tk > 0 ? (meRaw!.kills + meRaw!.assists) / tk : null, damagePerMin: perMinute(me.damage, d.gameDuration), runePage: runePageOf(meRaw!, assets) },
      teams,
      maxDamage: Math.max(1, ...d.participants.map((p) => p.damage ?? 0)),
      comparison: compareInMatch(d.participants, d.teams, meRaw!, d.gameDuration),
      journal: { eligible: options.viewerIsOwner && d.queueId === 420, inJournal },
      share: { eligible: canShare, shared },
    },
  };
}
