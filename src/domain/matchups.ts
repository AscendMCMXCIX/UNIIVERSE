/*
  Personal matchups: how a player's games on one champion went against one lane opponent (the
  enemy in the same position), and how the lane developed, from Riot's match timelines.

  The timeline has one frame about every minute, but frames are not exactly 60 s apart and the last
  frame is the end of the game. Every comparison is made at an exact moment (10:00 is 600,000 ms),
  read between the two frames around it, never by frame number. A game that had ended before a
  moment has no value there; it is left out of that moment's figures, and every figure carries the
  number of games behind it. These are descriptions of what happened in these games, not causes,
  and small samples are said to be small.
*/

/** Moments shown in the lane table, in minutes. */
export const LANE_CHECKPOINTS = [5, 10, 15, 20] as const;
/** The curve is drawn per minute up to this point (later minutes have few games). */
export const CURVE_MINUTES = 30;
/** A minute's average is drawn only when at least this many games reached it. */
export const MIN_CURVE_GAMES = 3;
/** Sentences about a pattern need at least this many games with a timeline at both moments. */
export const MIN_PATTERN_GAMES = 5;

export interface PlayerSeries {
  /** Total gold earned. */
  g: number[];
  /** Experience. */
  x: number[];
  /** Lane minions + jungle monsters killed. */
  c: number[];
}

/**
 * A value at an exact moment (ms into the game), read linearly between the frames on either side.
 * Null before the first frame or after the last one (the game had ended), and when the frames are
 * not usable (no frames, or values missing).
 */
export function valueAt(t: readonly number[], v: readonly number[], ms: number): number | null {
  if (!t.length || t.length !== v.length || ms < t[0]! || ms > t[t.length - 1]!) return null;
  const hi = t.findIndex((x) => x >= ms);
  if (hi < 0) return null;
  if (t[hi] === ms || hi === 0) return v[hi]!;
  const lo = hi - 1;
  const span = t[hi]! - t[lo]!;
  if (span <= 0) return v[hi]!;
  return v[lo]! + ((v[hi]! - v[lo]!) * (ms - t[lo]!)) / span;
}

export interface LaneDiff {
  minute: number;
  /** Player minus lane opponent; null when the game had ended before this minute. */
  gold: number | null;
  xp: number | null;
  cs: number | null;
}

/** The player's lead (positive) or deficit (negative) over the lane opponent at each minute. */
export function laneDiffs(t: readonly number[], me: PlayerSeries, them: PlayerSeries, minutes: readonly number[]): LaneDiff[] {
  return minutes.map((minute) => {
    const ms = minute * 60_000;
    const diff = (a: readonly number[], b: readonly number[]) => {
      const va = valueAt(t, a, ms);
      const vb = valueAt(t, b, ms);
      return va === null || vb === null ? null : va - vb;
    };
    return { minute, gold: diff(me.g, them.g), xp: diff(me.x, them.x), cs: diff(me.c, them.c) };
  });
}

export interface MinuteSummary {
  minute: number;
  /** Games that reached this minute with a usable timeline. */
  games: number;
  goldMean: number | null;
  goldMedian: number | null;
  xpMean: number | null;
  csMean: number | null;
  /** Games in which the player had more gold than the lane opponent at this minute. */
  aheadInGold: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Per-minute figures over the games that have a timeline; each minute counts only the games that reached it. */
export function summariseMinutes(games: ReadonlyArray<readonly LaneDiff[]>, minutes: readonly number[]): MinuteSummary[] {
  return minutes.map((minute) => {
    const at = games.map((g) => g.find((d) => d.minute === minute)).filter((d): d is LaneDiff => !!d && d.gold !== null);
    const gold = at.map((d) => d.gold!);
    return {
      minute,
      games: at.length,
      goldMean: mean(gold),
      goldMedian: median(gold),
      xpMean: mean(at.map((d) => d.xp).filter((x): x is number => x !== null)),
      csMean: mean(at.map((d) => d.cs).filter((x): x is number => x !== null)),
      aheadInGold: gold.filter((x) => x > 0).length,
    };
  });
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n)).toLocaleString("en")}`;

/**
 * What the games show, in plain sentences, only where the sample allows it: at least
 * MIN_PATTERN_GAMES games with a timeline at the moments compared. Always "in these games", never
 * "always", and never a reason.
 */
export function describeLane(summary: readonly MinuteSummary[]): string[] {
  const at = (m: number) => summary.find((s) => s.minute === m);
  const lines: string[] = [];
  const ten = at(10);
  if (ten && ten.games >= MIN_PATTERN_GAMES && ten.goldMean !== null) {
    lines.push(`At 10:00 you had more gold than your lane opponent in ${ten.aheadInGold} of ${ten.games} games (average ${signed(ten.goldMean)} gold).`);
  }
  const twenty = at(20);
  if (ten && twenty && ten.goldMean !== null && twenty.goldMean !== null && twenty.games >= MIN_PATTERN_GAMES) {
    const change = twenty.goldMean - ten.goldMean;
    if (Math.abs(change) >= 250) {
      const grew = Math.sign(twenty.goldMean) === Math.sign(ten.goldMean) && Math.abs(twenty.goldMean) > Math.abs(ten.goldMean);
      const verb = ten.goldMean >= 0 ? (grew ? "grew" : twenty.goldMean < 0 ? "turned into a deficit" : "shrank") : grew ? "grew" : twenty.goldMean > 0 ? "turned into a lead" : "shrank";
      const what = ten.goldMean >= 0 ? "lead" : "deficit";
      lines.push(`On average the gold ${what} ${verb} between 10:00 (${signed(ten.goldMean)}, ${ten.games} games) and 20:00 (${signed(twenty.goldMean)}, ${twenty.games} games).`);
    } else lines.push(`On average the gold difference changed little between 10:00 (${signed(ten.goldMean)}) and 20:00 (${signed(twenty.goldMean)}, ${twenty.games} games).`);
  }
  return lines;
}
