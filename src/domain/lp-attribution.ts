import { rankLabel, TIERS } from "./rank-progress";

/*
  LP GAINED OR LOST IN ONE RANKED GAME, where UNIIVERSE's own rank readings prove it, and nowhere else.

  Riot reports no LP per game. LEAGUE-V4 gives an account's current tier, division, LP, wins and
  losses in each ranked queue; MATCH-V5 gives the games, with no rank in them. So a game's LP change
  can only be the difference between two readings of the account's rank in the game's queue, and
  only when those two readings enclose that game and nothing else:

  1. Which game. Riot's wins + losses count the queue's games of the ranked season, so between two
     readings exactly as many games ended as that count rose. The stored games are matched to the
     count in the order they ended: the readings' count less the stored games Riot must already
     have counted (ended more than UPDATE_ALLOWANCE_MS before the reading) is the same "offset" at
     every reading while the stored games are complete; a game missing from the store (not
     collected yet, or Riot never served it) or a stored game Riot did not count changes the
     offset, and every game between those readings is left unattributed. A game Riot does not
     count (a remake: under five minutes) never takes part.
  2. Nothing else in between. The earlier reading must still have held when the game began:
     confirmed during the game or in the BEFORE_MARGIN_MS before it was created. The only other LP
     change a player makes, a queue dodge, happens in champion select and is followed by a
     six-minute queue lockout and another champion select, so none fits between that reading and
     the game. The later reading must be taken within AFTER_WINDOW_MS after the game ended (Riot
     records a game's length without its loading screen, so this is about ten minutes of real
     time): the one window a dodge could still share with the game. Riot reports no dodges, so this
     window cannot be closed, only kept short; with readings every five minutes during play it is
     a few minutes. Decay needs weeks without a game, so it never falls inside.
  3. One ladder. Both readings ranked, in the same ranked season (the count never goes down), and
     the wins or the losses up by one as the game's result says.

  Then the LP change is the LP difference within one division, or anywhere at Master and above
  (one LP ladder). A change of division is shown as the promotion or demotion it is, with no LP
  figure: the LP after a demotion is not the LP the game cost. A reading of exactly 100 LP below
  Master is a promotion series: no figure either. Everything else is "not recorded", with the
  reason; the change across several games is given for the run of games, never to one of them.
*/

/** A stored rank reading of one account in one queue: one row per change. */
export interface RankReadingRow {
  /** IRON … CHALLENGER; null when the account was unranked (e.g. after a reset). */
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  /** The first reading with these values (ms). */
  capturedAt: number;
  /** The last reading that still showed these values (ms); rows stored before confirmations were kept have none. */
  confirmedAt?: number | null;
}

/** One of the account's games in the same queue. */
export interface QueueGame {
  matchId: string;
  /** Riot's gameCreation (ms): when the game was created, after champion select. */
  createdAt: number;
  /** Riot's gameDuration (seconds of play, the loading screen excluded); null when unknown. */
  durationS: number | null;
  win: boolean | null;
}

export interface LpReading {
  /** "Gold II", "Master" */
  label: string;
  leaguePoints: number;
  /** When the reading was taken (ms): the last confirmation for the earlier one, the first sight for the later one. */
  at: number;
}

export type LpGapReason =
  /** Riot does not count a remake (under five minutes). */
  | "remake"
  /** Played before UNIIVERSE first read the account's rank in this queue. */
  | "before-tracking"
  /** No reading since the game: the next one will tell. */
  | "awaiting-reading"
  /** The readings around it span `games` games: their combined change is not this game's. */
  | "several-games"
  /** Readings on both sides, but too far from the game to rule out another change between them. */
  | "readings-too-far"
  /** A promotion series (100 LP below Master): the series moved, not the LP. */
  | "series"
  /** A ranked reset falls between the readings. */
  | "season-reset"
  /** Unranked on one side (placements). */
  | "unranked"
  /** Riot's counts and the stored games do not agree here (a game not collected yet, or results that differ). */
  | "inconsistent";

export type LpRecord =
  | { kind: "lp"; delta: number; before: LpReading; after: LpReading }
  | { kind: "promoted"; before: LpReading; after: LpReading }
  | { kind: "demoted"; before: LpReading; after: LpReading }
  | { kind: "none"; reason: LpGapReason; games?: number; before?: LpReading; after?: LpReading; trackingSince?: number };

/** A game under this many seconds is a remake, which Riot does not count (domain/season-stats MIN_VALID_DURATION_S). */
export const REMAKE_MAX_S = 300;
/** Riot counts a finished game within minutes; one that ended longer ago than this is in every later reading. */
export const UPDATE_ALLOWANCE_MS = 10 * 60_000;
/** Up to this long after the loading screen began, a game may still have been playing: its play time plus this bounds its end. */
export const LOADING_MAX_MS = 5 * 60_000;
/** The earlier reading may be this much older than the game's creation (it falls inside the dodge lockout). */
export const BEFORE_MARGIN_MS = 5 * 60_000;
/** The later reading must come within this of the game's recorded end (play time from creation). */
export const AFTER_WINDOW_MS = 12 * 60_000;

const APEX_FROM = TIERS.indexOf("MASTER");
const DIVISIONS = ["IV", "III", "II", "I"] as const;
const tierIndex = (tier: string | null) => (tier ? TIERS.indexOf(tier.toUpperCase() as (typeof TIERS)[number]) : -1);
/** A rank's place among divisions (Master and above share one place per tier): promotions and demotions compare these, not LP. */
const divisionOrder = (r: RankReadingRow) => {
  const t = tierIndex(r.tier);
  return t * 4 + (t >= APEX_FROM ? 3 : Math.max(0, DIVISIONS.indexOf((r.division ?? "IV").toUpperCase() as (typeof DIVISIONS)[number])));
};
const ranked = (r: RankReadingRow) => tierIndex(r.tier) >= 0 && r.wins !== null && r.losses !== null && r.leaguePoints !== null;
const counted = (g: QueueGame) => g.durationS !== null && g.durationS >= REMAKE_MAX_S;
/** The earliest the game can have ended: creation plus play time (the loading screen is not in Riot's duration). */
const endEarliest = (g: QueueGame) => g.createdAt + (g.durationS ?? 0) * 1000;
const endLatest = (g: QueueGame) => endEarliest(g) + LOADING_MAX_MS;
const lastSeen = (r: RankReadingRow) => Math.max(r.capturedAt, r.confirmedAt ?? r.capturedAt);
const sameValues = (a: RankReadingRow, b: RankReadingRow) => a.tier === b.tier && a.division === b.division && a.leaguePoints === b.leaguePoints && a.wins === b.wins && a.losses === b.losses;

const reading = (r: RankReadingRow, at: number): LpReading => ({ label: rankLabel(r.tier, r.division), leaguePoints: r.leaguePoints ?? 0, at });

/** Consecutive rows with the same values are one reading (a duplicate written by overlapping runs), seen from the first to the last. */
export function mergeReadings(rows: readonly RankReadingRow[]): RankReadingRow[] {
  const sorted = [...rows].sort((a, b) => a.capturedAt - b.capturedAt);
  const out: RankReadingRow[] = [];
  for (const r of sorted) {
    const prev = out.at(-1);
    if (prev && sameValues(prev, r)) out[out.length - 1] = { ...prev, confirmedAt: Math.max(lastSeen(prev), lastSeen(r)) };
    else out.push({ ...r });
  }
  return out;
}

/** The LP outcome of one game between two ranked readings that enclose only it (rule 3 onwards). */
export function lpOutcome(before: RankReadingRow, after: RankReadingRow, win: boolean): LpRecord {
  const b = reading(before, lastSeen(before));
  const a = reading(after, after.capturedAt);
  const tb = tierIndex(before.tier);
  const ta = tierIndex(after.tier);
  const apex = tb >= APEX_FROM && ta >= APEX_FROM;
  if (apex || (before.tier === after.tier && before.division === after.division)) {
    // 100 LP below Master: a promotion series, where the series moves and the LP stays.
    if (!apex && (before.leaguePoints === 100 || after.leaguePoints === 100)) return { kind: "none", reason: "series", before: b, after: a };
    const delta = after.leaguePoints! - before.leaguePoints!;
    // A win never costs LP and a loss never gains it: anything else is a reading problem, not a figure.
    if ((win && delta < 0) || (!win && delta > 0)) return { kind: "none", reason: "inconsistent", before: b, after: a };
    return { kind: "lp", delta, before: b, after: a };
  }
  const up = divisionOrder(after) > divisionOrder(before);
  if (up !== win) return { kind: "none", reason: "inconsistent", before: b, after: a };
  return up ? { kind: "promoted", before: b, after: a } : { kind: "demoted", before: b, after: a };
}

/**
 * The LP record of every game of one account in one queue, from the account's readings in that
 * queue. The caller passes one ranked year's games (domain/ranked-year) and its readings.
 */
export function attributeLp(readingRows: readonly RankReadingRow[], games: readonly QueueGame[]): Map<string, LpRecord> {
  const out = new Map<string, LpRecord>();
  const sorted = [...games].sort((a, b) => endEarliest(a) - endEarliest(b));
  for (const g of sorted) if (!counted(g)) out.set(g.matchId, { kind: "none", reason: "remake" });
  const list = sorted.filter(counted);
  const readings = mergeReadings(readingRows);
  if (readings.length === 0) {
    for (const g of list) out.set(g.matchId, { kind: "none", reason: "before-tracking" });
    return out;
  }
  const trackingSince = readings[0]!.capturedAt;
  for (const g of list) if (endEarliest(g) < trackingSince) out.set(g.matchId, { kind: "none", reason: "before-tracking", trackingSince });

  // Segments: runs of ranked readings whose wins and losses never go down. Between two segments
  // lies a reset (or unranked readings: placements); the games there cannot be attributed.
  const segments: Array<{ from: number; to: number }> = [];
  for (let k = 0; k < readings.length; ) {
    if (!ranked(readings[k]!)) {
      k += 1;
      continue;
    }
    let j = k;
    while (j + 1 < readings.length && ranked(readings[j + 1]!) && readings[j + 1]!.wins! >= readings[j]!.wins! && readings[j + 1]!.losses! >= readings[j]!.losses!) j += 1;
    segments.push({ from: k, to: j });
    k = j + 1;
  }
  segments.forEach((seg, s) => {
    const first = readings[seg.from]!;
    // Where this segment's count can start: the previous segment's last sight (the season start for the first).
    const prev = s > 0 ? readings[segments[s - 1]!.to]! : null;
    const cut = prev ? lastSeen(prev) - UPDATE_ALLOWANCE_MS : Number.NEGATIVE_INFINITY;
    if (s > 0 || seg.from > 0) {
      // The games between the previous ranked reading (or the first, unranked one) and this segment's first reading.
      const since = prev ? lastSeen(prev) - UPDATE_ALLOWANCE_MS : trackingSince;
      const unranked = readings.slice(prev ? segments[s - 1]!.to + 1 : 0, seg.from).some((r) => !ranked(r));
      for (const g of list) if (!out.has(g.matchId) && endLatest(g) > since && endEarliest(g) < first.capturedAt) out.set(g.matchId, { kind: "none", reason: unranked ? "unranked" : "season-reset" });
    }
    // Every counted game that can be in this segment's count, in the order Riot counts them.
    // Games an earlier segment counted only shift the offset by a constant, which changes nothing.
    attributeSegment(readings.slice(seg.from, seg.to + 1), list.filter((g) => endLatest(g) > cut), out);
  });

  // Games no pair of readings placed: after the last reading, or never counted by Riot.
  const last = readings.at(-1)!;
  for (const g of list) {
    if (out.has(g.matchId)) continue;
    out.set(g.matchId, { kind: "none", reason: endLatest(g) + UPDATE_ALLOWANCE_MS > lastSeen(last) ? "awaiting-reading" : "inconsistent" });
  }
  return out;
}

/** How many of the ascending times are below `t`. */
function countBefore(sorted: readonly number[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The offsets possible at a reading: Riot's count less the stored games it must include (ended,
 * at the latest, more than the allowance before) and may include (ended, at the earliest, before).
 * Taken at the first and at the last sight of the reading, which both carry the same count.
 */
function offsetRange(r: RankReadingRow, ends: { earliest: number[]; latest: number[] }): [number, number] {
  const count = r.wins! + r.losses!;
  const at = (t: number): [number, number] => [count - countBefore(ends.earliest, t), count - countBefore(ends.latest, t - UPDATE_ALLOWANCE_MS)];
  const [aLo, aHi] = at(r.capturedAt);
  const [bLo, bHi] = at(lastSeen(r));
  return [Math.max(aLo, bLo), Math.min(aHi, bHi)];
}

function attributeSegment(readings: readonly RankReadingRow[], games: readonly QueueGame[], out: Map<string, LpRecord>) {
  const ends = { earliest: games.map(endEarliest), latest: games.map(endLatest).sort((a, b) => a - b) };
  // Consecutive readings whose possible offsets share one value form a group: within it the
  // stored games match Riot's count exactly. Where the offset moves, a game is missing or extra.
  const groupOf: number[] = [];
  const offsets: Array<number | null> = [];
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  readings.forEach((r, k) => {
    const [rlo, rhi] = offsetRange(r, ends);
    const nlo = Math.max(lo, rlo);
    const nhi = Math.min(hi, rhi);
    if (k > 0 && nlo <= nhi) {
      lo = nlo;
      hi = nhi;
    } else {
      offsets.push(null);
      lo = rlo;
      hi = rhi;
    }
    groupOf.push(offsets.length - 1);
    offsets[offsets.length - 1] = lo === hi ? lo : null;
  });

  for (let k = 0; k + 1 < readings.length; k++) {
    const before = readings[k]!;
    const after = readings[k + 1]!;
    const offset = groupOf[k] === groupOf[k + 1] ? offsets[groupOf[k]!]! : null;
    if (offset === null) {
      // The stored games and Riot's count part ways here: the games Riot must have counted by the
      // later reading, and not by the earlier one, cannot be told apart.
      for (const g of games) if (!out.has(g.matchId) && endLatest(g) + UPDATE_ALLOWANCE_MS <= after.capturedAt && endLatest(g) > lastSeen(before) - UPDATE_ALLOWANCE_MS) out.set(g.matchId, { kind: "none", reason: "inconsistent" });
      continue;
    }
    const from = before.wins! + before.losses! - offset;
    const to = after.wins! + after.losses! - offset;
    if (from < 0 || to > games.length) continue; // cannot happen within a group; nothing to say if it did
    const countedNow = games.slice(from, to);
    if (countedNow.length === 0) continue; // a change with no game (a dodge, decay or a correction) belongs to no game
    const span = { before: reading(before, lastSeen(before)), after: reading(after, after.capturedAt) };
    if (countedNow.length > 1) {
      for (const g of countedNow) out.set(g.matchId, { kind: "none", reason: "several-games", games: countedNow.length, ...span });
      continue;
    }
    const game = countedNow[0]!;
    const wins = after.wins! - before.wins!;
    const losses = after.losses! - before.losses!;
    if (game.win === null || (game.win ? wins !== 1 || losses !== 0 : wins !== 0 || losses !== 1)) {
      out.set(game.matchId, { kind: "none", reason: "inconsistent", ...span });
      continue;
    }
    const tightBefore = lastSeen(before) >= game.createdAt - BEFORE_MARGIN_MS;
    const tightAfter = after.capturedAt - endEarliest(game) <= AFTER_WINDOW_MS;
    out.set(game.matchId, tightBefore && tightAfter ? lpOutcome(before, after, game.win) : { kind: "none", reason: "readings-too-far", ...span });
  }
}

/** Whether Riot counts a game in wins and losses (not a remake). */
export const isCountedGame = counted;

/** How many of the stored games Riot must, and may, have counted by a moment (an audit's check of Riot's own count). */
export function storedCountAt(at: number, games: readonly QueueGame[]): { certain: number; possible: number } {
  const list = games.filter(counted);
  return { certain: list.filter((g) => endLatest(g) < at - UPDATE_ALLOWANCE_MS).length, possible: list.filter((g) => endEarliest(g) < at).length };
}
