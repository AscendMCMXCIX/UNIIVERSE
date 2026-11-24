/*
  PERFORMANCE SCORE (v1): how well each of a game's players played, 0 to 10, from that one game's
  record alone (docs/PERFORMANCE_SCORE.md has the model, its weights, worked examples and its
  limits). Deterministic and pure: the same game always gives the same scores, and nothing outside
  the game is read (no history, no baseline of other games, which a team tool does not have).

  - Each component is a figure every scored player has (kill participation, KDA, deaths, damage
    share, damage taken and mitigated, CS per minute, gold share, vision per minute, wards,
    objective damage, turret takedowns, crowd control, healing and shielding of teammates, and the
    lane against the lane opponent at 10:00 and 15:00 where the timeline confirms it).
  - Within the match: a figure becomes a z-score against the game's other players (its mean and
    spread), clamped to ±2.5 so one extreme figure cannot carry a game alone. Where the player's
    lane opponent is known, 40% of it is the comparison with that opponent instead (role-relative),
    that part bounded to ±0.5 (COUNTERPART_CLAMP): a support's CS is measured partly against the
    other support, not only against the carries, and an opponent's outstanding game cannot alone
    sink an ordinary one (v2, 23 Nov 2026; v1 had 60% bounded to ±2.5).
  - Per role: each role weighs the components differently (ROLE_WEIGHTS: supports on vision, wards,
    kill participation, crowd control and protecting their team; carries on damage and farm;
    junglers on objectives and kill participation). ARAM has weights of its own (no lanes, no farm,
    no vision), and a player whose position is not recorded gets the role-neutral weights.
  - The weighted mean of the z-scores, plus a small step for the result (OUTCOME_STEP: +0.1 for a
    win, −0.1 for a loss), is mapped to 0–10 by a logistic curve (SCALE_K), one decimal: 5.0 is the
    match's average player; the result alone moves a score by about 0.4 points.
  - A component is used only when every scored player has it (a record that lacks a figure for one
    player leaves it out for all, so nobody is compared on a figure others were not), and only when
    it differs between them. The lane is the one exception: it counts for the players whose lane the
    timeline confirms, and the others are scored without it.
  - Rank: all scored players by score; MVP is the winning team's highest, ACE the losing team's. A
    game without a winner (a remake) has neither.

  Never shown as anyone else's rating, and never as more than what it is: a comparison within one
  game. A removed player (personal data erased) is not scored and is not part of the comparison.
*/

export const SCORE_VERSION = "v2";

export type ScoreMode = "rift" | "aram";
/** Riot's positions as the score reads them (domain/match-analysis LANE_ORDER), or no recorded position. */
export type ScoreLane = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
export type WeightSet = ScoreLane | "NEUTRAL" | "ARAM";

export type ComponentKey = "kp" | "kda" | "deaths" | "damage" | "tanking" | "farm" | "gold" | "vision" | "wards" | "objectives" | "turrets" | "cc" | "protect" | "lane";

export const COMPONENT_ORDER: readonly ComponentKey[] = ["kp", "kda", "deaths", "damage", "tanking", "farm", "gold", "vision", "wards", "objectives", "turrets", "cc", "protect", "lane"];

/** Each component's words: what it is, and how a player stands out on it (above or below the match). */
export const COMPONENTS: Record<ComponentKey, { label: string; high: string; low: string }> = {
  kp: { label: "Kill participation", high: "high kill participation", low: "low kill participation" },
  kda: { label: "KDA", high: "a strong KDA", low: "a weak KDA" },
  deaths: { label: "Deaths", high: "few deaths", low: "many deaths" },
  damage: { label: "Damage share", high: "a high damage share", low: "a low damage share" },
  tanking: { label: "Damage taken and mitigated", high: "much damage taken for the team", low: "little damage taken for the team" },
  farm: { label: "CS per minute", high: "strong farm", low: "low farm" },
  gold: { label: "Gold share", high: "a high gold share", low: "a low gold share" },
  vision: { label: "Vision per minute", high: "strong vision", low: "low vision" },
  wards: { label: "Wards placed and cleared", high: "many wards placed and cleared", low: "few wards" },
  objectives: { label: "Objective damage", high: "high objective damage", low: "low objective damage" },
  turrets: { label: "Turret takedowns", high: "many turret takedowns", low: "few turret takedowns" },
  cc: { label: "Crowd control", high: "much crowd control", low: "little crowd control" },
  protect: { label: "Healing and shielding", high: "much healing and shielding of teammates", low: "little healing or shielding" },
  lane: { label: "Lane at 10:00 and 15:00", high: "a lead in lane", low: "a deficit in lane" },
};

/**
 * Each role's weights (a component with weight 0 is not read for that role). Read across a row: what
 * that role is judged on. The score is a weighted mean, so only a row's proportions matter (the rows
 * sum to between 7.8 and 10.3).
 */
export const ROLE_WEIGHTS: Record<WeightSet, Record<ComponentKey, number>> = {
  //        kp   kda  deaths damage tanking farm gold vision wards objectives turrets cc   protect lane
  TOP: { kp: 0.5, kda: 0.8, deaths: 0.8, damage: 1.2, tanking: 1.3, farm: 1.2, gold: 0.8, vision: 0.3, wards: 0.2, objectives: 0.6, turrets: 0.8, cc: 0.5, protect: 0.1, lane: 1.1 },
  JUNGLE: { kp: 1.4, kda: 1.0, deaths: 0.8, damage: 0.8, tanking: 0.6, farm: 0.7, gold: 0.6, vision: 0.8, wards: 0.5, objectives: 1.5, turrets: 0.4, cc: 0.5, protect: 0.1, lane: 0.6 },
  MIDDLE: { kp: 1.1, kda: 1.0, deaths: 0.8, damage: 1.4, tanking: 0.3, farm: 1.1, gold: 0.8, vision: 0.5, wards: 0.3, objectives: 0.4, turrets: 0.5, cc: 0.4, protect: 0.1, lane: 1.0 },
  BOTTOM: { kp: 1.0, kda: 1.0, deaths: 0.9, damage: 1.5, tanking: 0.2, farm: 1.2, gold: 0.9, vision: 0.4, wards: 0.2, objectives: 0.5, turrets: 0.7, cc: 0.2, protect: 0.1, lane: 1.0 },
  UTILITY: { kp: 1.5, kda: 1.0, deaths: 0.8, damage: 0.5, tanking: 0.5, farm: 0.1, gold: 0.2, vision: 1.4, wards: 1.1, objectives: 0.3, turrets: 0.3, cc: 1.0, protect: 1.0, lane: 0.6 },
  NEUTRAL: { kp: 1.2, kda: 1.0, deaths: 0.8, damage: 1.0, tanking: 0.5, farm: 0.7, gold: 0.6, vision: 0.7, wards: 0.4, objectives: 0.6, turrets: 0.5, cc: 0.5, protect: 0.4, lane: 0 },
  ARAM: { kp: 1.4, kda: 1.0, deaths: 0.6, damage: 1.5, tanking: 0.9, farm: 0, gold: 0.4, vision: 0, wards: 0, objectives: 0.2, turrets: 0.4, cc: 0.7, protect: 0.7, lane: 0 },
};

/** A z-score's bound: one figure far from the rest moves a score, but cannot decide it alone. */
export const Z_CLAMP = 2.5;
/** The share of a role-relative component that is the comparison with the lane opponent (the rest is the match). */
export const COUNTERPART_SHARE = 0.4;
/** How far the comparison with the lane opponent alone can pull a component, in z units (the match part keeps ±Z_CLAMP). */
export const COUNTERPART_CLAMP = 0.5;
/** The result's step, in the weighted mean's units (z-scores): a win adds it, a loss takes it away. */
export const OUTCOME_STEP = 0.1;
/** The logistic curve's slope: a weighted mean of +1 (a game a standard deviation above the match on everything weighed) is 8.3. */
export const SCALE_K = 1.6;
/** The one component never blended with the lane opponent: it already is that comparison. */
const MATCH_ONLY: ReadonlySet<ComponentKey> = new Set(["lane"]);

/** Queues played on Howling Abyss (ARAM: 450; its Clash 720; ARAM: Mayhem 2400; the older Butcher's Bridge 100). */
export const ARAM_QUEUES: ReadonlySet<number> = new Set([100, 450, 720, 2400]);
export const scoreModeOf = (queueId: number | null | undefined): ScoreMode => (typeof queueId === "number" && ARAM_QUEUES.has(queueId) ? "aram" : "rift");

/** One player's figures from the game's record (null: not recorded for this player). */
export interface ScoreInput {
  /** The player's place in the record (0–9). */
  slot: number;
  teamId: number;
  win: boolean;
  /** The recorded position, when there is one (Summoner's Rift). */
  lane: ScoreLane | null;
  /** The lane opponent's slot (domain/match-analysis laneOpponentOf), or null when unclear. */
  counterpart: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  gold: number | null;
  damage: number | null;
  damageTaken: number | null;
  damageMitigated: number | null;
  vision: number | null;
  wardsPlaced: number | null;
  wardsKilled: number | null;
  objectiveDamage: number | null;
  turretTakedowns: number | null;
  ccSeconds: number | null;
  teamHealing: number | null;
  teamShielding: number | null;
  /**
   * The lane against the lane opponent: gold plus experience ahead (negative: behind), the mean of
   * 10:00 and 15:00 where the timeline gives them (laneValue). Null without a confirmed lane.
   */
  laneDiff: number | null;
}

export interface ScoreContext {
  mode: ScoreMode;
  /** The minutes the figures cover (the game's length; at a moment of the timeline, that moment). */
  minutes: number;
  /** Apply the result's step (false for a moment of the timeline, when the result was not known yet). */
  outcome?: boolean;
}

export interface ScoreReason {
  key: ComponentKey;
  /** Above or below the match (and the lane opponent, where it counts). */
  direction: "above" | "below";
  /** The component's z-score as used (clamped, blended). */
  z: number;
  words: string;
}

export interface PlayerScore {
  slot: number;
  teamId: number;
  /** 0–10, one decimal. */
  score: number;
  /** The weighted mean before the curve (z units), unrounded: ranks are read from it. */
  raw: number;
  /** 1 = the game's highest. */
  rank: number;
  mvp: boolean;
  ace: boolean;
  weights: WeightSet;
  /** The components this player's score read (the lane only where confirmed). */
  used: ComponentKey[];
  /** Each used component's z-score as it counted. */
  z: Partial<Record<ComponentKey, number>>;
  /** The two components that lifted the score most and the one that held it back most (only those beyond ±0.35). */
  reasons: ScoreReason[];
}

export interface MatchScores {
  version: typeof SCORE_VERSION;
  mode: ScoreMode;
  /** How many players were scored (a removed player is not). */
  scored: number;
  /** The components the game's record allowed (every scored player has them, and they differ). */
  components: ComponentKey[];
  players: PlayerScore[];
}

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A player's raw figure for one component, or null when the record does not give it. */
function figure(key: ComponentKey, p: ScoreInput, team: TeamTotals, minutes: number): number | null {
  const per = (v: number | null) => (num(v) && minutes > 0 ? v / minutes : null);
  const shareOf = (v: number | null, total: number | null) => (num(v) && num(total) ? (total > 0 ? v / total : 0) : null);
  switch (key) {
    case "kp":
      return num(p.kills) && num(p.assists) && num(team.kills) ? (team.kills > 0 ? Math.min(1, (p.kills + p.assists) / team.kills) : 0) : null;
    case "kda":
      // On a log scale, so a 20/0/10 game is not ten times a 4/2/6 one; deaths count through the +1.
      return num(p.kills) && num(p.assists) && num(p.deaths) ? Math.log1p((p.kills + p.assists) / (p.deaths + 1)) : null;
    case "deaths":
      // Fewer is better: deaths per ten minutes, negated.
      return num(p.deaths) && minutes > 0 ? (-p.deaths / minutes) * 10 : null;
    case "damage":
      return shareOf(p.damage, team.damage);
    case "tanking":
      return num(p.damageTaken) ? shareOf(p.damageTaken + (num(p.damageMitigated) && num(team.mitigated) ? p.damageMitigated : 0), num(team.taken) ? team.taken + (num(team.mitigated) ? team.mitigated : 0) : null) : null;
    case "farm":
      return per(p.cs);
    case "gold":
      return shareOf(p.gold, team.gold);
    case "vision":
      return per(p.vision);
    case "wards":
      return num(p.wardsPlaced) ? per(p.wardsPlaced + (num(p.wardsKilled) && team.wardsKilled ? p.wardsKilled : 0)) : null;
    case "objectives":
      return shareOf(p.objectiveDamage, team.objectiveDamage);
    case "turrets":
      return num(p.turretTakedowns) ? p.turretTakedowns : null;
    case "cc":
      return per(p.ccSeconds);
    case "protect":
      return num(p.teamHealing) || num(p.teamShielding) ? per((num(p.teamHealing) ? p.teamHealing : 0) + (num(p.teamShielding) ? p.teamShielding : 0)) : null;
    case "lane":
      return num(p.laneDiff) ? p.laneDiff : null;
  }
}

interface TeamTotals {
  kills: number | null;
  damage: number | null;
  taken: number | null;
  mitigated: number | null;
  gold: number | null;
  objectiveDamage: number | null;
  /** Every teammate's cleared wards are recorded (else they are left out of the wards figure for the team). */
  wardsKilled: boolean;
}

function totalsOf(team: readonly ScoreInput[], teamKills: number | null | undefined): TeamTotals {
  const sum = (get: (p: ScoreInput) => number | null) => (team.every((p) => num(get(p))) ? team.reduce((n, p) => n + (get(p) as number), 0) : null);
  return {
    kills: num(teamKills) ? teamKills : sum((p) => p.kills),
    damage: sum((p) => p.damage),
    taken: sum((p) => p.damageTaken),
    mitigated: sum((p) => p.damageMitigated),
    gold: sum((p) => p.gold),
    objectiveDamage: sum((p) => p.objectiveDamage),
    wardsKilled: team.every((p) => num(p.wardsKilled)),
  };
}

const mean = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
const spread = (xs: readonly number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((n, x) => n + (x - m) ** 2, 0) / xs.length);
};

/** The weights a player is judged by: the mode's, the recorded position's, or the role-neutral set. */
export function weightSetOf(mode: ScoreMode, lane: ScoreLane | null): WeightSet {
  if (mode === "aram") return "ARAM";
  return lane ?? "NEUTRAL";
}

/** A weighted mean (z units) on the 0–10 scale, one decimal. */
export function toTen(raw: number): number {
  return Math.round((10 / (1 + Math.exp(-SCALE_K * raw))) * 10) / 10;
}

/**
 * Every scored player's score in one game (see the note at the top). `teamKills`: each team's kills
 * as the record counts them, when a removed player's are not among the inputs (else the inputs' own
 * kills are added up). Null when the game has not two teams with players to compare.
 */
export function scoreMatch(inputs: readonly ScoreInput[], ctx: ScoreContext, teamKills: Readonly<Record<number, number>> = {}): MatchScores | null {
  const teamIds = [...new Set(inputs.map((p) => p.teamId))];
  if (teamIds.length !== 2 || inputs.length < 4 || !(ctx.minutes > 0)) return null;
  const totals = new Map(teamIds.map((id) => [id, totalsOf(inputs.filter((p) => p.teamId === id), teamKills[id])]));
  const values = new Map<ComponentKey, Map<number, number>>();
  const components: ComponentKey[] = [];
  for (const key of COMPONENT_ORDER) {
    const row = new Map<number, number>();
    for (const p of inputs) {
      const v = figure(key, p, totals.get(p.teamId)!, ctx.minutes);
      if (v !== null && Number.isFinite(v)) row.set(p.slot, v);
    }
    // The lane: those whose lane is confirmed (two of them at least); every other component: everyone, or nobody.
    const enough = key === "lane" ? row.size >= 2 : row.size === inputs.length;
    if (!enough) continue;
    const xs = [...row.values()];
    if (spread(xs) < 1e-9) continue;
    values.set(key, row);
    components.push(key);
  }
  const zOf = (key: ComponentKey, p: ScoreInput): number | null => {
    const row = values.get(key);
    const v = row?.get(p.slot);
    if (!row || v === undefined) return null;
    const xs = [...row.values()];
    const m = mean(xs);
    const sd = spread(xs);
    const zMatch = clamp((v - m) / sd, -Z_CLAMP, Z_CLAMP);
    const c = p.counterpart !== null && !MATCH_ONLY.has(key) ? row.get(p.counterpart) : undefined;
    if (c === undefined) return zMatch;
    // The difference of two players' figures has √2 times the spread of one.
    const zLane = clamp((v - c) / (sd * Math.SQRT2), -COUNTERPART_CLAMP, COUNTERPART_CLAMP);
    return (1 - COUNTERPART_SHARE) * zMatch + COUNTERPART_SHARE * zLane;
  };
  const decided = inputs.some((p) => p.win) && inputs.some((p) => !p.win);
  const players: PlayerScore[] = inputs.map((p) => {
    const weights = weightSetOf(ctx.mode, p.lane);
    const w = ROLE_WEIGHTS[weights];
    const z: Partial<Record<ComponentKey, number>> = {};
    const used: ComponentKey[] = [];
    let total = 0;
    let weight = 0;
    for (const key of components) {
      if (!(w[key] > 0)) continue;
      const zk = zOf(key, p);
      if (zk === null) continue;
      z[key] = zk;
      used.push(key);
      total += w[key] * zk;
      weight += w[key];
    }
    const mean = weight > 0 ? total / weight : 0;
    const raw = mean + (ctx.outcome !== false && decided ? (p.win ? OUTCOME_STEP : -OUTCOME_STEP) : 0);
    // What moved the score most: each component's share of the weighted mean.
    const share = used.map((key) => ({ key, z: z[key]!, part: (w[key] * z[key]!) / weight })).sort((a, b) => b.part - a.part);
    const up = share.filter((s) => s.z >= 0.35 && s.part > 0).slice(0, 2);
    const down = share.filter((s) => s.z <= -0.35 && s.part < 0).slice(-1);
    const reasons: ScoreReason[] = [...up, ...down].map((s) => ({ key: s.key, z: s.z, direction: s.z > 0 ? "above" : "below", words: s.z > 0 ? COMPONENTS[s.key].high : COMPONENTS[s.key].low }));
    return { slot: p.slot, teamId: p.teamId, score: toTen(raw), raw, rank: 0, mvp: false, ace: false, weights, used, z, reasons };
  });
  const order = [...players].sort((a, b) => b.raw - a.raw || a.slot - b.slot);
  order.forEach((p, i) => (p.rank = i + 1));
  if (decided) {
    const winners = new Set(inputs.filter((p) => p.win).map((p) => p.slot));
    const mvp = order.find((p) => winners.has(p.slot));
    const ace = order.find((p) => !winners.has(p.slot));
    if (mvp) mvp.mvp = true;
    if (ace) ace.ace = true;
  }
  return { version: SCORE_VERSION, mode: ctx.mode, scored: inputs.length, components, players };
}

/** The score's "why" in one sentence: "Stood out: strong vision, high kill participation. Held back by many deaths." Null when nothing stood out. */
export function reasonText(reasons: readonly ScoreReason[]): string | null {
  const up = reasons.filter((r) => r.direction === "above").map((r) => r.words);
  const down = reasons.filter((r) => r.direction === "below").map((r) => r.words);
  const parts: string[] = [];
  if (up.length) parts.push(`Stood out: ${up.join(", ")}.`);
  if (down.length) parts.push(`Held back by ${down.join(", ")}.`);
  return parts.length ? parts.join(" ") : null;
}

/* ---------------------------------------------------------------- the timeline */

/** One player's minute by minute record from the stored timeline (kills in ms; the frames aligned with `t`). */
export interface TimelineInput {
  slot: number;
  /** Champion kills made, died in and assisted (ms into the game); null on a timeline kept before they were. */
  kills: readonly number[] | null;
  deaths: readonly number[] | null;
  assists: readonly number[] | null;
  /** Gold, experience and CS at every frame; null when the player's frames have a gap. */
  frames: { g: readonly number[]; x: readonly number[]; c: readonly number[] } | null;
}

export interface TimelinePoint {
  /** Minutes into the game. */
  minute: number;
  /** Each scored player's score at that moment, by slot. */
  scores: Record<number, number>;
  /** What the moment's scores read (the final point reads the whole record). */
  components: ComponentKey[];
  /** The game's end: the final score, read from the whole record. */
  final: boolean;
}

/**
 * The damping minutes (v2): a moment's weighted mean is multiplied by minutes ÷ (minutes + this)
 * before the curve, so early points, read from a handful of kills and a few minutes of farm, sit
 * near 5 and come into their own as the game goes on: on the Rift 0.38 at 5:00, 0.56 at 10:00, 0.65
 * at 15:00, 0.76 at 25:00; on ARAM (five minutes) 0.38 at 3:00, 0.55 at 6:00. Only the moment's own
 * minutes are read, never the game's length or its final figures. The final point is never damped.
 */
export const DAMPING_MINUTES: Record<ScoreMode, number> = { rift: 8, aram: 5 };

/**
 * The share of a player's final weighting a moment reads (v2): the weights of the components it
 * could use over those of the final score's. A moment before the end reads only kills, deaths,
 * assists, farm, gold and the lane, so a support's point (judged mostly on vision, wards, crowd
 * control and protecting the team at the end) is shrunk further toward 5 than a carry's.
 */
export function coverageOf(at: Pick<PlayerScore, "used" | "weights">, final: Pick<PlayerScore, "used" | "weights"> | undefined): number {
  if (!final) return 0;
  const w = ROLE_WEIGHTS[final.weights];
  const sum = (keys: readonly ComponentKey[]) => keys.reduce((n, k) => n + w[k], 0);
  const whole = sum(final.used);
  return whole > 0 ? Math.min(1, sum(at.used) / whole) : 0;
}

/** How much a moment's evidence counts, from 0 to 1 (DAMPING_MINUTES). */
export const evidenceAt = (mode: ScoreMode, minutes: number) => (minutes > 0 ? minutes / (minutes + DAMPING_MINUTES[mode]) : 0);

/** Minutes between a timeline's points: five on Summoner's Rift, three on ARAM's shorter games. */
export const timelineStep = (mode: ScoreMode) => (mode === "aram" ? 3 : 5);

/** The lane minutes the score reads (domain/match-analysis LANE_MINUTES). */
const LANE_AT = [10, 15] as const;

/** A series' value at an exact moment, read between its frames (null outside them). */
export function seriesAt(t: readonly number[], s: readonly number[], ms: number): number | null {
  if (!t.length || s.length !== t.length || ms < t[0]! || ms > t[t.length - 1]!) return null;
  let i = 0;
  while (i < t.length - 1 && t[i + 1]! < ms) i++;
  if (t[i] === ms || i === t.length - 1) return s[i]!;
  const [a, b] = [t[i]!, t[i + 1]!];
  return s[i]! + ((s[i + 1]! - s[i]!) * (ms - a)) / (b - a);
}

/**
 * The lane figure up to a moment: gold plus experience ahead of the lane opponent, the mean of 10:00
 * and 15:00 once the moment has passed them (what the final score reads), before 10:00 the moment
 * itself. Null without both players' frames there.
 */
export function laneValue(t: readonly number[], me: { g: readonly number[]; x: readonly number[] }, them: { g: readonly number[]; x: readonly number[] }, uptoMs: number): number | null {
  const at = (ms: number) => {
    const [g1, x1, g2, x2] = [seriesAt(t, me.g, ms), seriesAt(t, me.x, ms), seriesAt(t, them.g, ms), seriesAt(t, them.x, ms)];
    return g1 === null || x1 === null || g2 === null || x2 === null ? null : g1 + x1 - g2 - x2;
  };
  const passed = LANE_AT.filter((m) => m * 60_000 <= uptoMs).map((m) => at(m * 60_000));
  if (passed.length) return passed.every((v) => v !== null) ? mean(passed as number[]) : null;
  return at(uptoMs);
}

/**
 * The score at every step of the timeline (five minutes on the Rift, three on ARAM), each from what
 * the timeline had recorded by then and nothing later: kills, deaths and assists by that moment
 * (team kills too), CS and gold at that moment, and the lane against the opponent up to it. Damage,
 * vision, wards, crowd control, healing, objectives and turrets are known only at the end, so the
 * moments before it are scored on the rest, and no result step is applied before the end (the
 * result was not known yet). The last point is the game's end and is the final score itself, from
 * the whole record. Null when the timeline has no frames or the final score is not there.
 */
export function timelineScores(inputs: readonly ScoreInput[], timeline: { t: readonly number[]; players: readonly TimelineInput[] }, final: MatchScores | null, ctx: { mode: ScoreMode; durationMinutes: number }): TimelinePoint[] | null {
  const { t } = timeline;
  if (!final || !t.length) return null;
  const by = new Map(timeline.players.map((p) => [p.slot, p]));
  const finalBy = new Map(final.players.map((p) => [p.slot, p]));
  const end = t[t.length - 1]!;
  const step = timelineStep(ctx.mode) * 60_000;
  // Every scored player's kills on the timeline, or no kill figure at any moment (a team's kills would be short).
  const killsKept = inputs.every((p) => by.get(p.slot)?.kills && by.get(p.slot)?.deaths && by.get(p.slot)?.assists);
  const points: TimelinePoint[] = [];
  for (let ms = step; ms < end - 30_000; ms += step) {
    const upto = (xs: readonly number[] | null | undefined) => (xs ? xs.filter((x) => x <= ms).length : null);
    const at: ScoreInput[] = inputs.map((p) => {
      const tp = by.get(p.slot);
      const f = tp?.frames ?? null;
      const them = p.counterpart !== null ? by.get(p.counterpart)?.frames : null;
      return {
        ...p,
        kills: killsKept ? upto(tp!.kills) : null,
        deaths: killsKept ? upto(tp!.deaths) : null,
        assists: killsKept ? upto(tp!.assists) : null,
        cs: f ? seriesAt(t, f.c, ms) : null,
        gold: f ? seriesAt(t, f.g, ms) : null,
        damage: null,
        damageTaken: null,
        damageMitigated: null,
        vision: null,
        wardsPlaced: null,
        wardsKilled: null,
        objectiveDamage: null,
        turretTakedowns: null,
        ccSeconds: null,
        teamHealing: null,
        teamShielding: null,
        laneDiff: ctx.mode === "rift" && f && them ? laneValue(t, f, them, ms) : null,
      };
    });
    const minutes = ms / 60_000;
    const scores = scoreMatch(at, { mode: ctx.mode, minutes, outcome: false });
    if (!scores || !scores.components.length) continue;
    // Damped toward the game's average by how much of the game had been played (evidenceAt).
    const e = evidenceAt(ctx.mode, minutes);
    points.push({ minute: minutes, scores: Object.fromEntries(scores.players.map((p) => [p.slot, toTen(p.raw * e * coverageOf(p, finalBy.get(p.slot)))])), components: scores.components, final: false });
  }
  points.push({ minute: ctx.durationMinutes, scores: Object.fromEntries(final.players.map((p) => [p.slot, p.score])), components: final.components, final: true });
  return points;
}

/** The one-word trend a player's timeline earns (TREND_RULES), with its sentence. */
export type TrendWord = "Dominant" | "Struggling" | "Resilient" | "Rising" | "Fading" | "Fast start" | "Erratic" | "Steady";

/**
 * The rules, on the points before the end (the final point reads more of the record, so it is not
 * compared with them) and only with three or more of them; "Resilient" also reads the final score.
 * The first and last thirds are the first and last ceil(n/3) points. The first rule that holds, in
 * this order, names the trend; none may hold.
 */
export const TREND_RULES = {
  /** "Dominant": every point at least this. "Struggling": every point at most 10 minus it. */
  every: 6.5,
  /** "Resilient": the first third's mean at most this, and the final score at least `resilientEnd`. */
  resilientStart: 4,
  resilientEnd: 5.5,
  /** "Rising" / "Fading": the last third's mean this much above / below the first third's. */
  change: 1.5,
  /** "Fast start": the first third's mean at least this. */
  early: 6.5,
  /** "Erratic": the highest and lowest point this far apart. */
  swing: 4,
  /** "Steady": the highest and lowest point at most this far apart. */
  steady: 1.5,
} as const;

/** Each trend's sentence: what the rule found, in plain words. */
export const TREND_SENTENCES: Record<TrendWord, string> = {
  Dominant: "Ahead of the game's average at every point of the timeline.",
  Struggling: "Behind the game's average at every point of the timeline.",
  Resilient: "Recovered from a weak start to finish above the game's average.",
  Rising: "Grew stronger as the game went on.",
  Fading: "Started stronger than they finished.",
  "Fast start": "Started the game ahead of the others.",
  Erratic: "Swung between strong and weak stretches.",
  Steady: "Held much the same level throughout.",
};

/** The trend of a player's points before the end (and their final score, for "Resilient"), or null. */
export function trendOf(points: readonly number[], finalScore: number | null = null): { word: TrendWord; sentence: string } | null {
  if (points.length < 3) return null;
  const third = Math.ceil(points.length / 3);
  const first = mean(points.slice(0, third));
  const last = mean(points.slice(-third));
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const word: TrendWord | null =
    lo >= TREND_RULES.every
      ? "Dominant"
      : hi <= 10 - TREND_RULES.every
        ? "Struggling"
        : first <= TREND_RULES.resilientStart && finalScore !== null && finalScore >= TREND_RULES.resilientEnd
          ? "Resilient"
          : last - first >= TREND_RULES.change
            ? "Rising"
            : first - last >= TREND_RULES.change
              ? "Fading"
              : first >= TREND_RULES.early
                ? "Fast start"
                : hi - lo >= TREND_RULES.swing
                  ? "Erratic"
                  : hi - lo <= TREND_RULES.steady
                    ? "Steady"
                    : null;
  return word ? { word, sentence: TREND_SENTENCES[word] } : null;
}

/** A score this high or higher is called "Excellent" beside it (a band of its own; nothing else is named). */
export const EXCELLENT_AT = 8;

/** Each team's mean score (its scored players), by team id. */
export function teamAverages(scores: Pick<MatchScores, "players">): Record<number, number> {
  const by = new Map<number, number[]>();
  for (const p of scores.players) by.set(p.teamId, [...(by.get(p.teamId) ?? []), p.score]);
  return Object.fromEntries([...by].map(([team, xs]) => [team, Math.round(mean(xs) * 10) / 10]));
}
