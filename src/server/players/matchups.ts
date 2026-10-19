import { and, desc, gte, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, matchTimelines } from "@/server/db/schema";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { MIN_LANE_GAME_SECONDS } from "@/server/accounts/timeline-backfill";
import { queueLabel } from "@/server/players/match-history";
import { isGameRole, seasonModeInfo, type SeasonMode } from "@/domain/season-stats";
import { chooseSeason, isOfferedSeason, offeredSeasons, seasonOfGame } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { CURVE_MINUTES, LANE_CHECKPOINTS, describeLane, laneDiffs, summariseMinutes, type LaneDiff, type MinuteSummary } from "@/domain/matchups";
import type { Role } from "@/domain/roles";

/*
  Matchups for one player profile: their champions, the lane opponents each one actually faced (the
  enemy in the same position, as Riot assigned it), and, for one pairing, the record, where the
  games came from, and the lane in gold, experience and CS from stored timelines. Only the player's
  own stored games; nothing about any other player leaves the server (no PUUIDs, no names). The
  caller decides who may see a profile's statistics (the page checks it, as for Match History).
*/

export interface MatchupFilter {
  /** An account id, "all" for every linked account, or null for the Main account. */
  account: string | null;
  /** A season (game-version major), "all", or null/absent for the current season. */
  season?: number | "all" | null;
  mode: SeasonMode;
  champion: string | null;
  vs: string | null;
  /** Only games played in this role (the champion window opens on one champion in one role). */
  role?: Role | null;
  /**
   * Keep the requested champion even when it has no lane games in scope (the champion window says
   * so) instead of falling back to the most played one, and add the champion's lane over all its
   * opponents (`lane`).
   */
  exact?: boolean;
}

export type TimelineStatus = "frames" | "pending" | "unavailable" | "no-details";

export interface MatchupGameView {
  matchId: string;
  playedAt: number;
  /** The lane opponent's champion (a champion, never a player). */
  opponentId: string | null;
  queue: string;
  account: string;
  role: Role | null;
  win: boolean;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  durationSeconds: number | null;
  timeline: TimelineStatus;
  /** Lead (+) or deficit (−) at the lane checkpoints; null where the game had ended or no timeline. */
  at: Array<{ minute: number; gold: number | null; xp: number | null; cs: number | null }>;
  /** Differences per minute 1..CURVE_MINUTES (null after the end), for the graph; empty without a timeline. */
  curves: { gold: Array<number | null>; xp: Array<number | null>; cs: Array<number | null> };
}

/** The lane figures of a set of games: where they came from, timeline coverage, the lane by minute. */
export interface LaneSummary {
  games: number;
  wins: number;
  byAccount: Array<{ label: string; games: number; wins: number }>;
  byQueue: Array<{ label: string; games: number; wins: number }>;
  timelines: { frames: number; pending: number; unavailable: number; noDetails: number };
  checkpoints: MinuteSummary[];
  curve: MinuteSummary[];
  notes: string[];
}

export interface MatchupsData {
  accounts: Array<{ id: string; riotId: string; main: boolean }>;
  /** The account shown, or "all". Null when the player has no linked account. */
  account: string | "all" | null;
  season: number | "all";
  /** Seasons with stored games in this scope, newest first (always including the current one). */
  seasons: number[];
  currentSeason: number;
  mode: SeasonMode;
  /** Stored rift games in scope (remakes left out), and how many name a lane opponent. */
  games: number;
  gamesWithOpponent: number;
  champions: Array<{ championId: string; games: number; wins: number }>;
  champion: string | null;
  opponents: Array<{ championId: string; games: number; wins: number; lastPlayedAt: number }>;
  vs: string | null;
  role: Role | null;
  detail: MatchupDetail | null;
  /** With `exact`: the chosen champion against every lane opponent, and its most recent games. */
  lane: (LaneSummary & { recent: MatchupGameView[] }) | null;
}

export interface MatchupDetail extends LaneSummary {
  matches: MatchupGameView[];
}

/** Recent games shown on the champion's overview. */
const RECENT_GAMES = 5;

const MINUTES = Array.from({ length: CURVE_MINUTES }, (_, i) => i + 1);

export async function getPlayerMatchups(db: Db, playerId: string, filter: MatchupFilter): Promise<MatchupsData> {
  const all = await listAccountsForPlayer(db, playerId);
  const accounts = all.map((a) => ({ id: a.id, riotId: a.riotId, main: a.label === "main" }));
  const main = all.find((a) => a.label === "main") ?? all[0] ?? null;
  const account: string | "all" | null = !main ? null : filter.account === "all" && all.length > 1 ? "all" : all.find((a) => a.id === filter.account)?.id ?? main.id;
  const seasonNow = await currentSeason(db);
  const requested = filter.season ?? seasonNow;
  const role = filter.role ?? null;
  const empty: MatchupsData = { accounts, account, season: requested === "all" ? "all" : chooseSeason(requested, [seasonNow], seasonNow), seasons: [seasonNow], currentSeason: seasonNow, mode: filter.mode, games: 0, gamesWithOpponent: 0, champions: [], champion: filter.exact ? filter.champion : null, opponents: [], vs: null, role, detail: null, lane: null };
  if (!account) return empty;
  const chosen = account === "all" ? all : all.filter((a) => a.id === account);
  const riotIdOf = new Map(all.map((a) => [a.id, a.riotId]));

  const inMode = await db
    .select({ matchId: accountMatches.matchId, accountId: accountMatches.accountId, gameCreation: accountMatches.gameCreation, patch: accountMatches.patch, queueId: accountMatches.queueId, championId: accountMatches.championId, role: accountMatches.role, win: accountMatches.win, enemy: accountMatches.enemyChampionId, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, cs: accountMatches.cs, duration: accountMatches.gameDuration })
    .from(accountMatches)
    .where(and(inArray(accountMatches.accountId, chosen.map((a) => a.id)), isNotNull(accountMatches.championId), isNotNull(accountMatches.win), inArray(accountMatches.queueId, [...seasonModeInfo(filter.mode).queues]), gte(accountMatches.gameDuration, MIN_LANE_GAME_SECONDS)))
    .orderBy(desc(accountMatches.gameCreation));
  // The current season by default; another offered season, or every offered one, on request
  // (domain/season: Season 2026 on). Older stored games never count, not even under "all".
  const seasonOf = (r: (typeof inMode)[number]) => seasonOfGame(r.patch, r.gameCreation);
  const seasons = offeredSeasons(seasonNow, inMode.map(seasonOf));
  const season: number | "all" = requested === "all" ? "all" : chooseSeason(requested, seasons, seasonNow);
  // The same game can be stored for two linked accounts only if both played it; it counts once.
  const seen = new Set<string>();
  const rows = (season === "all" ? inMode.filter((r) => isOfferedSeason(seasonOf(r), seasonNow)) : inMode.filter((r) => seasonOf(r) === season)).filter((r) => (!role || r.role === role) && !seen.has(r.matchId) && seen.add(r.matchId));
  const withOpponent = rows.filter((r) => r.enemy);
  const tally = <K extends string>(list: typeof rows, key: (r: (typeof rows)[number]) => K) => {
    const m = new Map<K, { games: number; wins: number; last: number }>();
    for (const r of list) {
      const k = key(r);
      const t = m.get(k) ?? { games: 0, wins: 0, last: 0 };
      t.games += 1;
      if (r.win) t.wins += 1;
      t.last = Math.max(t.last, r.gameCreation);
      m.set(k, t);
    }
    return [...m.entries()].sort((a, b) => b[1].games - a[1].games || b[1].last - a[1].last || a[0].localeCompare(b[0]));
  };
  const champions = tally(withOpponent, (r) => r.championId!).map(([championId, t]) => ({ championId, games: t.games, wins: t.wins }));
  const champion = filter.exact ? filter.champion : (champions.find((c) => c.championId === filter.champion)?.championId ?? champions[0]?.championId ?? null);
  const onChampion = withOpponent.filter((r) => r.championId === champion);
  const opponents = tally(onChampion, (r) => r.enemy!).map(([championId, t]) => ({ championId, games: t.games, wins: t.wins, lastPlayedAt: t.last }));
  const vs = opponents.find((o) => o.championId === filter.vs)?.championId ?? opponents[0]?.championId ?? null;
  const base = { ...empty, season, seasons, games: rows.length, gamesWithOpponent: withOpponent.length, champions, champion, opponents, vs };
  if (!champion || !onChampion.length) return base;

  // The champion window reads every game on the champion (its lane over all opponents); the
  // Matchups list only the chosen pairing. Either way details and timelines are read once.
  const read = filter.exact ? onChampion : onChampion.filter((r) => r.enemy === vs);
  const ids = read.map((g) => g.matchId);
  const [details, timelines] = await Promise.all([
    db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants }).from(matchDetails).where(inArray(matchDetails.matchId, ids)),
    db.select({ matchId: matchTimelines.matchId, frames: matchTimelines.frames }).from(matchTimelines).where(inArray(matchTimelines.matchId, ids)),
  ]);
  const detailOf = new Map(details.map((d) => [d.matchId, d.participants]));
  const framesOf = new Map(timelines.map((t) => [t.matchId, t.frames]));
  const puuids = new Set(all.map((a) => a.puuid).filter((p): p is string => !!p));

  const views = read.map((g) => {
    const parts = detailOf.get(g.matchId) ?? [];
    const me = parts.find((p) => puuids.has(p.puuid));
    // The lane opponent: the one player on the other team in the same assigned position.
    const same = me?.position ? parts.filter((p) => p.teamId !== me.teamId && p.position === me.position) : [];
    const them = same.length === 1 ? same[0]! : null;
    const frames = framesOf.get(g.matchId);
    let timeline: TimelineStatus;
    let d: LaneDiff[] | null = null;
    if (!me || !them) timeline = "no-details";
    else if (frames === undefined || frames === null) timeline = "pending";
    else if (!frames.t.length || !frames.p[me.puuid] || !frames.p[them.puuid]) timeline = "unavailable";
    else {
      timeline = "frames";
      d = laneDiffs(frames.t, frames.p[me.puuid]!, frames.p[them.puuid]!, MINUTES);
    }
    const at = LANE_CHECKPOINTS.map((minute) => d?.find((x) => x.minute === minute) ?? { minute, gold: null, xp: null, cs: null });
    const view: MatchupGameView = { matchId: g.matchId, playedAt: g.gameCreation, opponentId: g.enemy, queue: queueLabel(g.queueId), account: riotIdOf.get(g.accountId) ?? "", role: (g.role as Role | null) ?? null, win: !!g.win, kills: g.kills, deaths: g.deaths, assists: g.assists, cs: g.cs, durationSeconds: g.duration, timeline, at, curves: d ? { gold: d.map((x) => x.gold), xp: d.map((x) => x.xp), cs: d.map((x) => x.cs) } : { gold: [], xp: [], cs: [] } };
    return { row: g, view, diffs: d };
  });
  const summarise = (set: typeof views): LaneSummary => {
    const games = set.map((v) => v.row);
    const curve = summariseMinutes(set.flatMap((v) => (v.diffs ? [v.diffs] : [])), MINUTES);
    const breakdown = (key: (g: (typeof games)[number]) => string) => tally(games, (g) => key(g)).map(([label, t]) => ({ label, games: t.games, wins: t.wins }));
    const count = (s: TimelineStatus) => set.filter((v) => v.view.timeline === s).length;
    return {
      games: games.length,
      wins: games.filter((g) => g.win).length,
      // In the player's account order (Main first), like every other account list.
      byAccount: breakdown((g) => riotIdOf.get(g.accountId) ?? "Unknown account").sort((a, b) => all.findIndex((x) => x.riotId === a.label) - all.findIndex((x) => x.riotId === b.label)),
      byQueue: breakdown((g) => queueLabel(g.queueId)),
      timelines: { frames: count("frames"), pending: count("pending"), unavailable: count("unavailable"), noDetails: count("no-details") },
      checkpoints: curve.filter((m) => (LANE_CHECKPOINTS as readonly number[]).includes(m.minute)),
      curve,
      notes: describeLane(curve),
    };
  };
  const pairing = views.filter((v) => v.row.enemy === vs);
  return {
    ...base,
    detail: vs && pairing.length ? { ...summarise(pairing), matches: pairing.map((v) => v.view) } : null,
    lane: filter.exact ? { ...summarise(views), recent: views.slice(0, RECENT_GAMES).map((v) => v.view) } : null,
  };
}

/** Reads the Matchups parameters of a page URL. */
export function parseMatchupFilter(sp: Record<string, string | string[] | undefined>): MatchupFilter {
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : null);
  const mode = one("mode");
  const season = one("season");
  const role = one("role");
  return { account: one("account"), season: season === "all" ? "all" : season && /^\d+$/.test(season) ? Number(season) : null, mode: mode === "solo" || mode === "flex" || mode === "normal" ? mode : "all", champion: one("champion"), vs: one("vs"), role: role && isGameRole(role) ? role : null };
}

