/*
  Fearless Draft (Full / "Hard" Fearless, as used in LoL Esports Bo3 and Bo5 series in 2025):
  a champion PICKED by either team in an earlier game of the series cannot be picked by either
  team for the rest of that series. Each game still has its normal ban phases; earlier games'
  bans do not carry over. Only earlier games of the same series count, so another series is
  never affected, and the list is derived from the stored games every time (a corrected or
  deleted earlier game changes it immediately).
*/

export type DraftRules = "standard" | "fearless";

export const DRAFT_RULES: Array<{ key: DraftRules; label: string; description: string }> = [
  { key: "standard", label: "Standard", description: "Every game starts with the full champion pool." },
  { key: "fearless", label: "Fearless", description: "Champions picked by either team in earlier games are unavailable to both teams for the rest of the series. Bans reset each game." },
];

export function isDraftRules(v: unknown): v is DraftRules {
  return v === "standard" || v === "fearless";
}

export interface SeriesGamePicks {
  gameNumber: number;
  /** Picked champions of both teams in that game (bans excluded). */
  picks: Array<{ championId: string; side: "us" | "them" }>;
}

export interface FearlessLock {
  championId: string;
  /** The earlier game in which it was picked. */
  gameNumber: number;
  side: "us" | "them";
}

/** Champions unavailable in `gameNumber` under Fearless: every pick of every earlier game (first use kept). */
export function fearlessLocks(games: readonly SeriesGamePicks[], gameNumber: number): FearlessLock[] {
  const out = new Map<string, FearlessLock>();
  for (const g of [...games].filter((x) => x.gameNumber < gameNumber).sort((a, b) => a.gameNumber - b.gameNumber)) {
    for (const p of g.picks) if (!out.has(p.championId)) out.set(p.championId, { championId: p.championId, gameNumber: g.gameNumber, side: p.side });
  }
  return [...out.values()];
}
