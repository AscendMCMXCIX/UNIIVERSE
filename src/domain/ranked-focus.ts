/*
  Which champions the Solo Queue Blocks focus shows. The player's Primary Role pool, in their order,
  is the source: a focus slot the player never set (null) shows the next pool champion, so a changed
  or reordered pool shows at once. A champion the player chose for a slot is theirs and stays; a slot
  they cleared on purpose is stored as FOCUS_NONE and stays empty. Only the block in progress
  follows the focus; finished blocks keep the champion they were played with.
*/

export const FOCUS_SLOTS = ["champion1", "champion2", "champion3"] as const;
export type FocusSlot = (typeof FOCUS_SLOTS)[number];

/** Stored for a slot the player emptied on purpose (null means "follow my pool"). */
export const FOCUS_NONE = "";

export type FocusSource = "chosen" | "pool" | "none";

export interface StoredFocusChampions {
  champion1: string | null;
  champion2: string | null;
  champion3: string | null;
  counterPick: string | null;
}

export type ResolvedFocus = Record<FocusSlot, { id: string | null; source: FocusSource; /** 1-based place in the pool, for "pool" slots. */ poolIndex?: number }>;

export function resolveFocusChampions(stored: StoredFocusChampions, pool: readonly string[]): ResolvedFocus {
  const taken = new Set([...FOCUS_SLOTS.map((k) => stored[k]), stored.counterPick].filter((id): id is string => !!id));
  const free = pool.map((id, i) => ({ id, i })).filter((c) => !taken.has(c.id));
  const out = {} as ResolvedFocus;
  for (const k of FOCUS_SLOTS) {
    const v = stored[k];
    if (v === null) {
      const next = free.shift();
      out[k] = next ? { id: next.id, source: "pool", poolIndex: next.i + 1 } : { id: null, source: "none" };
    } else out[k] = v === FOCUS_NONE ? { id: null, source: "none" } : { id: v, source: "chosen" };
  }
  return out;
}

/** True when every slot simply follows the pool (nothing chosen or cleared by the player). */
export const followsPool = (stored: StoredFocusChampions) => FOCUS_SLOTS.every((k) => stored[k] === null);
