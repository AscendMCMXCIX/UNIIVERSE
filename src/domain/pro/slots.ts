import type { Role } from "../roles";

/**
 * Professional draft slots in the standard tournament order:
 *   bans 1–3 (BAN1) · B1 · R1 R2 · B2 B3 · R3 · bans 4–5 (BAN2) · R4 · B4 B5 · R5
 * Slots are what the pro-pattern statistics are keyed by: "how often is this champion a B1?"
 */
export const DRAFT_SLOTS = ["B1", "R1R2", "B2B3", "R3", "R4", "B4B5", "R5", "BAN1", "BAN2"] as const;
export type DraftSlot = (typeof DRAFT_SLOTS)[number];

export const SLOT_LABELS: Record<DraftSlot, string> = {
  B1: "Blue first pick",
  R1R2: "Red first rotation",
  B2B3: "Blue second rotation",
  R3: "Red third pick",
  R4: "Red fourth pick",
  B4B5: "Blue last rotation",
  R5: "Red last pick (counterpick)",
  BAN1: "First ban phase",
  BAN2: "Second ban phase",
};

/** Maps a side and its 1-based pick order to the tournament slot (null when the order is unknown). */
export function draftSlotFor(side: "blue" | "red", pickOrder: number): DraftSlot | null {
  if (side === "blue") {
    if (pickOrder === 1) return "B1";
    if (pickOrder === 2 || pickOrder === 3) return "B2B3";
    if (pickOrder === 4 || pickOrder === 5) return "B4B5";
    return null;
  }
  if (pickOrder === 1 || pickOrder === 2) return "R1R2";
  if (pickOrder === 3) return "R3";
  if (pickOrder === 4) return "R4";
  if (pickOrder === 5) return "R5";
  return null;
}

/** Bans 1–3 happen before any pick; bans 4–5 after the first six picks. */
export function banSlotFor(banOrder: number): DraftSlot | null {
  if (banOrder >= 1 && banOrder <= 3) return "BAN1";
  if (banOrder === 4 || banOrder === 5) return "BAN2";
  return null;
}

export interface ProSlotRecord {
  championId: string;
  slot: DraftSlot;
  role: Role | null;
  games: number;
  wins: number;
}

/** Derived view of a champion's professional draft behaviour. All shares are 0..1 of its pro picks. */
export interface ProSlotProfile {
  championId: string;
  /** Pro games in which it was picked (any slot). */
  picks: number;
  /** Pro games in which it was banned. */
  bans: number;
  /** Share of picks taken in the first rotation (B1, R1/R2). */
  firstRotation: number;
  /** Share of picks taken in the last rotation (B4/B5, R5). */
  lateRotation: number;
  /** Share of picks taken as the final counterpick (R5). */
  counterpick: number;
  /** Share of bans spent in the second ban phase (a "target ban" after seeing the draft). */
  secondPhaseBan: number;
  slots: Partial<Record<DraftSlot, number>>;
}

export function summariseSlots(championId: string, records: ProSlotRecord[]): ProSlotProfile | null {
  const slots: Partial<Record<DraftSlot, number>> = {};
  let picks = 0;
  let bans = 0;
  for (const r of records) {
    if (r.championId !== championId || r.games <= 0) continue;
    slots[r.slot] = (slots[r.slot] ?? 0) + r.games;
    if (r.slot === "BAN1" || r.slot === "BAN2") bans += r.games;
    else picks += r.games;
  }
  if (picks + bans === 0) return null;
  const share = (...keys: DraftSlot[]) => (picks > 0 ? keys.reduce((s, k) => s + (slots[k] ?? 0), 0) / picks : 0);
  return {
    championId,
    picks,
    bans,
    firstRotation: share("B1", "R1R2"),
    lateRotation: share("B4B5", "R5"),
    counterpick: share("R5"),
    secondPhaseBan: bans > 0 ? (slots.BAN2 ?? 0) / bans : 0,
    slots,
  };
}

/** Readable one-liner about how pros draft the champion, or null when the sample is too small. */
export function describeSlotProfile(p: ProSlotProfile | null, minPicks = 8): string | null {
  if (!p || p.picks < minPicks) return null;
  if (p.firstRotation >= 0.6) return `Pro teams take it first rotation (${Math.round(p.firstRotation * 100)}% of its pro picks)`;
  if (p.counterpick >= 0.35) return `Usually a last-pick counter in pro play (${Math.round(p.counterpick * 100)}% R5)`;
  if (p.lateRotation >= 0.6) return `Pros save it for the last rotation (${Math.round(p.lateRotation * 100)}%)`;
  if (p.bans >= minPicks && p.secondPhaseBan >= 0.6) return `A second-phase target ban in pro play (${Math.round(p.secondPhaseBan * 100)}% of its bans)`;
  return null;
}
