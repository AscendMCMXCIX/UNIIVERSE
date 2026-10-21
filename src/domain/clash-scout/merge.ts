import type { ColumnRead, LineRead, ScreenshotRead } from "./layout";
import { nameKey, nameSimilarity } from "./text";
import { SCOUT_SLOTS, type Certainty, type MasteryChampion, type NameReads, type RankedChampion, type ScoutContent, type ScoutPlayer, type ScreenshotKind } from "./types";

/*
  Putting one screenshot's reading into the scout. The two Clash screens list the same five
  players in the same order, so columns pair up by position; when both screens' names were read
  and they pair up better in another order (similar names in other columns), that order is used.

  Each screenshot's reading of a name is kept (nameReads), and the name shown is decided from
  them: one clear reading is trusted; two readings that agree confirm each other; two that differ
  keep the surer one, marked for checking, with the other offered as the alternative. Replacing or
  removing a screenshot replaces or removes only its own readings and figures. Whatever a member
  typed, chose or confirmed ("manual") is never overwritten by a screenshot.
*/

/** A single reading at least this confident is trusted. */
export const NAME_SURE = 85;
/**
 * Two readings that agree are trusted from this confidence (each alone would be checked). Not
 * lower: the same font read by the same OCR repeats its own confusions ("l" for "1"), so
 * agreement alone does not make an unsure reading sure.
 */
const AGREED_SURE = 75;
const PAIR_MIN = 0.6;

/** For each column of the reading, the scout slot it belongs to. */
export function pairColumns(players: readonly ScoutPlayer[], read: ScreenshotRead): number[] {
  const identity = Array.from({ length: SCOUT_SLOTS }, (_, i) => i);
  const known = players.map((p) => p.name.trim());
  const incoming = read.columns.map((c) => c.name?.text.trim() ?? "");
  if (known.filter(Boolean).length < 2 || incoming.filter(Boolean).length < 2) return identity;
  const score = (order: number[]) => order.reduce((n, slot, col) => n + (known[slot] && incoming[col] ? nameSimilarity(known[slot]!, incoming[col]!) : 0), 0);
  // Greedy best pairs, then compare with keeping the order.
  const pairs: Array<{ col: number; slot: number; s: number }> = [];
  incoming.forEach((name, col) => known.forEach((k, slot) => name && k && pairs.push({ col, slot, s: nameSimilarity(k, name) })));
  pairs.sort((a, b) => b.s - a.s);
  const order: number[] = Array(SCOUT_SLOTS).fill(-1);
  const taken = new Set<number>();
  for (const p of pairs) {
    if (p.s < PAIR_MIN || order[p.col] !== -1 || taken.has(p.slot)) continue;
    order[p.col] = p.slot;
    taken.add(p.slot);
  }
  // Columns without a confident pair keep the remaining slots in order.
  const free = identity.filter((s) => !taken.has(s));
  for (let col = 0; col < SCOUT_SLOTS; col++) if (order[col] === -1) order[col] = free.shift()!;
  return score(order) > score(identity) + 0.5 ? order : identity;
}

/** The name the readings give, and how sure it is: empty when nothing was read. */
export function nameFromReads(reads: NameReads | undefined): { name: string; certainty: Certainty } {
  const list = Object.values(reads ?? {})
    .filter((r) => !!r?.text)
    .sort((a, b) => b!.confidence - a!.confidence);
  const [best, other] = list;
  if (!best) return { name: "", certainty: "manual" };
  if (!other) return { name: best.text, certainty: best.confidence >= NAME_SURE ? "high" : "low" };
  if (nameKey(best.text) !== nameKey(other.text)) return { name: best.text, certainty: "low" };
  return { name: best.text, certainty: best.confidence >= AGREED_SURE ? "high" : "low" };
}

/** The readings kept, with this screenshot's in place of its earlier one (none: that one goes). */
function withRead(reads: NameReads | undefined, kind: ScreenshotKind, line: LineRead | null): NameReads {
  const next: NameReads = { ...reads };
  if (line?.text.trim()) next[kind] = { text: line.text.trim(), confidence: Math.round(line.confidence) };
  else delete next[kind];
  return next;
}

/** A name kept as a member set it, or decided again from the readings. */
function decideName(current: { name: string; certainty: Certainty }, reads: NameReads): { name: string; certainty: Certainty } {
  // A member's name (typed, chosen or confirmed) stays; an empty "manual" is simply nothing yet.
  if (current.certainty === "manual" && current.name.trim()) return current;
  return nameFromReads(reads);
}

/**
 * The champion rows after a new reading: a row a member edited stays, every other row is the new
 * reading's, with the champion a member chose kept.
 */
function rowsAfter<T extends RankedChampion | MasteryChampion>(current: T[], incoming: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(current.length, incoming.length); i++) {
    const mine = current[i];
    const read = incoming[i];
    if (mine?.certainty === "manual") out.push(mine);
    else if (mine?.championCertainty === "manual") out.push(read ? { ...read, championId: mine.championId, championCertainty: "manual" } : mine);
    else if (read) out.push(read);
  }
  return out;
}

/** What is left of a row once the screenshot that filled it in is removed: a member's own row, or the champion a member chose (without the figures read). */
function memberPart<T extends RankedChampion | MasteryChampion>(c: T): T | null {
  if (c.certainty === "manual") return c;
  if (c.championCertainty !== "manual") return null;
  return ("winRate" in c ? { ...c, winRate: null, games: null, kda: null, certainty: "low" } : { ...c, points: null, level: null, certainty: "low" }) as T;
}

function mergeColumn(p: ScoutPlayer, col: ColumnRead, kind: ScreenshotKind): ScoutPlayer {
  const nameReads = withRead(p.nameReads, kind, col.name);
  const name = decideName({ name: p.name, certainty: p.nameCertainty }, nameReads);
  const next: ScoutPlayer = { ...p, nameReads, name: name.name, nameCertainty: name.certainty };
  if (kind === "ranked") {
    if (p.rankCertainty !== "manual") {
      next.rank = col.rank;
      next.rankCertainty = col.rank ? (col.rankSure ? "high" : "low") : undefined;
    }
    next.ranked = rowsAfter(p.ranked, col.ranked);
  } else {
    next.totalMastery = col.totalMastery;
    next.mastery = rowsAfter(p.mastery, col.mastery);
  }
  return next;
}

export interface MergeResult {
  content: ScoutContent;
  /** The scout slot each column of the reading went to. */
  order: number[];
  /** Players whose name the two screenshots read quite differently (most of them: the screenshots may show different teams). */
  disagreements: number;
}

/**
 * One screenshot's reading into the scout, replacing that kind's earlier reading if there was one
 * (the other kind's data, and anything a member set, stay as they are).
 */
export function mergeScreenshot(content: ScoutContent, read: ScreenshotRead, kind: ScreenshotKind): MergeResult {
  const order = pairColumns(content.players, read);
  const players = content.players.map((p) => ({ ...p }));
  read.columns.forEach((col, i) => {
    const slot = order[i]!;
    players[slot] = mergeColumn(players[slot]!, col, kind);
  });
  const opponentReads = withRead(content.opponentReads, kind, read.opponent);
  const opponent = decideName({ name: content.opponentName, certainty: content.opponentCertainty }, opponentReads);
  const disagreements = players.filter((p) => {
    const { ranked, mastery } = p.nameReads ?? {};
    return !!ranked && !!mastery && nameSimilarity(ranked.text, mastery.text) < 0.5;
  }).length;
  return { content: { ...content, opponentName: opponent.name, opponentCertainty: opponent.certainty, opponentReads, players }, order, disagreements };
}

/** Removes what one screenshot filled in (when it is removed), keeping everything a member set. */
export function clearKind(content: ScoutContent, kind: ScreenshotKind): ScoutContent {
  const without = (reads: NameReads | undefined): NameReads => {
    const next: NameReads = { ...reads };
    delete next[kind];
    return next;
  };
  const opponentReads = without(content.opponentReads);
  const opponent = decideName({ name: content.opponentName, certainty: content.opponentCertainty }, opponentReads);
  return {
    ...content,
    opponentName: opponent.name,
    opponentCertainty: opponent.certainty,
    opponentReads,
    players: content.players.map((p) => {
      const nameReads = without(p.nameReads);
      const name = decideName({ name: p.name, certainty: p.nameCertainty }, nameReads);
      const next: ScoutPlayer = { ...p, nameReads, name: name.name, nameCertainty: name.certainty };
      if (kind === "ranked") {
        if (p.rankCertainty !== "manual") {
          next.rank = null;
          delete next.rankCertainty;
        }
        next.ranked = p.ranked.map(memberPart).filter((c): c is RankedChampion => c !== null);
      } else {
        next.totalMastery = null;
        next.mastery = p.mastery.map(memberPart).filter((c): c is MasteryChampion => c !== null);
      }
      return next;
    }),
  };
}
