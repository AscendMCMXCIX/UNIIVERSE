import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { chooseSeason, offeredSeasons } from "@/domain/season";
import type { Db } from "@/server/db/types";
import { compositionOf, loadCompositionParticipants, teamMembersByPuuid, type Composition } from "@/server/matches/compositions";
import { opggLinkFor, platformOfMatchId } from "@/domain/opgg";
import { largestMultikill } from "@/domain/multikills";
import { knownRiotIds } from "@/server/players/riot-names";
import { accountMatches, matchDetails, players, rankedGames, riotAccounts, teamBookmarks, type MatchParticipantDetail } from "@/server/db/schema";
import { filterGames, gameRole, modeBreakdown, isGameRole, isSeasonMode, seasonsInGames, MIN_VALID_DURATION_S, type GameRole, type SeasonMode, type StatsFilter } from "@/domain/season-stats";
import { currentSeason } from "@/server/accounts/sync";
import { loadSeasonGames } from "@/server/players/season-games";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { storeMatchDetail, storeMatchUnavailable } from "@/server/accounts/match-details";
import { assetUrl, ddragonVersionOf, loadRiotAssets, type RiotAssets } from "@/server/riot/static/assets";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { getCurrentPatch } from "@/server/repositories/champions";
import { isRemoved } from "@/server/privacy/redact";
import { lookUpRanks, NO_CHECK, rankChecksAvailable, rankLookupClient, storedRankReadings, type RankCheck } from "@/server/players/participant-ranks";
import { participantRank, UNKNOWN_RANK, type ParticipantRank } from "@/domain/known-rank";

/*
  The personal match history: the Riot games already stored for a player's linked accounts (the
  same ledger the season statistics use, one row per match across accounts), newest first, a page
  at a time. Only the page's matches load their full records; the full detail of one match loads
  when it is opened. No Riot request happens while the list renders.
*/

export const QUEUE_LABELS: Record<number, string> = { 420: "Ranked Solo/Duo", 440: "Ranked Flex", 400: "Normal Draft", 430: "Normal Blind", 480: "Swiftplay", 490: "Quickplay", 700: "Clash" };
export const queueLabel = (q: number | null) => (q !== null && QUEUE_LABELS[q]) || "Other";

/**
 * The first page's size when the address names none: the size the page settles on for phones and
 * nearly every desktop (components/match-history: PHONE_PER, and at least 10 rows on wide screens),
 * so arriving does not render the page a second time at another size.
 */
export const PER_PAGE_DEFAULT = 10;
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
  /** The largest multikill the player made in the game (2 = double … 5 = penta); null for none or without the counts. */
  multikill: 2 | 3 | 4 | 5 | null;
  /** Ranked Solo/Duo game already in the owner's Solo Queue Blocks (owner only). */
  inJournal: boolean;
  /** Both teams (blue and red) in lane order, with team members marked; null without the full record. */
  teams: Composition | null;
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

/**
 * A team's kills: its players' kills added up, or, when one of them is a "Removed player" (personal
 * data erased; the placeholder's figures are not real), the team total Riot reported. 0 when
 * neither is known, so no kill share is shown.
 */
export function teamKills(parts: readonly MatchParticipantDetail[], teamId: number, teams: ReadonlyArray<{ teamId: number; objectives: Record<string, number> }> = []): number {
  const own = parts.filter((x) => x.teamId === teamId);
  if (!own.some(isRemoved)) return own.reduce((n, x) => n + x.kills, 0);
  const total = teams.find((t) => t.teamId === teamId)?.objectives.champion;
  return typeof total === "number" ? total : 0;
}

/** One page of the history, newest first, with the same filters as the profile's statistics. */
export async function getMatchHistory(db: Db, playerId: string, q: MatchHistoryQuery, viewerIsOwner: boolean, poolOf: (role: GameRole) => readonly string[] = () => []): Promise<MatchHistoryPage> {
  const now = new Date();
  const [accounts, seasonNow, patch] = await Promise.all([listAccountsForPlayer(db, playerId), currentSeason(db, now), getCurrentPatch(db)]);
  const ids = accounts.map((a) => a.id);
  const raw = await loadSeasonGames(db, ids, { dedupe: false });
  const seasons = offeredSeasons(seasonNow, seasonsInGames(raw));
  const season = chooseSeason(q.season, seasons, seasonNow);
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
  // Team members among everyone in these games (one query for the page), for the compositions.
  const [owner] = slice.length ? await db.select({ teamId: players.teamId }).from(players).where(eq(players.id, playerId)) : [];
  // Players who renamed since a game on this page are linked by their newer Riot ID.
  const pagePuuids = details.flatMap((d) => d.participants.map((p) => p.puuid));
  const [members, known] = await Promise.all([
    owner ? teamMembersByPuuid(db, owner.teamId, pagePuuids) : Promise.resolve(new Map<string, { id: string; name: string }>()),
    knownRiotIds(db, pagePuuids, Math.min(...details.map((d) => d.gameCreation))),
  ]);
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
    const tk = me && d ? teamKills(d.participants, me.teamId, d.teams) : 0;
    const teams = d ? compositionOf(d.participants, members, (puuid) => puuid === me?.puuid, me?.teamId ?? null, platformOfMatchId(g.matchId), known) : null;
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
      multikill: largestMultikill(me?.stats),
      inJournal: inJournal.has(g.matchId),
      teams,
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
  };
}

export interface DetailParticipant {
  /** Position in the stored record (0–9): how the possible groups name players without their accounts. */
  slot: number;
  /** A player whose personal data was erased: no name, champion or figures (shown as "Removed player"). */
  removed: boolean;
  name: string | null;
  /**
   * Their current or last-checked rank from stored readings (domain/known-rank.ts), never the rank
   * at the time of the match; "unknown" is not "unranked". A stale one is checked with Riot after
   * the window opens (getMatchRanks).
   */
  rank: ParticipantRank;
  /** The profile's own player in this game. */
  isPlayer: boolean;
  /** A registered UNIIVERSE player (display name), when their linked account played. */
  teamMember: string | null;
  /** That player's UNIIVERSE profile id, when the profile is active (not archived). */
  memberId: string | null;
  /** A non-member's public OP.GG profile, from the recorded Riot ID and the match's server; null when either is unreliable. */
  opgg: string | null;
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
  /** Some players' ranks are missing or stale and Riot can be asked: the window checks them once open (getMatchRanks). */
  rankCheck: boolean;
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
  const ownKills = teamKills(participants, me.teamId, teams);
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
      { key: "kills", label: "Kills", own: ownKills, enemy: enemy.length ? teamKills(participants, enemy[0]!.teamId, teams) : 0 },
      { key: "gold", label: "Gold", own: sumOf(own.map((p) => p.gold)), enemy: sumOf(enemy.map((p) => p.gold)) },
      { key: "damage", label: "Champion damage", own: sumOf(own.map((p) => p.damage)), enemy: sumOf(enemy.map((p) => p.damage)) },
      { key: "tower", label: "Towers", own: objective(me.teamId, "tower"), enemy: objective(enemyTeamId, "tower") },
      { key: "dragon", label: "Dragons", own: objective(me.teamId, "dragon"), enemy: objective(enemyTeamId, "dragon") },
      { key: "baron", label: "Barons", own: objective(me.teamId, "baron"), enemy: objective(enemyTeamId, "baron") },
    ],
  };
}

/** The player's linked accounts and their ledger row for this match, or null when the match is not one of their stored games. */
async function matchOfPlayer(db: Db, playerId: string, matchId: string) {
  const accounts = await listAccountsForPlayer(db, playerId);
  if (!accounts.length) return null;
  const [mine] = await db
    .select()
    .from(accountMatches)
    .where(and(eq(accountMatches.matchId, matchId), inArray(accountMatches.accountId, accounts.map((a) => a.id)), isNotNull(accountMatches.championId)));
  return mine ? { accounts, mine } : null;
}

export type MatchRanksResult = { status: "ok"; ranks: Array<{ slot: number; rank: ParticipantRank }>; check: RankCheck } | { status: "not-found"; message: string };

/**
 * The ranks of one match's players, by scoreboard slot, for a match window that is open: stored
 * readings first, and with `lookup` the players whose reading is missing or stale are checked
 * with Riot within the limits in server/players/participant-ranks.ts. The same match rule as
 * getMatchDetail: one of the player's stored games, or nothing.
 */
export async function getMatchRanks(db: Db, playerId: string, matchId: string, options: { lookup: boolean; client?: RiotApiClient | null; now?: Date; perDay?: number }): Promise<MatchRanksResult> {
  if (!(await matchOfPlayer(db, playerId, matchId))) return { status: "not-found", message: "This match is not in this player's history." };
  const [d] = await db.select({ queueId: matchDetails.queueId, platform: matchDetails.platform }).from(matchDetails).where(eq(matchDetails.matchId, matchId));
  const parts = (await loadCompositionParticipants(db, [matchId])).get(matchId) ?? [];
  if (!d || !parts.length) return { status: "ok", ranks: [], check: NO_CHECK };
  const now = options.now ?? new Date();
  const listed = parts.map((p, slot) => ({ slot, puuid: p.removed ? "" : p.puuid, name: p.name }));
  const rankOf = async () => {
    const readings = await storedRankReadings(db, listed.map((p) => p.puuid));
    return listed.map((p) => ({ ...p, rank: p.puuid ? participantRank(readings.get(p.puuid) ?? [], d.queueId, now.getTime()) : { ...UNKNOWN_RANK, stale: false } }));
  };
  let ranked = await rankOf();
  let check = NO_CHECK;
  const stale = ranked.filter((p) => p.puuid && p.rank.stale);
  if (options.lookup && stale.length) {
    check = await lookUpRanks(db, options.client === undefined ? rankLookupClient() : options.client, { matchId, platform: d.platform }, stale, { now, perDay: options.perDay });
    if (check.found) ranked = await rankOf();
  }
  return { status: "ok", ranks: ranked.map((p) => ({ slot: p.slot, rank: p.rank })), check };
}

export type MatchDetailResult = { status: "ok"; view: MatchDetailView } | { status: "missing" | "unavailable" | "not-found"; message: string };

/**
 * The full record of one match from a player's history. The match must be one of the player's
 * stored games (any other id finds nothing). A record not collected yet is fetched once from Riot
 * and kept, when Riot access is configured; otherwise the page says it is still being collected.
 */
export async function getMatchDetail(db: Db, playerId: string, matchId: string, options: { viewerIsOwner: boolean; fetchMissing?: boolean; canShare?: boolean } = { viewerIsOwner: false }): Promise<MatchDetailResult> {
  const owned = await matchOfPlayer(db, playerId, matchId);
  if (!owned) return { status: "not-found", message: "This match is not in this player's history." };
  const { accounts, mine } = owned;
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
    .select({ puuid: riotAccounts.puuid, id: players.id, name: players.displayName, archivedAt: players.archivedAt })
    .from(riotAccounts)
    .innerJoin(players, eq(players.id, riotAccounts.playerId))
    .where(inArray(riotAccounts.puuid, d.participants.map((p) => p.puuid)));
  const memberOf = new Map(members.map((m) => [m.puuid, m.name]));
  // Active profiles link inside UNIIVERSE; everyone else (archived profiles included) to OP.GG when the record allows.
  const profileOf = new Map(members.filter((m) => !m.archivedAt).map((m) => [m.puuid, m.id]));
  const platform = platformOfMatchId(matchId);
  const [readings, known] = await Promise.all([storedRankReadings(db, d.participants.map((p) => p.puuid)), knownRiotIds(db, d.participants.map((p) => p.puuid), d.gameCreation)]);
  const [assets, patch] = await Promise.all([loadRiotAssets(db), getCurrentPatch(db)]);
  const version = ddragonVersionOf(d.gameVersion, patch?.ddragonVersion ?? null);
  const now = Date.now();
  const rankOf = (p: MatchParticipantDetail): ParticipantRank => (isRemoved(p) || !p.puuid ? { ...UNKNOWN_RANK, stale: false } : participantRank(readings.get(p.puuid) ?? [], d!.queueId, now));
  const view = (p: MatchParticipantDetail): DetailParticipant => ({
    slot: d!.participants.indexOf(p),
    removed: isRemoved(p),
    name: p.name,
    isPlayer: puuids.has(p.puuid),
    teamMember: memberOf.get(p.puuid) ?? null,
    memberId: profileOf.get(p.puuid) ?? null,
    opgg: opggLinkFor(p.name, platform, known.get(p.puuid)),
    rank: rankOf(p),
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
      kills: teamKills(d!.participants, teamId, d!.teams),
      gold: golds.every((g) => g !== null) ? golds.reduce((n, g) => n + (g ?? 0), 0) : null,
      objectives: t?.objectives ?? {},
      bans: t?.bans ?? [],
      participants: parts.map(view),
    };
  });
  const me = meRaw ? view(meRaw) : null;
  const tk = meRaw ? teamKills(d.participants, meRaw.teamId, d.teams) : 0;
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
      rankCheck: rankChecksAvailable({ matchId, platform: d.platform }) && teams.some((t) => t.participants.some((p) => !p.removed && p.rank.stale)),
      maxDamage: Math.max(1, ...d.participants.map((p) => p.damage ?? 0)),
      comparison: compareInMatch(d.participants, d.teams, meRaw!, d.gameDuration),
      journal: { eligible: options.viewerIsOwner && d.queueId === 420, inJournal },
      share: { eligible: canShare, shared },
    },
  };
}
