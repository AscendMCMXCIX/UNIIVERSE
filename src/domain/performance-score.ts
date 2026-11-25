/*
  PERFORMANCE SCORE (v3): how well each of a game's players played, 0 to 10, from that one game's
  record alone (docs/PERFORMANCE_SCORE.md has the model, its weights, worked examples and its
  limits). Deterministic and pure: the same game always gives the same scores, and nothing outside
  the game is read (no history, no baseline of other games, which a team tool does not have).

  - Each component is a figure every scored player has (kill participation, KDA, deaths, damage
    share, damage taken and mitigated, CS per minute, gold share, vision per minute, wards,
    objective damage, turret takedowns, crowd control, healing and shielding of teammates, and the
    lane against the lane opponent at 10:00 and 15:00 where the timeline confirms it).
  - Against the role, then within the match (v3): a figure is first compared with its role's typical
    figure (TYPICAL_FIGURES; as a proportion for shares and rates), so a typical game scores alike in
    every role; the residuals then become z-scores against the game's (their median and spread, the
    spread at least MIN_SPREAD), clamped to ±2.5 so one extreme figure cannot carry a game alone. Where the player's
    lane opponent is known, 40% of it is the comparison with that opponent instead (role-relative),
    that part bounded to ±0.5 (COUNTERPART_CLAMP): a support's CS is measured partly against the
    other support, not only against the carries, and an opponent's outstanding game cannot alone
    sink an ordinary one (v2, 23 Nov 2026; v1 had 60% bounded to ±2.5).
  - Per role: each role weighs the components differently (ROLE_WEIGHTS: supports on vision, wards,
    kill participation, crowd control and protecting their team; carries on damage and farm;
    junglers on objectives and kill participation). ARAM has weights of its own (no lanes, no farm,
    no vision), and a player whose position is not recorded gets the role-neutral weights.
  - The weighted mean of the z-scores (crowd control and protection counted as the better of the
    two), plus a small step for the result (OUTCOME_STEP: +0.05 for a win, −0.05 for a loss), is
    mapped to 0–10 by a logistic curve (SCALE_K), one decimal: 5.0 is a typical game; the result
    alone moves a score by about 0.2 points.
  - A component is used only when every scored player has it (a record that lacks a figure for one
    player leaves it out for all, so nobody is compared on a figure others were not). The lane is the one exception: it counts for the players whose lane the
    timeline confirms, and the others are scored without it.
  - Rank: all scored players by score; MVP is the winning team's highest, ACE the losing team's. A
    game without a winner (a remake) has neither.

  Never shown as anyone else's rating, and never as more than what it is: a comparison within one
  game. A removed player (personal data erased) is not scored and is not part of the comparison.
*/

export const SCORE_VERSION = "v3";

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
  TOP: { kp: 0.5, kda: 0.8, deaths: 0.8, damage: 1.2, tanking: 1.3, farm: 1.2, gold: 0.8, vision: 0.3, wards: 0.2, objectives: 0.6, turrets: 0, cc: 0.5, protect: 0.1, lane: 1.1 },
  JUNGLE: { kp: 1.4, kda: 1.0, deaths: 0.8, damage: 0.8, tanking: 0.6, farm: 0.7, gold: 0.6, vision: 0.8, wards: 0.5, objectives: 1.5, turrets: 0, cc: 0.5, protect: 0.1, lane: 0.6 },
  MIDDLE: { kp: 1.1, kda: 1.0, deaths: 0.8, damage: 1.4, tanking: 0.3, farm: 1.1, gold: 0.8, vision: 0.5, wards: 0.3, objectives: 0.4, turrets: 0, cc: 0.4, protect: 0.1, lane: 1.0 },
  BOTTOM: { kp: 1.0, kda: 1.0, deaths: 0.9, damage: 1.5, tanking: 0.2, farm: 1.2, gold: 0.9, vision: 0.4, wards: 0.2, objectives: 0.5, turrets: 0, cc: 0.2, protect: 0.1, lane: 1.0 },
  UTILITY: { kp: 1.5, kda: 1.0, deaths: 0.8, damage: 0.5, tanking: 0.5, farm: 0.1, gold: 0.2, vision: 1.4, wards: 1.1, objectives: 0.3, turrets: 0, cc: 1.0, protect: 1.0, lane: 0.6 },
  NEUTRAL: { kp: 1.2, kda: 1.0, deaths: 0.8, damage: 1.0, tanking: 0.5, farm: 0.7, gold: 0.6, vision: 0.7, wards: 0.4, objectives: 0.6, turrets: 0, cc: 0.5, protect: 0.4, lane: 0 },
  ARAM: { kp: 1.4, kda: 1.0, deaths: 0.6, damage: 1.5, tanking: 0.9, farm: 0, gold: 0.4, vision: 0, wards: 0, objectives: 0.2, turrets: 0, cc: 0.7, protect: 0.7, lane: 0 },
};

/** A z-score's bound: one figure far from the rest moves a score, but cannot decide it alone. */
export const Z_CLAMP = 2.5;
/** The share of a role-relative component that is the comparison with the lane opponent (the rest is the match). */
export const COUNTERPART_SHARE = 0.4;
/** How far the comparison with the lane opponent alone can pull a component, in z units (the match part keeps ±Z_CLAMP). */
export const COUNTERPART_CLAMP = 0.5;
/** The result's step, in the weighted mean's units (z-scores): a win adds it, a loss takes it away (about ±0.2 points; v1–v2 had 0.1). */
export const OUTCOME_STEP = 0.05;
/** The logistic curve's slope: a weighted mean of +1 (a game a standard deviation above the match on everything weighed) is 8.3. */
export const SCALE_K = 1.6;
/** The one component never blended with the lane opponent: it already is that comparison. */
const MATCH_ONLY: ReadonlySet<ComponentKey> = new Set(["lane"]);

/**
 * Each component's smallest spread (v3), in its own units: a game where the players hardly differ on
 * a figure is not blown up into large z-scores by dividing by a tiny spread (one jungler's 50 healing
 * among nine zeros, one turret in the game). About the size of a difference worth noticing.
 */
export const MIN_SPREAD: Record<ComponentKey, number> = {
  // Shares and rates are compared as proportions of the role's reference (log units: 0.15 is about 15%).
  kp: 0.15,
  damage: 0.15,
  tanking: 0.15,
  gold: 0.1,
  objectives: 0.2,
  farm: 0.1,
  vision: 0.15,
  wards: 0.15,
  cc: 0.2,
  protect: 0.2,
  // The rest in their own units.
  kda: 0.15, // on the KDA's log scale: about 3.0 against 3.6
  deaths: 0.5, // deaths per ten minutes
  turrets: 0.3, // turret takedowns per ten minutes
  lane: 500, // gold plus experience ahead of the lane opponent
};

/**
 * The components compared as proportions (v3): a share or a rate is read as ln((figure + ε) ÷
 * (reference + ε)), so a short game's higher rates, or a support's small numbers, move every role
 * alike; ε (in the component's own units) keeps a zero from becoming minus infinity.
 */
export const PROPORTION_EPSILON: Partial<Record<ComponentKey, number>> = { kp: 0.02, damage: 0.02, tanking: 0.02, gold: 0.02, objectives: 0.02, farm: 0.5, vision: 0.2, wards: 0.1, cc: 0.2, protect: 30 };

/** Team facts more than a role's (towers fall to whoever is there): compared with the match's mean, not a role's reference. */
const MATCH_CENTRED: ReadonlySet<ComponentKey> = new Set(["turrets", "lane"]);

/** A figure against its centre: as a proportion (PROPORTION_EPSILON) or a difference. */
function residualOf(key: ComponentKey, v: number, centre: number): number {
  const e = PROPORTION_EPSILON[key];
  return e === undefined ? v - centre : Math.log((Math.max(0, v) + e) / (Math.max(0, centre) + e));
}

/**
 * Each role's typical figures in a 30-minute ranked game (v3: the role reference): the figures a
 * player of that role usually has, which the score compares each player's own with first, so that a
 * typical game in every role scores the same (a support's low CS or a carry's high damage is what
 * the role does, not a merit or a fault). The values of the docs' and the tests' typical game; a
 * reference is the figure() of them, so shares and rates mean the same at any game length.
 */
export const TYPICAL_FIGURES: Record<ScoreLane, Omit<ScoreInput, "slot" | "teamId" | "win" | "lane" | "counterpart" | "laneDiff">> = {
  TOP: { kills: 5, deaths: 5, assists: 6, cs: 210, gold: 12_000, damage: 22_000, damageTaken: 30_000, damageMitigated: 25_000, vision: 20, wardsPlaced: 9, wardsKilled: 3, objectiveDamage: 9_000, turretTakedowns: 2, ccSeconds: 20, teamHealing: 0, teamShielding: 0 },
  JUNGLE: { kills: 5, deaths: 5, assists: 9, cs: 170, gold: 11_500, damage: 16_000, damageTaken: 32_000, damageMitigated: 20_000, vision: 32, wardsPlaced: 10, wardsKilled: 6, objectiveDamage: 35_000, turretTakedowns: 1, ccSeconds: 25, teamHealing: 500, teamShielding: 0 },
  MIDDLE: { kills: 6, deaths: 5, assists: 7, cs: 220, gold: 12_500, damage: 25_000, damageTaken: 20_000, damageMitigated: 10_000, vision: 22, wardsPlaced: 9, wardsKilled: 3, objectiveDamage: 7_000, turretTakedowns: 2, ccSeconds: 18, teamHealing: 0, teamShielding: 0 },
  BOTTOM: { kills: 7, deaths: 5, assists: 7, cs: 240, gold: 13_500, damage: 27_000, damageTaken: 18_000, damageMitigated: 7_000, vision: 18, wardsPlaced: 9, wardsKilled: 2, objectiveDamage: 8_000, turretTakedowns: 3, ccSeconds: 5, teamHealing: 0, teamShielding: 0 },
  UTILITY: { kills: 1, deaths: 6, assists: 14, cs: 35, gold: 8_000, damage: 9_000, damageTaken: 18_000, damageMitigated: 12_000, vision: 70, wardsPlaced: 30, wardsKilled: 6, objectiveDamage: 2_000, turretTakedowns: 1, ccSeconds: 30, teamHealing: 2_000, teamShielding: 2_000 },
};

const LANES_IN_ORDER: readonly ScoreLane[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
let references: Record<ScoreLane, Partial<Record<ComponentKey, number>>> | null = null;

/** Each role's reference for each component: the figure() of its typical figures in a typical team (the lane's reference is 0, even). */
export function roleReferences(): Record<ScoreLane, Partial<Record<ComponentKey, number>>> {
  if (references) return references;
  const team = LANES_IN_ORDER.map((lane, slot): ScoreInput => ({ slot, teamId: 100, win: true, lane, counterpart: null, laneDiff: 0, ...TYPICAL_FIGURES[lane] }));
  const totals = totalsOf(team, null);
  references = Object.fromEntries(team.map((p) => [p.lane, Object.fromEntries(COMPONENT_ORDER.map((k) => [k, figure(k, p, totals, 30)]))])) as Record<ScoreLane, Partial<Record<ComponentKey, number>>>;
  return references;
}

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
  /** The minutes the figures cover (the game's length). */
  minutes: number;
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
      // Per ten minutes (v3), so a long game's extra towers are not a merit of their own.
      return num(p.turretTakedowns) && minutes > 0 ? (p.turretTakedowns / minutes) * 10 : null;
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
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
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
  const residuals = new Map<ComponentKey, { r: Map<number, number>; m: number; sd: number }>();
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
    // v3: each figure less its role's reference (a player without a recorded position, or on ARAM,
    // less the match's mean), then compared with the other players' residuals: their mean and
    // spread, the spread at least MIN_SPREAD.
    const plain = mean([...row.values()]);
    const residual = new Map([...row].map(([slot, v]) => {
      const p = inputs.find((x) => x.slot === slot)!;
      const ref = ctx.mode === "rift" && p.lane && !MATCH_CENTRED.has(key) ? roleReferences()[p.lane][key] : undefined;
      return [slot, residualOf(key, v, typeof ref === "number" ? ref : key === "lane" ? 0 : plain)] as const;
    }));
    const rs = [...residual.values()];
    values.set(key, row);
    // Centred on the median residual, so one player far from the rest (a lone healer) does not shift everyone else.
    residuals.set(key, { r: residual, m: median(rs), sd: Math.max(spread(rs), MIN_SPREAD[key]) });
    components.push(key);
  }
  const zOf = (key: ComponentKey, p: ScoreInput): number | null => {
    const row = values.get(key);
    const res = residuals.get(key);
    const v = row?.get(p.slot);
    const r = res?.r.get(p.slot);
    if (!row || !res || v === undefined || r === undefined) return null;
    const zMatch = clamp((r - res.m) / res.sd, -Z_CLAMP, Z_CLAMP);
    const c = p.counterpart !== null && !MATCH_ONLY.has(key) ? res.r.get(p.counterpart) : undefined;
    if (c === undefined) return zMatch;
    // The difference of two players' residuals (the same role: the same reference) has √2 times the spread of one.
    const zLane = clamp((r - c) / (res.sd * Math.SQRT2), -COUNTERPART_CLAMP, COUNTERPART_CLAMP);
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
    // Crowd control and protecting teammates are one contribution (v3): the better of the two, at
    // both weights, so an engage support is not marked down for shielding little, nor an enchanter
    // for stunning little.
    const zcc = components.includes("cc") && w.cc > 0 ? zOf("cc", p) : null;
    const zpr = components.includes("protect") && w.protect > 0 ? zOf("protect", p) : null;
    const utility: ComponentKey | null = zcc !== null && zpr !== null ? (zpr > zcc ? "protect" : "cc") : null;
    for (const key of components) {
      if (!(w[key] > 0)) continue;
      if (utility && (key === "cc" || key === "protect") && key !== utility) continue;
      const zk = zOf(key, p);
      if (zk === null) continue;
      const wk = utility === key ? w.cc + w.protect : w[key];
      z[key] = zk;
      used.push(key);
      total += wk * zk;
      weight += wk;
    }
    const mean = weight > 0 ? total / weight : 0;
    const raw = mean + (decided ? (p.win ? OUTCOME_STEP : -OUTCOME_STEP) : 0);
    // What moved the score most: each component's share of the weighted mean.
    const share = used.map((key) => ({ key, z: z[key]!, part: ((utility === key ? w.cc + w.protect : w[key]) * z[key]!) / weight })).sort((a, b) => b.part - a.part);
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

/* ---------------------------------------------------------------- the lane */

/*
  The timeline's one part in the score: the lane against the lane opponent at 10:00 and 15:00. The
  score through the game (a score at every five minutes, its damping and priors, and the trend words
  read from it) was removed at the owner's request of 25 Nov 2026 with the chart that showed it;
  final scores are unchanged (still v3).
*/

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

/** A score this high or higher is called "Excellent" beside it (a band of its own; nothing else is named). */
export const EXCELLENT_AT = 8;

/** Each team's mean score (its scored players), by team id. */
export function teamAverages(scores: Pick<MatchScores, "players">): Record<number, number> {
  const by = new Map<number, number[]>();
  for (const p of scores.players) by.set(p.teamId, [...(by.get(p.teamId) ?? []), p.score]);
  return Object.fromEntries([...by].map(([team, xs]) => [team, Math.round(mean(xs) * 10) / 10]));
}
