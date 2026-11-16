import type { ChampionNotes, MatchupNotes } from "@/domain/matchup-intel/types";

/*
  The curated layers, committed and reviewed (docs/MATCHUP_INTEL.md, "Curated notes"):
  champion notes (Layer 1) and matchup notes (Layer 2, one direction).
  SEAM: the curation replaces this stub.
*/

/** A champion's curated notes, or null when none have been written. */
export function getChampionNotes(championId: string): ChampionNotes | null {
  void championId;
  return null;
}

/** The curated notes for your champion against an enemy (this direction only), or null. */
export function getMatchupNotes(championId: string, vsId: string): MatchupNotes | null {
  void championId;
  void vsId;
  return null;
}

/** The enemies a curated matchup exists for, for your champion (to suggest them). */
export function curatedEnemiesFor(championId: string): string[] {
  void championId;
  return [];
}
