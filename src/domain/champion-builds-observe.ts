import { LANE_NAMES } from "@/domain/match-analysis";
import { skillMaxOrder, startingSet, type BuildDim, type BuildLane, type ItemClasses, type SkillRanks } from "@/domain/champion-builds";

/*
  One player's build values in one game, as the builds statement counts them
  (server/champion-builds/query.ts), in TypeScript: the same keys, so the high-elo counts (made from
  games fetched from Riot and never stored, docs/HIGH_ELO_EVIDENCE.md) and the team's counts (made
  inside the database from the stored records) run through the same choosePart. The two are held to
  one rule set by tests/db/champion-builds-observe.test.ts: this module over every demo record and
  timeline must give exactly the statement's counts, queue by queue.

  Values: runes "8000:8010,9111,9104,8299|8400:8444,8451", shards "5008,5008,5001", spells "4,14"
  (lower id first), skills "QEW|QWE", start "1055,2003" (ascending, repeats kept), boots an id or
  "none" (three completed items without boots), core "a>b>c" (purchase order), fourth and fifth
  "a,b,c|d" (the core's items ascending | the item); timeline "" where the player's timeline is
  there. A part the game does not record is left out.
*/

/** What the rules read of a player's record (a stored MatchParticipantDetail, or one made from Riot's match). */
export interface ObservedParticipant {
  position: string | null;
  win: boolean;
  spells: readonly number[] | null;
  runes: { primary: number | null; secondary: number | null; primaryPerks?: readonly number[]; secondaryPerks?: readonly number[]; shards?: readonly number[] } | null;
}

/** What the rules read of a player's timeline entry. */
export interface ObservedTimeline {
  purchases: ReadonlyArray<readonly [number, number]>;
  sold?: ReadonlyArray<readonly [number, number]> | null;
  skills: readonly number[];
}

/** The lane a stored position names (Riot's or the demo's spelling), or null. */
export function laneOf(position: string | null | undefined): BuildLane | null {
  return (position ? ((LANE_NAMES as Record<string, string>)[position] as BuildLane | undefined) : undefined) ?? null;
}

/** Whether every purchase is an item the static data knows (none: not known, as the statement's bool_and over no purchase). */
function allKnown(purchases: ObservedTimeline["purchases"], items: ItemClasses): boolean {
  if (!purchases.length) return false;
  const known = new Set(items.known);
  return purchases.every(([, id]) => known.has(String(id)));
}

/**
 * The first five completed items in purchase order (the first purchase of each), when every purchase
 * is an item the data knows; null otherwise.
 */
export function completedInOrder(purchases: ObservedTimeline["purchases"], items: ItemClasses): number[] | null {
  if (!allKnown(purchases, items)) return null;
  const completed = new Set(items.completed);
  const seen: number[] = [];
  for (const [, id] of purchases) if (completed.has(String(id)) && !seen.includes(id)) seen.push(id);
  return seen.slice(0, 5);
}

/**
 * One player's build values in one game (the module's header). `tl`: their timeline entry, or null
 * (then no items and no skill order, as the statement); `ranks`: each ability's ranks, null for no
 * skill order.
 */
export function observeBuild(p: ObservedParticipant, tl: ObservedTimeline | null, items: ItemClasses, ranks: SkillRanks | null): Partial<Record<Exclude<BuildDim, "games">, string>> {
  const out: Partial<Record<Exclude<BuildDim, "games">, string>> = {};
  const r = p.runes;
  if (r && Array.isArray(r.primaryPerks) && r.primaryPerks.length === 4 && Array.isArray(r.secondaryPerks) && r.secondaryPerks.length === 2 && r.primary !== null && r.primary !== undefined && r.secondary !== null && r.secondary !== undefined) {
    out.runes = `${r.primary}:${r.primaryPerks.join(",")}|${r.secondary}:${r.secondaryPerks.join(",")}`;
  }
  if (r && Array.isArray(r.shards) && r.shards.length === 3) out.shards = r.shards.join(",");
  if (Array.isArray(p.spells) && p.spells.length === 2 && p.spells.every((s) => Number.isInteger(s) && s >= 0)) out.spells = `${Math.min(p.spells[0]!, p.spells[1]!)},${Math.max(p.spells[0]!, p.spells[1]!)}`;
  if (!tl) return out;
  out.timeline = "";
  if (ranks) {
    const order = skillMaxOrder(tl.skills, ranks);
    if (order) out.skills = `${order.order.join("")}|${order.first.join("")}`;
  }
  const done = completedInOrder(tl.purchases, items);
  if (done) {
    const start = startingSet(tl.purchases, tl.sold ?? []);
    if (start.length) out.start = start.join(",");
    const bootsList = new Set(items.boots);
    const boots = tl.purchases.find(([, id]) => bootsList.has(String(id)));
    if (boots) out.boots = String(boots[1]);
    else if (done.length >= 3) out.boots = "none";
    if (done.length >= 3) out.core = done.slice(0, 3).join(">");
    const set = done.slice(0, 3).sort((a, b) => a - b).join(",");
    if (done.length >= 4) out.fourth = `${set}|${done[3]}`;
    if (done.length >= 5) out.fifth = `${set}|${done[4]}`;
  }
  return out;
}
