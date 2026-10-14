import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, players, rankedGames, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { filterGames, gameRole, isGameRole, isSeasonMode, seasonsInGames, MIN_VALID_DURATION_S, type GameRole, type SeasonMode, type StatsFilter } from "@/domain/season-stats";
import { currentSeason } from "@/server/accounts/sync";
import { loadSeasonGames } from "@/server/players/season-games";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { matchDetailRow, storeMatchUnavailable } from "@/server/accounts/match-details";
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
export const PER_PAGE_MIN = 6;
export const PER_PAGE_MAX = 25;

export interface MatchHistoryQuery {
  season?: number | null;
  mode?: SeasonMode;
  role?: string | null;
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
  /** Ranked Solo/Duo game already in the owner's Solo Queue Blocks (owner only). */
  inJournal: boolean;
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
  accountOptions: Array<{ id: string; riotId: string }>;
  accountsLinked: number;
  /** Games of the season stored but whose full record is still being collected (on this page). */
  missingOnPage: number;
  /** Accounts whose history is still being collected for this season. */
  syncing: boolean;
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

const teamKills = (parts: MatchParticipantDetail[], teamId: number) => parts.filter((x) => x.teamId === teamId).reduce((n, x) => n + x.kills, 0);

/** One page of the history, newest first, with the same filters as the profile's statistics. */
export async function getMatchHistory(db: Db, playerId: string, q: MatchHistoryQuery, viewerIsOwner: boolean): Promise<MatchHistoryPage> {
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
    scope: q.championId ? "champion" : "all",
    championId: q.championId ?? null,
    accountId: q.accountId && ids.includes(q.accountId) ? q.accountId : null,
  };
  const { games } = filterGames(raw, filter, () => []);
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
    championOptions,
    accountOptions: accounts.length > 1 ? accounts.map((a) => ({ id: a.id, riotId: a.riotId })) : [],
    accountsLinked: accounts.length,
    missingOnPage: rows.filter((r) => r.record === "missing").length,
    syncing: accounts.some((a) => a.syncStatus === "syncing" || a.syncStatus === "pending" || a.syncStatus === "never" || !a.historyBackfill?.completedAt),
  };
}

export interface DetailParticipant {
  name: string | null;
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
  player: DetailParticipant & { killParticipation: number | null; damagePerMin: number | null };
  teams: DetailTeam[];
  /** Highest damage in the game (for the damage bars). */
  maxDamage: number;
  journal: { eligible: boolean; inJournal: boolean };
}

export type MatchDetailResult = { status: "ok"; view: MatchDetailView } | { status: "missing" | "unavailable" | "not-found"; message: string };

/**
 * The full record of one match from a player's history. The match must be one of the player's
 * stored games (any other id finds nothing). A record not collected yet is fetched once from Riot
 * and kept, when Riot access is configured; otherwise the page says it is still being collected.
 */
export async function getMatchDetail(db: Db, playerId: string, matchId: string, options: { viewerIsOwner: boolean; fetchMissing?: boolean } = { viewerIsOwner: false }): Promise<MatchDetailResult> {
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
        await db.insert(matchDetails).values(matchDetailRow(account.platform, match, keyToId)).onConflictDoNothing();
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
  const [assets, patch] = await Promise.all([loadRiotAssets(db), getCurrentPatch(db)]);
  const version = ddragonVersionOf(d.gameVersion, patch?.ddragonVersion ?? null);
  const view = (p: MatchParticipantDetail): DetailParticipant => ({
    name: p.name,
    isPlayer: puuids.has(p.puuid),
    teamMember: memberOf.get(p.puuid) ?? null,
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
  const order = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const teams: DetailTeam[] = [...new Set(d.participants.map((p) => p.teamId))].sort().map((teamId) => {
    const parts = d!.participants.filter((p) => p.teamId === teamId).sort((a, b) => order.indexOf(a.position ?? "") - order.indexOf(b.position ?? ""));
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
      player: { ...me, killParticipation: tk > 0 ? (meRaw!.kills + meRaw!.assists) / tk : null, damagePerMin: perMinute(me.damage, d.gameDuration) },
      teams,
      maxDamage: Math.max(1, ...d.participants.map((p) => p.damage ?? 0)),
      journal: { eligible: options.viewerIsOwner && d.queueId === 420, inJournal },
    },
  };
}
