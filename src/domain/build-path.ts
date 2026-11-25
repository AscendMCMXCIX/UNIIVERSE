/*
  BUILD PATH AND SKILL ORDER: one player's purchases, sales and skill points in a game, as the
  stored timeline keeps them (server/accounts/match-timeline: timelineParticipants), for the
  post-game view's Build Path and Skill Order. Nothing is reconstructed from the final items.

  - Purchases and sales in the order they happened, each at its time. An undone purchase is not
    kept (the timeline drops it with what it used up, and an undone sale with it), so the path shows
    what the player ended up buying: the pair is dropped, never shown as bought and undone.
  - An item is marked completed when Data Dragon lists it as a finished item (the asset maps'
    `itemKinds.done`: a Summoner's Rift item nothing builds into, of 900 gold or more, or a pair of
    upgraded boots); consumables, trinkets and wards are minor (`itemKinds.minor`) and drawn quieter.
    Without those lists (maps stored before them) nothing is marked rather than guessed.
  - Skill points in the order taken, one per champion level from 1 (the timeline skips Riot's
    "evolve" level-ups, which are not skill points), as a grid: which of Q, W, E and R at each level.
*/

export type BuildEventKind = "buy" | "sell";

export interface BuildEvent {
  /** Milliseconds into the game. */
  ms: number;
  kind: BuildEventKind;
  id: number;
}

/**
 * Purchases and sales as one path, in the order they happened. At the same moment a sale comes
 * before a purchase (the shop sells first when an item is sold to buy another).
 */
export function buildPath(purchases: ReadonlyArray<readonly [number, number]>, sold: ReadonlyArray<readonly [number, number]> = []): BuildEvent[] {
  const all: Array<BuildEvent & { order: number }> = [
    ...sold.map(([ms, id], i) => ({ ms, id, kind: "sell" as const, order: i })),
    ...purchases.map(([ms, id], i) => ({ ms, id, kind: "buy" as const, order: sold.length + i })),
  ];
  return all
    .filter((e) => Number.isFinite(e.ms) && e.ms >= 0 && Number.isInteger(e.id) && e.id > 0)
    .sort((a, b) => a.ms - b.ms || a.order - b.order)
    .map(({ ms, kind, id }) => ({ ms, kind, id }));
}

/** The events grouped into shop visits: events less than `gapMs` apart (default 45 s) are one visit. */
export function shopVisits<T extends { ms: number }>(events: readonly T[], gapMs = 45_000): T[][] {
  const visits: T[][] = [];
  for (const e of events) {
    const last = visits.at(-1);
    if (last && e.ms - last.at(-1)!.ms < gapMs) last.push(e);
    else visits.push([e]);
  }
  return visits;
}

export type SkillKey = "Q" | "W" | "E" | "R";
export const SKILL_KEYS: readonly SkillKey[] = ["Q", "W", "E", "R"];

/** Skill points as a grid: for each of Q, W, E and R, the levels (1-based) it was taken at; `levels`: how many points there were (at most 18). */
export function skillGrid(skills: readonly number[]): { rows: Record<SkillKey, number[]>; levels: number } {
  const rows: Record<SkillKey, number[]> = { Q: [], W: [], E: [], R: [] };
  const taken = skills.filter((s) => Number.isInteger(s) && s >= 1 && s <= 4).slice(0, 18);
  taken.forEach((s, i) => rows[SKILL_KEYS[s - 1]!].push(i + 1));
  return { rows, levels: taken.length };
}

/** Basic skills in the order they reached their fifth point (or, unfinished, by points, then by first taken), e.g. ["Q", "E", "W"]. */
export function maxOrder(skills: readonly number[]): Array<"Q" | "W" | "E"> {
  const points = [0, 0, 0];
  const done: number[] = [];
  for (const s of skills) {
    if (s < 1 || s > 3) continue;
    points[s - 1]! += 1;
    if (points[s - 1] === 5) done.push(s);
  }
  const rest = [1, 2, 3].filter((s) => !done.includes(s)).sort((a, b) => points[b - 1]! - points[a - 1]! || skills.indexOf(a) - skills.indexOf(b));
  return [...done, ...rest].filter((s) => points[s - 1]! > 0).map((s) => SKILL_KEYS[s - 1] as "Q" | "W" | "E");
}

/** Data Dragon's facts the build path marks items by (the asset maps' itemKinds). */
export interface ItemKinds {
  /** Finished items: nothing on Summoner's Rift builds from them into more, 900 gold or more; and upgraded boots. */
  done: readonly number[];
  /** Consumables, trinkets and wards. */
  minor: readonly number[];
}

/** Data Dragon's item.json entry, the fields the kinds read. */
interface DdItem {
  into?: unknown;
  tags?: unknown;
  depth?: unknown;
  gold?: { total?: unknown; purchasable?: unknown };
  maps?: Record<string, boolean>;
}

/** The kinds from Data Dragon's item.json (Summoner's Rift items only: map 11, ids of up to four digits). */
export function itemKindsOf(items: Record<string, unknown>): ItemKinds {
  const done: number[] = [];
  const minor: number[] = [];
  for (const [id, raw] of Object.entries(items)) {
    const v = raw as DdItem;
    if (!/^\d{1,4}$/.test(id) || v?.maps?.["11"] !== true) continue;
    const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === "string") : [];
    if (tags.includes("Consumable") || tags.includes("Trinket")) {
      minor.push(Number(id));
      continue;
    }
    const into = Array.isArray(v.into) ? v.into : [];
    const total = typeof v.gold?.total === "number" ? v.gold.total : 0;
    const boots = tags.includes("Boots") && typeof v.depth === "number" && v.depth >= 2;
    if (boots || (into.length === 0 && total >= 900)) done.push(Number(id));
  }
  return { done: done.sort((a, b) => a - b), minor: minor.sort((a, b) => a - b) };
}

export type BuildItemKind = "done" | "part" | "minor" | "sell";

/**
 * How the build path draws one event (a presentation helper): a sale is "sell" always; a purchase
 * is a completed item ("done"), a consumable or ward ("minor") or a component ("part") only where
 * the item lists are known (`kinds`), else null and nothing is marked rather than guessed.
 */
export function buildItemKind(x: { kind: BuildEventKind; done: boolean; minor: boolean }, kinds: boolean): BuildItemKind | null {
  if (x.kind === "sell") return "sell";
  if (!kinds) return null;
  return x.done ? "done" : x.minor ? "minor" : "part";
}
