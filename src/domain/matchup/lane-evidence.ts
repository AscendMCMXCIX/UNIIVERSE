import { wilsonInterval } from "@/domain/champion-builds";
import { valueAt } from "@/domain/matchups";
import { comparePatches } from "@/domain/patch";
import { seasonOfPatch } from "@/domain/season";
import type { Role } from "@/domain/roles";
import { LANE_QUEUE_IDS, LANE_QUEUE_KEYS, type LaneQueueKey } from "./queues";

/*
  MATCHUP INTEL's "In the team's matches" block (docs/MATCHUP_INTEL.md, "In the team's matches"):
  how the two players of one lane compared in the team's stored games of that exact pairing and
  role, at 10:00. Statistical evidence, counted on read: the statement (server/matchup/lane-query.ts)
  returns per game only anonymous numbers, and everything below is pure, so every rule is tested
  without a database (lane-evidence.test.ts).

  - The games: stored records of draft games a current team member played, every lane of them (both
    teams, not only the members' own seats), where the two champions are the one holder of the role
    on each side (the one lane opponent rule), in the current season, one queue at a time (Ranked
    Solo/Duo by default; never mixed: the owner's decision D5). A game that lasted under 10:00 has
    no lane at 10:00 and is not one.
  - 10:00 is read between the two frames around it (domain/matchups valueAt), never by frame number;
    a game whose timeline does not reach it, or has none, is counted only as "no timeline".
  - MIN_LANE_GAMES: below it no share, median or count shows, only the number of games (the owner's
    decision D6: a few games never stand as a finding). Shares carry their 95% Wilson range.
  - Kills between the two before 10:00: a time in one player's kills that is also in the other's
    deaths, counted only where no other death in the game shares that millisecond (one kill event
    gives the killer and the victim the same time: server/accounts/match-timeline.ts). Only games
    whose timelines carry kill times (kept from 29 Oct 2026) count, and the line says how many.
  - First blood: from the two records' own flags (records since Phase 14); "another player" when
    neither of the two took it.
  - The window: the season, or only the games since Riot's latest recorded change to either
    champion when MIN_LANE_GAMES of them exist (patch-aware, and always said: laneWindow).
  - Supports: no CS (a support's CS is not the lane's measure: Matchups' and FIGURES' rule).
  Figures only, no colour of good or bad, never a ranking or a suggestion: one pair at a time.
*/

/** The rules' revision: part of the cache key, so a change of rules recomputes every count. */
export const LANE_FORMAT = 1;
/** Below this many games with a timeline at 10:00, no figure shows. */
export const MIN_LANE_GAMES = 10;
/** The moment compared: 10:00. */
export const LANE_MS = 600_000;

export interface LaneSeries {
  g: number[];
  x: number[];
  c: number[];
}

/**
 * One stored game of the pairing as the statement returns it, the two seats in a fixed order: `lo`
 * is the champion whose id sorts first, `hi` the other. Anonymous numbers only (no match id, PUUID or
 * name ever leaves the database).
 */
export interface LaneGameRow {
  /** The record's patch, internal ("16.22"). */
  patch: string;
  queue: number;
  /** The `lo` champion's side won. */
  loWon: boolean;
  /** A team member's linked account held one of the two seats. */
  member: boolean;
  /** The timeline's first frame times (ms); null without a timeline. */
  t: number[] | null;
  lo: LaneSeries | null;
  hi: LaneSeries | null;
  /** Each seat's kill and death times before 10:00 (ms); null where its timeline entry carries none. */
  loKills: number[] | null;
  loDeaths: number[] | null;
  hiKills: number[] | null;
  hiDeaths: number[] | null;
  /** Every player's death times before 10:00, repeats kept (for the shared-millisecond rule); null without kill times. */
  deaths: number[] | null;
  /** Each seat's first-blood flag; null where the record carries no such figures. */
  loFirstBlood: boolean | null;
  hiFirstBlood: boolean | null;
}

/** One game seen from the first column's champion (A) against the second's (B). */
export interface LaneObservation {
  patch: string;
  queue: number;
  won: boolean;
  member: boolean;
  /** A minus B at 10:00; null where the timeline does not reach it. */
  gold10: number | null;
  xp10: number | null;
  cs10: number | null;
  /** Kills A made on B (and B on A) before 10:00; null without both players' kill times. */
  killsAonB: number | null;
  killsBonA: number | null;
  firstBlood: "A" | "B" | "other" | null;
}

/** Kills the killer made on the victim before 10:00, a millisecond another death shares left out. */
function killsOn(kills: readonly number[], deaths: readonly number[], all: readonly number[]): number {
  const count = (list: readonly number[], t: number) => list.reduce((n, x) => n + (x === t ? 1 : 0), 0);
  let n = 0;
  for (const t of new Set(kills)) {
    if (!(t < LANE_MS) || !deaths.includes(t)) continue;
    // One death at that moment in the whole game, and one kill of the killer's: the event is theirs.
    if (count(all, t) === 1 && count(kills, t) === 1) n += 1;
  }
  return n;
}

/** A game as the first column's champion sees it: `aIsLo` when that champion is the row's `lo`. */
export function observeGame(row: LaneGameRow, aIsLo: boolean): LaneObservation {
  const [a, b] = aIsLo ? [row.lo, row.hi] : [row.hi, row.lo];
  const at = (s: LaneSeries | null, key: keyof LaneSeries) => (row.t && s ? valueAt(row.t, s[key], LANE_MS) : null);
  const diff = (key: keyof LaneSeries) => {
    const va = at(a, key);
    const vb = at(b, key);
    return va === null || vb === null ? null : Math.sign(va - vb) * Math.round(Math.abs(va - vb));
  };
  const [aK, aD, bK, bD] = aIsLo ? [row.loKills, row.loDeaths, row.hiKills, row.hiDeaths] : [row.hiKills, row.hiDeaths, row.loKills, row.loDeaths];
  const timed = !!(aK && aD && bK && bD && row.deaths);
  const [aFb, bFb] = aIsLo ? [row.loFirstBlood, row.hiFirstBlood] : [row.hiFirstBlood, row.loFirstBlood];
  const firstBlood = aFb === null && bFb === null ? null : aFb ? "A" : bFb ? "B" : "other";
  return {
    patch: row.patch,
    queue: row.queue,
    won: aIsLo ? row.loWon : !row.loWon,
    member: row.member,
    gold10: diff("g"),
    xp10: diff("x"),
    cs10: diff("c"),
    killsAonB: timed ? killsOn(aK!, bD!, row.deaths!) : null,
    killsBonA: timed ? killsOn(bK!, aD!, row.deaths!) : null,
    firstBlood,
  };
}

/** Riot's latest recorded change to either champion (static digests), with the champions it changed. */
export interface LaneChange {
  /** The patch the change was recorded on, internal ("16.22"). */
  patch: string;
  /** The champions' names. */
  champions: string[];
}

/**
 * The newest patch at which either champion's recorded digest differs from its digest of the
 * patch recorded before it, and the earliest patch recorded for both (before it nothing was
 * compared). `digests` are the champions' rows of static_digests; `ids` the two champions' ids,
 * `names` their names.
 */
export function lastRecordedChange(digests: ReadonlyArray<{ patch: string; key: string; hash: string }>, ids: readonly string[], names: readonly string[]): { change: LaneChange | null; comparedFrom: string | null } {
  let newest: string | null = null;
  const changedAt = new Map<string, Set<string>>();
  let comparedFrom: string | null = null;
  ids.forEach((id, i) => {
    const own = digests.filter((d) => d.key === id).sort((x, y) => comparePatches(x.patch, y.patch));
    if (own.length && (comparedFrom === null || comparePatches(own[0]!.patch, comparedFrom) > 0)) comparedFrom = own[0]!.patch;
    for (let k = 1; k < own.length; k++) {
      if (own[k]!.hash === own[k - 1]!.hash) continue;
      const p = own[k]!.patch;
      const set = changedAt.get(p) ?? new Set<string>();
      set.add(names[i] ?? id);
      changedAt.set(p, set);
      if (newest === null || comparePatches(p, newest) > 0) newest = p;
    }
  });
  return { change: newest ? { patch: newest, champions: [...changedAt.get(newest)!] } : null, comparedFrom };
}

/** Which games the figures count: since Riot's latest change, or the whole season with that change said. */
export type LaneWindow =
  | { kind: "since-change"; change: LaneChange }
  | {
      kind: "season";
      /** The latest recorded change, when it falls inside the season; null for none recorded. */
      change: LaneChange | null;
      /** Of the games counted, how many were played before that change. */
      before: number;
      /** The earliest patch Riot's data was compared from; null where nothing was recorded. */
      comparedFrom: string | null;
    };

/** A share with its 95% range. */
export interface LaneShare {
  n: number;
  of: number;
  share: number;
  low: number;
  high: number;
}

/** A median with its middle half (the 25th and 75th percentiles). */
export interface LaneMedian {
  median: number;
  low: number;
  high: number;
}

export interface LaneFigures {
  /** Games in which A had more gold at 10:00 (exactly even counts in the games only). */
  ahead: LaneShare;
  even: number;
  gold: LaneMedian;
  xp: LaneMedian;
  /** Left out for supports. */
  cs: LaneMedian | null;
  /** Shown from MIN_LANE_GAMES games with kill times. */
  kills: { games: number; a: number; b: number; gamesA: number; gamesB: number } | null;
  /** Shown from MIN_LANE_GAMES games with the flags. */
  firstBlood: { games: number; a: number; b: number; other: number } | null;
  won: LaneShare;
}

/** One queue's evidence: the counts always, the figures from MIN_LANE_GAMES games. */
export interface LaneQueueEvidence {
  queue: LaneQueueKey;
  /** Games of the pairing in the window, with a timeline reaching 10:00: what every figure counts. */
  games: number;
  /** Every game of the pairing this season in this queue, with or without a timeline. */
  stored: number;
  /** Of `stored`, the ones without a timeline reaching 10:00. */
  noTimeline: number;
  /** Of `games`, those with kill times. */
  withKillTimes: number;
  /** Of `games`, those with a team member in one of the two seats. */
  withMember: number;
  /** Of `games`, those on the current patch. */
  currentPatchGames: number;
  window: LaneWindow;
  /** Null under MIN_LANE_GAMES games. */
  figures: LaneFigures | null;
}

/** The block's evidence for one pair: one view per queue (never pooled), or the mirror's single line. */
export type LaneEvidence =
  | { status: "mirror" }
  | { status: "counted"; role: Role; season: number; currentPatch: string | null; queues: Record<LaneQueueKey, LaneQueueEvidence> };

/** The block's evidence as the page receives it: a failure is "unavailable" (one honest line). */
export type LaneEvidenceView = LaneEvidence | { status: "unavailable" };

/** The q-th quantile (0–1) of sorted values, linear between the two around it. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Rounded half away from zero, so a figure seen from either champion is the same number with its sign flipped. */
const roundSym = (v: number) => Math.sign(v) * Math.round(Math.abs(v));

function median(values: readonly number[]): LaneMedian {
  const s = [...values].sort((x, y) => x - y);
  return { median: roundSym(quantile(s, 0.5)), low: roundSym(quantile(s, 0.25)), high: roundSym(quantile(s, 0.75)) };
}

function share(n: number, of: number): LaneShare {
  const range = wilsonInterval(n, of)!;
  return { n, of, share: n / of, low: range.low, high: range.high };
}

/** The figures of a window's games (all with a value at 10:00); null under MIN_LANE_GAMES. */
export function laneFigures(games: readonly LaneObservation[], role: Role): LaneFigures | null {
  if (games.length < MIN_LANE_GAMES) return null;
  const golds = games.map((g) => g.gold10!);
  const ahead = golds.filter((v) => v > 0).length;
  const timed = games.filter((g) => g.killsAonB !== null && g.killsBonA !== null);
  const flagged = games.filter((g) => g.firstBlood !== null);
  return {
    ahead: share(ahead, games.length),
    even: golds.filter((v) => v === 0).length,
    gold: median(golds),
    xp: median(games.map((g) => g.xp10!)),
    cs: role === "SUPPORT" ? null : median(games.map((g) => g.cs10!)),
    kills:
      timed.length >= MIN_LANE_GAMES
        ? {
            games: timed.length,
            a: timed.reduce((n, g) => n + g.killsAonB!, 0),
            b: timed.reduce((n, g) => n + g.killsBonA!, 0),
            gamesA: timed.filter((g) => g.killsAonB! > 0).length,
            gamesB: timed.filter((g) => g.killsBonA! > 0).length,
          }
        : null,
    firstBlood:
      flagged.length >= MIN_LANE_GAMES
        ? { games: flagged.length, a: flagged.filter((g) => g.firstBlood === "A").length, b: flagged.filter((g) => g.firstBlood === "B").length, other: flagged.filter((g) => g.firstBlood === "other").length }
        : null,
    won: share(games.filter((g) => g.won).length, games.length),
  };
}

/**
 * Which of a season's games the figures count. With Riot's latest recorded change inside the
 * season and MIN_LANE_GAMES games on or after its patch, only those; otherwise the whole season,
 * with how many of its games came before the change (OD-M3: include and say it).
 */
export function laneWindow(timed: readonly LaneObservation[], recorded: { change: LaneChange | null; comparedFrom: string | null }, season: number): { window: LaneWindow; games: LaneObservation[] } {
  const change = recorded.change && seasonOfPatch(recorded.change.patch) === season ? recorded.change : null;
  if (change) {
    const since = timed.filter((g) => comparePatches(g.patch, change.patch) >= 0);
    if (since.length >= MIN_LANE_GAMES) return { window: { kind: "since-change", change }, games: since };
    return { window: { kind: "season", change, before: timed.length - since.length, comparedFrom: recorded.comparedFrom }, games: [...timed] };
  }
  return { window: { kind: "season", change: null, before: 0, comparedFrom: recorded.comparedFrom }, games: [...timed] };
}

export interface LaneEvidenceInput {
  /** The first column's champion id and the second's. */
  a: string;
  b: string;
  role: Role;
  /** The current season (game-version major). */
  season: number;
  /** The game's current patch, internal; null when not known. */
  currentPatch: string | null;
  /** Riot's latest recorded change to either champion (lastRecordedChange). */
  recorded: { change: LaneChange | null; comparedFrom: string | null };
}

/**
 * The block's evidence for one pair from the statement's rows (any order of the two champions:
 * the rows' `lo` is the id that sorts first). Each queue counts only its own games and only the
 * season's; a mirror pair has no games (draft queues allow one pick of a champion).
 */
export function laneEvidence(rows: readonly LaneGameRow[], input: LaneEvidenceInput): LaneEvidence {
  if (input.a === input.b) return { status: "mirror" };
  const aIsLo = input.a < input.b;
  const inSeason = rows.filter((r) => seasonOfPatch(r.patch) === input.season).map((r) => observeGame(r, aIsLo));
  const queues = {} as Record<LaneQueueKey, LaneQueueEvidence>;
  for (const key of LANE_QUEUE_KEYS) {
    const all = inSeason.filter((g) => g.queue === LANE_QUEUE_IDS[key]);
    const timed = all.filter((g) => g.gold10 !== null && g.xp10 !== null && g.cs10 !== null);
    const { window, games } = laneWindow(timed, input.recorded, input.season);
    queues[key] = {
      queue: key,
      games: games.length,
      stored: all.length,
      noTimeline: all.length - timed.length,
      withKillTimes: games.filter((g) => g.killsAonB !== null).length,
      withMember: games.filter((g) => g.member).length,
      currentPatchGames: input.currentPatch ? games.filter((g) => g.patch === input.currentPatch).length : 0,
      window,
      figures: laneFigures(games, input.role),
    };
  }
  return { status: "counted", role: input.role, season: input.season, currentPatch: input.currentPatch, queues };
}
