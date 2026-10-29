import type { GoldPoint } from "./match-analysis";

/*
  MATCH EVENTS: the kills and objectives of one game, from its timeline, and the moments the gold
  difference moved most. Everything here is told as it happened, side by side: a swing is listed
  with the events of the same minutes, and nothing says one caused the other.
*/

export type ObjectiveKind = "dragon" | "elder" | "baron" | "herald" | "grubs" | "atakhan" | "tower" | "inhibitor";

/** An objective or building, from the player's side: `own` when the player's team took it. */
export interface TimelineObjective {
  minute: number;
  own: boolean;
  kind: ObjectiveKind;
  /** A dragon's element (FIRE …); a building's lane and a tower's tier ("TOP OUTER"). */
  detail: string | null;
  /** Voidgrubs taken together count as one entry: how many. */
  count?: number;
}

export interface TimelineEventsView {
  objectives: TimelineObjective[];
  /** Every champion kill each team made, when every player's are kept (none removed); null otherwise. */
  kills: { own: number[]; enemy: number[] } | null;
  /** The player's own kills, deaths and assists. */
  you: { kills: number[]; deaths: number[]; assists: number[] } | null;
}

const DRAGON_NAMES: Record<string, string> = { FIRE: "Infernal", EARTH: "Mountain", WATER: "Ocean", AIR: "Cloud", HEXTECH: "Hextech", CHEMTECH: "Chemtech" };

const KIND_NAMES: Record<ObjectiveKind, string> = { dragon: "Dragon", elder: "Elder Dragon", baron: "Baron Nashor", herald: "Rift Herald", grubs: "Voidgrubs", atakhan: "Atakhan", tower: "Tower", inhibitor: "Inhibitor" };

/** One letter per kind, for the markers along the chart (the list and the legend name them). */
export const OBJECTIVE_MARK: Record<ObjectiveKind, string> = { dragon: "D", elder: "E", baron: "B", herald: "H", grubs: "G", atakhan: "A", tower: "T", inhibitor: "I" };

const LEGEND_ORDER: readonly ObjectiveKind[] = ["dragon", "elder", "grubs", "herald", "atakhan", "baron", "tower", "inhibitor"];
const LEGEND_WORDS: Record<ObjectiveKind, string> = { dragon: "dragon", elder: "elder", grubs: "voidgrubs", herald: "herald", atakhan: "Atakhan", baron: "Baron", tower: "tower", inhibitor: "inhibitor" };

/** The chart's legend for the kinds a game has: "D dragon · G voidgrubs · T tower" (a letter never wraps away from its word). */
export function objectiveLegend(objectives: readonly Pick<TimelineObjective, "kind">[]): string {
  return LEGEND_ORDER.filter((k) => objectives.some((o) => o.kind === k))
    .map((k) => `${OBJECTIVE_MARK[k]} ${LEGEND_WORDS[k]}`)
    .join(" · ");
}

/** "Dragon (Infernal)", "Tower (top, outer)", "Voidgrubs ×3". */
export function objectiveLabel(o: Pick<TimelineObjective, "kind" | "detail" | "count">): string {
  const name = KIND_NAMES[o.kind];
  if (o.kind === "dragon") return o.detail && DRAGON_NAMES[o.detail] ? `${name} (${DRAGON_NAMES[o.detail]})` : name;
  if (o.kind === "grubs") return o.count && o.count > 1 ? `${name} ×${o.count}` : "Voidgrub";
  if ((o.kind === "tower" || o.kind === "inhibitor") && o.detail) return `${name} (${o.detail.toLowerCase().split(" ").join(", ")})`;
  return name;
}

/** Voidgrubs one team took within this many minutes of the previous one count as one entry. */
export const GRUBS_TOGETHER = 1.5;

/** Objectives in order, with each team's voidgrubs taken together (one camp) as one entry, at the first one's time. */
export function mergeGrubs(objectives: readonly TimelineObjective[]): TimelineObjective[] {
  const out: TimelineObjective[] = [];
  // Each side's open voidgrub entry and when its latest grub was taken.
  const open = new Map<boolean, { entry: TimelineObjective; last: number }>();
  for (const o of [...objectives].sort((a, b) => a.minute - b.minute)) {
    if (o.kind !== "grubs") {
      out.push({ ...o });
      continue;
    }
    const current = open.get(o.own);
    if (current && o.minute - current.last <= GRUBS_TOGETHER) {
      current.entry.count = (current.entry.count ?? 1) + 1;
      current.last = o.minute;
      continue;
    }
    const entry = { ...o, count: 1 };
    out.push(entry);
    open.set(o.own, { entry, last: o.minute });
  }
  return out;
}

export interface GoldSwing {
  /** The window, in minutes into the game (frame times). */
  from: number;
  to: number;
  /** The gold difference at each end, from the player's side. */
  start: number;
  end: number;
}

/** A swing smaller than this is not listed. */
export const SWING_MIN = 1500;

/**
 * The largest moves of the gold difference over `window` minutes (by frames, so about that many
 * minutes), at most `count`, not overlapping, largest first. Only moves of SWING_MIN or more.
 */
export function goldSwings(points: readonly GoldPoint[], window = 3, count = 3): GoldSwing[] {
  const candidates: GoldSwing[] = [];
  for (let i = 0; i < points.length; i++) {
    // The frame closest to `window` minutes later (frames are about a minute apart).
    let j = i;
    while (j + 1 < points.length && points[j + 1]!.minute - points[i]!.minute <= window + 0.25) j++;
    if (j === i) continue;
    const a = points[i]!;
    const b = points[j]!;
    if (Math.abs(b.diff - a.diff) >= SWING_MIN) candidates.push({ from: a.minute, to: b.minute, start: a.diff, end: b.diff });
  }
  candidates.sort((a, b) => Math.abs(b.end - b.start) - Math.abs(a.end - a.start) || a.from - b.from);
  const out: GoldSwing[] = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    if (out.some((o) => c.from < o.to && o.from < c.to)) continue;
    out.push(c);
  }
  return out;
}

export interface EventsInWindow {
  objectives: TimelineObjective[];
  /** Kills each team made in the window; null when not every player's kills are kept. */
  kills: { own: number; enemy: number } | null;
  you: { kills: number; deaths: number; assists: number } | null;
}

/** What happened between two moments (after `from`, up to and including `to`). */
export function eventsBetween(events: TimelineEventsView, from: number, to: number): EventsInWindow {
  const inside = (m: number) => m > from && m <= to;
  const count = (xs: readonly number[]) => xs.filter(inside).length;
  return {
    objectives: mergeGrubs(events.objectives.filter((o) => inside(o.minute))),
    kills: events.kills ? { own: count(events.kills.own), enemy: count(events.kills.enemy) } : null,
    you: events.you ? { kills: count(events.you.kills), deaths: count(events.you.deaths), assists: count(events.you.assists) } : null,
  };
}
