import { laneOf, laneOpponentOf, type LaneSeat } from "@/domain/match-analysis";

/*
  MATCHUP INTEL's evidence from the team's own games (docs/MATCHUP_INTEL.md, "In your games"): what
  one member's stored game says about their preparation, kept once per game in
  `account_match_prep` so the page counts it in SQL and only counts leave the database. Everything
  here is read from the game's own stored record and timeline, never inferred beyond them:
  - the lane, and the lane opponent by the confirmed-opponent rule (confirmedOpponent below);
  - the rune page, the summoner spells, the starting items, the first shop visit, the first three
    completed items and the skill order;
  - for a jungler, the dragons, voidgrubs and heralds the team took before 15:00 out of all taken;
  - the lane's end, measured from the positions the timeline keeps (laneEnd below).
  A field is left out when the record or the timeline cannot give it, never guessed.
*/

/**
 * The rules' revision each stored row carries. The page counts only rows of this revision, so a
 * change of rules shows nothing of the old rows; making them again then needs a job of its own
 * (prep-backfill only inserts missing rows).
 */
export const PREP_FORMAT = 1;

export type PrepLane = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

/** One member's preparation in one stored game (the jsonb of `account_match_prep.prep`). */
export interface MatchPrep {
  /** PREP_FORMAT when it was made. */
  f: number;
  /** The member's lane by the reading the opponent rule used; null when the record names none. */
  lane: PrepLane | null;
  /**
   * How the lane opponent is known: "confirmed" (Riot's team position on both players, one per lane
   * on each team, and its individual position agreeing), "position" (a record stored before both
   * readings were kept: its one merged position held by exactly one player on each side), or null,
   * "role unclear" (never counted against an opponent).
   */
  rule: "confirmed" | "position" | null;
  /** The lane opponent's champion, under `rule`. */
  vs?: string;
  /** In the bot lane: the member's lane partner's champion, under the same rule. */
  ally?: string;
  /** In the bot lane: the enemy in the partner's lane, under the same rule. */
  vs2?: string;
  /** The keystone alone (every record has it). */
  ks?: number;
  /** The full rune page, "primary tree:four runes|secondary tree:two runes" (records with the whole page only). */
  runes?: string;
  /** The two summoner spells, ascending ("4,14"). */
  spells?: string;
  /** Items bought in the first minute, ascending, repeats kept ("1055,2003"). */
  start?: string;
  /** The first shop visit after the first minute: purchases less than 30 s apart, ascending. */
  back?: string;
  /** The first completed items, at most three, in the order bought ("6692>3071>6333"). */
  items?: string;
  /** The first three skill points ("QEW"). */
  skills?: string;
  /** The skills (Q, W, E) that reached five points, in the order they did ("QE"); absent when none did. */
  max?: string;
  /** A jungler's team: dragons, voidgrubs and heralds it took before 15:00, of all taken by both teams then. */
  obj?: { taken: number; total: number };
  /** When the lane ended, ms into the game (laneEnd). */
  end?: number;
  /** Whether a timeline was read (without one only the record's fields are kept). */
  tl: boolean;
}

/** A player in a stored record, as far as preparation needs one. */
export interface PrepParticipant extends LaneSeat {
  puuid: string;
  championId: string | null;
  spells?: number[] | null;
  runes?: { keystone: number | null; primary: number | null; secondary: number | null; primaryPerks?: number[]; secondaryPerks?: number[] } | null;
}

export interface PrepTimeline {
  participants: ReadonlyArray<{ puuid: string; purchases: ReadonlyArray<readonly [number, number]>; skills: readonly number[] }>;
  frames?: { t: readonly number[]; p: Record<string, { px?: readonly number[]; py?: readonly number[] }> } | null;
  events?: { objectives: ReadonlyArray<{ t: number; team: number; kind: string; detail?: string }> } | null;
}

/** What preparation reads of an item: Data Dragon's shop facts (RiotAssets.itemInfo). */
export interface PrepItemInfo {
  gold: { total: number };
  tags: readonly string[];
  into: readonly string[];
  depth: number;
}

/** The first minute: what is bought in it is the starting set. */
export const START_MS = 60_000;
/** Purchases closer than this belong to one shop visit. */
export const VISIT_GAP_MS = 30_000;
/** Jungle objectives are counted before this (15:00). */
export const OBJECTIVE_MS = 15 * 60_000;
/** The lane is read for its end from 2:00 (mi-evidence §2.3). */
export const LANE_FROM_MS = 2 * 60_000;
const SKILL = ["", "Q", "W", "E", "R"] as const;
const LANES: readonly PrepLane[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

const asLane = (v: string | null): PrepLane | null => (v && (LANES as readonly string[]).includes(v) ? (v as PrepLane) : null);

/**
 * The lane opponent by the confirmed-opponent rule (mi-evidence §2.1), for the player in `meSlot`:
 * - on a record that keeps Riot's two readings, both players' `teamPosition` names the lane, every
 *   team's five team positions differ, and `individualPosition` agrees for both: "confirmed";
 *   anything else is null, role unclear (no fallback to the individual position for evidence);
 * - on an older record, which keeps only the merged position, the one lane opponent rule's answer
 *   (one player on each side in the position): "position", said as "lane opponent by Riot's position".
 */
export function confirmedOpponent(parts: readonly LaneSeat[], meSlot: number): { slot: number; rule: "confirmed" | "position" } | null {
  const me = parts[meSlot];
  if (!me || me.removed) return null;
  if (typeof me.teamPosition !== "string") {
    const slot = laneOpponentOf(parts, meSlot);
    return slot === null ? null : { slot, rule: "position" };
  }
  const lane = laneOf(me.teamPosition);
  if (!lane || parts.some((p) => p.removed)) return null;
  for (const team of new Set(parts.map((p) => p.teamId))) {
    const lanes = parts.filter((p) => p.teamId === team).map((p) => laneOf(p.teamPosition));
    if (lanes.some((l) => !l) || new Set(lanes).size !== lanes.length) return null;
  }
  const slot = parts.findIndex((p) => p.teamId !== me.teamId && laneOf(p.teamPosition) === lane);
  if (slot < 0) return null;
  const agrees = (p: LaneSeat) => laneOf(p.individualPosition) === lane;
  return agrees(me) && agrees(parts[slot]!) ? { slot, rule: "confirmed" } : null;
}

/** The member's lane partner in the bot lane (the ally in the other bot position), by the same rule as the opponent; null when unclear. */
function partnerOf(parts: readonly LaneSeat[], meSlot: number, rule: "confirmed" | "position"): number | null {
  const me = parts[meSlot]!;
  const reading = rule === "confirmed" ? "teamPosition" : "position";
  const lane = laneOf(me[reading]);
  if (lane !== "BOTTOM" && lane !== "UTILITY") return null;
  const other = lane === "BOTTOM" ? "UTILITY" : "BOTTOM";
  const allies = parts.flatMap((p, i) => (!p.removed && p.teamId === me.teamId && laneOf(p[reading]) === other ? [i] : []));
  if (allies.length !== 1) return null;
  const ally = parts[allies[0]!]!;
  if (rule === "confirmed" && laneOf(ally.individualPosition) !== other) return null;
  return allies[0]!;
}

const sortedIds = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(",");

/** The full rune page as one key, or null when the record keeps only the keystone and paths. */
export function runePageKey(runes: PrepParticipant["runes"]): string | null {
  if (!runes || runes.primary === null || runes.secondary === null) return null;
  const p = runes.primaryPerks ?? [];
  const s = runes.secondaryPerks ?? [];
  if (p.length !== 4 || s.length !== 2) return null;
  return `${runes.primary}:${p.join(",")}|${runes.secondary}:${s.join(",")}`;
}

/** Parses a rune page key back: the trees and the six runes, keystone first. */
export function parseRunePage(key: string): { primary: number; secondary: number; perks: number[] } | null {
  const m = /^(\d+):(\d+(?:,\d+){3})\|(\d+):(\d+,\d+)$/.exec(key);
  if (!m) return null;
  return { primary: Number(m[1]), secondary: Number(m[3]), perks: [...m[2]!.split(","), ...m[4]!.split(",")].map(Number) };
}

/**
 * An item that is "completed": Summoner's Rift's, building into nothing, made from components
 * (depth 2 or more), worth at least 1,000 gold, and neither boots, a consumable nor a trinket.
 */
export function isCompletedItem(info: PrepItemInfo | undefined): boolean {
  if (!info) return false;
  if (info.into.length || info.depth < 2 || info.gold.total < 1000) return false;
  return !info.tags.some((t) => t === "Boots" || t === "Consumable" || t === "Trinket");
}

/** The first three skill points and the skills to reach five points in order, from the levelled slots in order (1 Q … 4 R). */
export function skillOrder(skills: readonly number[]): { skills?: string; max?: string } {
  const basic = skills.filter((s) => s >= 1 && s <= 4);
  if (basic.length < 3) return {};
  const first = basic.slice(0, 3).map((s) => SKILL[s]).join("");
  const points = [0, 0, 0, 0, 0];
  const maxedAt: Record<number, number> = {};
  basic.forEach((s, i) => {
    points[s]! += 1;
    if (s <= 3 && points[s] === 5 && maxedAt[s] === undefined) maxedAt[s] = i;
  });
  // Only the skills that reached five points, in the order they did: a skill short of five is not
  // called maxed (some champions' skills take six), and the order says no more than the game shows.
  const order = Object.keys(maxedAt)
    .map(Number)
    .sort((a, b) => maxedAt[a]! - maxedAt[b]!);
  return { skills: first, ...(Object.keys(maxedAt).length ? { max: order.map((s) => SKILL[s]).join("") } : {}) };
}

/*
  The lane regions, in Riot's map units (Summoner's Rift is about 14,870 across; blue's base at the
  bottom left, red's at the top right). Generous bands along each lane, so a player standing in the
  lane's brush or a step into the river beside it still counts as in the lane; the bases are their
  own region (a trip to the fountain neither keeps nor ends the lane).
*/
const BAND = 2_600;
export function regionOf(x: number, y: number): "base" | "TOP" | "MIDDLE" | "BOTTOM" | "elsewhere" {
  if ((x < 4_200 && y < 4_200) || (x > 10_600 && y > 10_600)) return "base";
  if (x < BAND || y > 14_870 - BAND) return "TOP";
  if (y < BAND || x > 14_870 - BAND) return "BOTTOM";
  if (Math.abs(x - y) < 1_900) return "MIDDLE";
  return "elsewhere";
}

const LANE_REGION: Partial<Record<PrepLane, "TOP" | "MIDDLE" | "BOTTOM">> = { TOP: "TOP", MIDDLE: "MIDDLE", BOTTOM: "BOTTOM", UTILITY: "BOTTOM" };
const TOWER_LANE: Record<string, string> = { TOP: "TOP", MIDDLE: "MID", BOTTOM: "BOT" };

/**
 * When the lane ended (mi-evidence §2.3), for a laner and their confirmed opponent: the earlier of
 * the lane's outer turret falling (either side's) and either player being out of the lane's region
 * for two frames in a row from 2:00 on (frames in a base do not count either way). Only from a
 * timeline that keeps both players' positions in every frame: without them it is not measured
 * (undefined), as it is when neither happens before the game ends. Never for the jungle, whose
 * comparable end (the first contested epic objective) the stored events cannot tell.
 */
export function laneEnd(lane: PrepLane | null, me: string, opponent: string, timeline: PrepTimeline): number | undefined {
  const region = lane ? LANE_REGION[lane] : undefined;
  const frames = timeline.frames;
  if (!region || !frames?.t.length) return undefined;
  const a = frames.p[me];
  const b = frames.p[opponent];
  if (!a?.px || !a.py || !b?.px || !b.py) return undefined;
  const n = frames.t.length;
  if ([a.px, a.py, b.px, b.py].some((s) => s.length !== n)) return undefined;
  let left: number | undefined;
  for (const s of [a, b]) {
    let out = 0;
    for (let i = 0; i < n; i++) {
      if (frames.t[i]! < LANE_FROM_MS) continue;
      const r = regionOf(s.px![i]!, s.py![i]!);
      if (r === "base") continue;
      out = r === region ? 0 : out + 1;
      if (out === 2) {
        left = left === undefined ? frames.t[i]! : Math.min(left, frames.t[i]!);
        break;
      }
    }
  }
  const tower = (timeline.events?.objectives ?? []).find((o) => o.kind === "tower" && o.detail === `${TOWER_LANE[region]} OUTER`)?.t;
  const ends = [left, tower].filter((t): t is number => typeof t === "number");
  return ends.length ? Math.min(...ends) : undefined;
}

/** Dragons (elder included), voidgrubs and heralds before 15:00: the jungler's team's share. */
export function earlyObjectives(team: number, timeline: PrepTimeline): { taken: number; total: number } | undefined {
  const events = timeline.events;
  if (!events) return undefined;
  const early = events.objectives.filter((o) => o.t < OBJECTIVE_MS && (o.kind === "dragon" || o.kind === "elder" || o.kind === "grubs" || o.kind === "herald"));
  return { taken: early.filter((o) => o.team === team).length, total: early.length };
}

/**
 * One member's preparation in a stored game: from its record's participants (the member's at
 * `meSlot`) and, when one is stored with players in it, its timeline. `items` is Data Dragon's
 * shop facts; an item the facts do not know leaves the completed items out (an older patch's item
 * is never skipped over, which would misstate the order).
 */
export function matchPrep(parts: readonly PrepParticipant[], meSlot: number, timeline: PrepTimeline | null, items: Readonly<Record<string, PrepItemInfo>> | null): MatchPrep | null {
  const me = parts[meSlot];
  if (!me || me.removed || !me.championId) return null;
  const opp = confirmedOpponent(parts, meSlot);
  const reading = opp?.rule === "confirmed" || (!opp && typeof me.teamPosition === "string") ? "teamPosition" : "position";
  const lane = asLane(laneOf(me[reading] ?? null));
  const prep: MatchPrep = { f: PREP_FORMAT, lane, rule: opp?.rule ?? null, tl: false };
  const champion = (slot: number | null) => (slot === null ? undefined : parts[slot]?.championId ?? undefined);
  if (opp) {
    prep.vs = champion(opp.slot);
    if (lane === "BOTTOM" || lane === "UTILITY") {
      const ally = partnerOf(parts, meSlot, opp.rule);
      const vs2 = ally === null ? null : confirmedOpponent(parts, ally);
      if (ally !== null && vs2 && vs2.rule === opp.rule) {
        prep.ally = champion(ally);
        prep.vs2 = champion(vs2.slot);
      }
    }
  }
  if (typeof me.runes?.keystone === "number") prep.ks = me.runes.keystone;
  const page = runePageKey(me.runes ?? null);
  if (page) prep.runes = page;
  if (me.spells?.length === 2 && me.spells.every((s) => Number.isInteger(s) && s > 0)) prep.spells = sortedIds(me.spells);

  const mine = timeline?.participants.find((p) => p.puuid === me.puuid);
  if (!timeline || !mine) return prep;
  prep.tl = true;
  const purchases = [...mine.purchases].sort((a, b) => a[0] - b[0]);
  const start = purchases.filter(([t]) => t < START_MS).map(([, id]) => id);
  if (start.length) prep.start = sortedIds(start);
  const later = purchases.filter(([t]) => t >= START_MS);
  if (later.length) {
    const visit = [later[0]!];
    for (const p of later.slice(1)) {
      if (p[0] - visit[visit.length - 1]![0] >= VISIT_GAP_MS) break;
      visit.push(p);
    }
    prep.back = sortedIds(visit.map(([, id]) => id));
  }
  if (items && purchases.every(([, id]) => Object.hasOwn(items, String(id)))) {
    const done: number[] = [];
    for (const [, id] of purchases) if (done.length < 3 && !done.includes(id) && isCompletedItem(items[String(id)])) done.push(id);
    if (done.length) prep.items = done.join(">");
  }
  Object.assign(prep, skillOrder(mine.skills));
  if (lane === "JUNGLE") {
    const obj = earlyObjectives(me.teamId, timeline);
    if (obj) prep.obj = obj;
  } else if (opp) {
    const end = laneEnd(lane, me.puuid, (parts[opp.slot] as PrepParticipant).puuid, timeline);
    if (end !== undefined) prep.end = end;
  }
  return prep;
}
