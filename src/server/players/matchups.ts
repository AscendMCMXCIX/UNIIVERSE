import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountRows } from "@/server/accounts/account-rows";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { MIN_LANE_GAME_SECONDS } from "@/server/accounts/timeline-backfill";
import { queueLabel } from "@/server/players/match-history";
import { isGameRole, seasonModeInfo, type SeasonMode } from "@/domain/season-stats";
import { chooseSeason, isOfferedSeason, offeredSeasons, seasonOfGame } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { CURVE_MINUTES, LANE_CHECKPOINTS, describeLane, laneDiffs, summariseMinutes, type LaneDiff, type MinuteSummary, type PlayerSeries } from "@/domain/matchups";
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

/** One game's lane, as far as it is known: the lane opponent found, and the two players' frames. */
interface LaneExtract {
  /** The player and exactly one enemy in the same assigned position were found in the match record. */
  paired: boolean;
  /** The stored timeline, once it has frames: its timestamps and the two players' series (absent when Riot had none for them). */
  frames: { t: number[]; me: PlayerSeries | null; them: PlayerSeries | null } | null;
}

/*
  Lanes already worked out, per database handle and server instance. A stored match record never
  changes and a timeline with frames is final, so only those are kept; a lane still waiting for
  its record or timeline is read again next time.
*/
const LANES_KEPT = 2_000;
const laneStore = new WeakMap<object, Map<string, LaneExtract>>();

/** Tests: forget the lanes this instance kept. */
export function forgetMatchupLanes(db: object): void {
  laneStore.delete(db);
}

/**
 * The lane of each game, read in one query that does the matching in Postgres: the player (any of
 * their PUUIDs, the first in the record), the one enemy in the same assigned position, and only
 * those two players' gold, experience and CS frames. The whole match record and the other eight
 * players' frames never leave the database (about a tenth of the bytes).
 */
async function laneExtracts(db: Db, matchIds: string[], puuids: string[]): Promise<Map<string, LaneExtract>> {
  let kept = laneStore.get(db);
  if (!kept) laneStore.set(db, (kept = new Map()));
  const who = [...puuids].sort().join(",");
  const out = new Map<string, LaneExtract>();
  const missing: string[] = [];
  for (const id of new Set(matchIds)) {
    const hit = kept.get(`${id}|${who}`);
    if (hit) out.set(id, hit);
    else missing.push(id);
  }
  if (!missing.length || !puuids.length) {
    for (const id of missing) out.set(id, { paired: false, frames: null });
    return out;
  }
  const idArray = sql`ARRAY[${sql.join(missing.map((id) => sql`${id}`), sql`, `)}]::text[]`;
  const puuidArray = sql`ARRAY[${sql.join(puuids.map((p) => sql`${p}`), sql`, `)}]::text[]`;
  const result = await db.execute(sql`
    SELECT ids.match_id, d.match_id IS NOT NULL AS has_record, coalesce(lane.paired, false) AS paired, t.frames IS NOT NULL AS has_frames,
      CASE WHEN lane.paired THEN t.frames->'t' END AS t,
      CASE WHEN lane.paired THEN t.frames->'p'->lane.me END AS me,
      CASE WHEN lane.paired THEN t.frames->'p'->lane.them END AS them
    FROM unnest(${idArray}) AS ids(match_id)
    LEFT JOIN match_details d ON d.match_id = ids.match_id
    LEFT JOIN LATERAL (
      SELECT mine.p->>'puuid' AS me, opp.puuid AS them, opp.puuid IS NOT NULL AS paired
      FROM (SELECT e.p FROM jsonb_array_elements(d.participants) WITH ORDINALITY AS e(p, i) WHERE e.p->>'puuid' = ANY(${puuidArray}) ORDER BY e.i LIMIT 1) mine
      CROSS JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN min(o->>'puuid') END AS puuid
        FROM jsonb_array_elements(d.participants) o
        WHERE coalesce(mine.p->>'position', '') <> '' AND coalesce(o->>'puuid', '') <> '' AND o->'teamId' IS DISTINCT FROM mine.p->'teamId' AND o->>'position' = mine.p->>'position'
      ) opp
    ) lane ON true
    LEFT JOIN match_timelines t ON t.match_id = ids.match_id`);
  const rows = ((result as { rows?: unknown[] }).rows ?? result) as Array<{ match_id: string; has_record: boolean; paired: boolean; has_frames: boolean; t: number[] | null; me: PlayerSeries | null; them: PlayerSeries | null }>;
  for (const r of rows) {
    const lane: LaneExtract = { paired: !!r.paired, frames: r.paired && r.has_frames ? { t: r.t ?? [], me: r.me ?? null, them: r.them ?? null } : null };
    out.set(r.match_id, lane);
    // Final once the record is stored and, for a paired lane, the timeline has its frames.
    if (r.has_record && (!r.paired || r.has_frames)) {
      if (kept.size >= LANES_KEPT) kept.delete(kept.keys().next().value!);
      kept.set(`${r.match_id}|${who}`, lane);
    }
  }
  return out;
}

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

  // The accounts' stored games (kept per instance until they change; account-rows.ts): decided
  // games in the mode's queues, long enough to have had a lane, newest first.
  const queues = new Set<number>(seasonModeInfo(filter.mode).queues);
  const inMode = (await accountRows(db, "games", chosen.map((a) => a.id)))
    .filter((r) => r.win !== null && r.queueId !== null && queues.has(r.queueId) && r.gameDuration !== null && r.gameDuration >= MIN_LANE_GAME_SECONDS)
    .map((r) => ({ matchId: r.matchId, accountId: r.accountId, gameCreation: r.gameCreation, patch: r.patch, queueId: r.queueId, championId: r.championId, role: r.role, win: r.win, enemy: r.enemyChampionId, kills: r.kills, deaths: r.deaths, assists: r.assists, cs: r.cs, duration: r.gameDuration }))
    .sort((a, b) => b.gameCreation - a.gameCreation);
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
  // The lane opponent: the one player on the other team in the same assigned position.
  const lanes = await laneExtracts(db, read.map((g) => g.matchId), all.map((a) => a.puuid).filter((p): p is string => !!p));

  const views = read.map((g) => {
    const lane = lanes.get(g.matchId);
    const frames = lane?.frames;
    let timeline: TimelineStatus;
    let d: LaneDiff[] | null = null;
    if (!lane?.paired) timeline = "no-details";
    else if (!frames) timeline = "pending";
    else if (!frames.t.length || !frames.me || !frames.them) timeline = "unavailable";
    else {
      timeline = "frames";
      d = laneDiffs(frames.t, frames.me, frames.them, MINUTES);
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

