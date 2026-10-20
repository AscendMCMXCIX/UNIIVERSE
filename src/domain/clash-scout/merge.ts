import type { ScreenshotRead } from "./layout";
import { nameSimilarity } from "./text";
import { SCOUT_SLOTS, type ScoutContent, type ScoutPlayer, type ScreenshotKind } from "./types";

/*
  Putting one screenshot's reading into the scout. The two Clash screens list the same five
  players in the same order, so columns pair up by position; when both screens' names were read
  and they pair up better in another order (similar names in other columns), that order is used.
  Only the screenshot's own kind of data is replaced, so replacing the mastery screenshot never
  touches the ranked figures, and a value a member typed or chose ("manual") is never overwritten.
  A name recognised with less than NAME_SURE confidence is kept but marked for checking.
*/

export const NAME_SURE = 85;
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

export interface MergeNote {
  slot: number;
  message: string;
}

export function mergeScreenshot(content: ScoutContent, read: ScreenshotRead, kind: ScreenshotKind): { content: ScoutContent; notes: MergeNote[] } {
  const order = pairColumns(content.players, read);
  const notes: MergeNote[] = [];
  const players = content.players.map((p) => ({ ...p }));
  read.columns.forEach((col, i) => {
    const slot = order[i]!;
    const p = players[slot]!;
    const name = col.name?.text ?? "";
    if (name && (!p.name || p.nameCertainty !== "manual")) {
      if (!p.name) {
        p.name = name;
        p.nameCertainty = (col.name?.confidence ?? 0) >= NAME_SURE ? "high" : "low";
      } else if (nameSimilarity(p.name, name) < 0.5) {
        // The two screenshots disagree: keep the first reading, ask for a check.
        p.nameCertainty = "low";
        notes.push({ slot, message: `The ${kind} screenshot reads this name as “${name}”.` });
      } else if ((col.name?.confidence ?? 0) > NAME_SURE && p.nameCertainty === "low") {
        p.name = name;
        p.nameCertainty = "high";
      }
    } else if (name && p.nameCertainty === "manual" && nameSimilarity(p.name, name) < 0.5) {
      notes.push({ slot, message: `The ${kind} screenshot reads this name as “${name}”.` });
    }
    if (kind === "ranked") {
      if (col.rank) p.rank = col.rank;
      p.ranked = [...p.ranked.filter((c) => c.certainty === "manual"), ...col.ranked.filter((c) => !p.ranked.some((m) => m.certainty === "manual" && m.championId && m.championId === c.championId))];
    } else {
      p.mastery = [...p.mastery.filter((c) => c.certainty === "manual"), ...col.mastery.filter((c) => !p.mastery.some((m) => m.certainty === "manual" && m.championId && m.championId === c.championId))];
    }
  });
  let opponentName = content.opponentName;
  let opponentCertainty = content.opponentCertainty;
  if (read.opponent && (content.opponentCertainty !== "manual" || !content.opponentName)) {
    if (!opponentName || opponentCertainty === "low") {
      opponentName = read.opponent.text;
      opponentCertainty = read.opponent.confidence >= NAME_SURE ? "high" : "low";
    }
  }
  return { content: { ...content, opponentName, opponentCertainty, players }, notes };
}

/** Removes one screenshot's kind of data again (when it is replaced or removed), keeping manual entries. */
export function clearKind(content: ScoutContent, kind: ScreenshotKind): ScoutContent {
  return {
    ...content,
    players: content.players.map((p) => (kind === "ranked" ? { ...p, rank: p.rank, ranked: p.ranked.filter((c) => c.certainty === "manual") } : { ...p, mastery: p.mastery.filter((c) => c.certainty === "manual") })),
  };
}
