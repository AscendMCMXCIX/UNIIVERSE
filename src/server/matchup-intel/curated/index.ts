import type { ChampionNotes, MatchupNotes } from "@/domain/matchup-intel/types";
import Ambessa from "./champions/Ambessa";
import Gwen from "./champions/Gwen";
import Mordekaiser from "./champions/Mordekaiser";
import Ornn from "./champions/Ornn";
import Renekton from "./champions/Renekton";
import Riven from "./champions/Riven";
import AmbessaVsRenekton from "./matchups/Ambessa-vs-Renekton";
import GwenVsOrnn from "./matchups/Gwen-vs-Ornn";
import RivenVsMordekaiser from "./matchups/Riven-vs-Mordekaiser";

/*
  The curated layers, committed and reviewed (docs/MATCHUP_INTEL.md, "Curated notes"):
  - champion notes (Layer 1): champions/<ChampionId>.ts;
  - matchup notes (Layer 2, one direction: your champion against the enemy): matchups/<You>-vs-<Enemy>.ts.
  Every file is imported here, statically and once. curated.test.ts fails when a file is missing
  from these lists or breaks a rule.

  Server-only: the notes are read on the server, and the page hands the browser only the plain view
  built from them. A client component never imports this module: src/app/client-imports.test.ts
  refuses any path from browser code into src/server, apart from the shared modules it lists.
*/

const CHAMPIONS: readonly ChampionNotes[] = [Ambessa, Gwen, Mordekaiser, Ornn, Renekton, Riven];
const MATCHUPS: readonly MatchupNotes[] = [AmbessaVsRenekton, GwenVsOrnn, RivenVsMordekaiser];

// Maps, not plain objects: an id from an address such as "constructor" finds nothing.
const championNotes = new Map(CHAMPIONS.map((notes) => [notes.championId, notes]));

/** Matchup notes by your champion, then by the enemy. */
const matchupNotes = new Map<string, Map<string, MatchupNotes>>();
for (const notes of MATCHUPS) {
  const enemies = matchupNotes.get(notes.championId) ?? new Map<string, MatchupNotes>();
  enemies.set(notes.vsId, notes);
  matchupNotes.set(notes.championId, enemies);
}

/** A champion's curated notes, or null when none have been written. */
export function getChampionNotes(championId: string): ChampionNotes | null {
  return championNotes.get(championId) ?? null;
}

/** The curated notes for your champion against an enemy (this direction only), or null. */
export function getMatchupNotes(championId: string, vsId: string): MatchupNotes | null {
  return matchupNotes.get(championId)?.get(vsId) ?? null;
}

/** The enemies a curated matchup exists for, for your champion (to suggest them). */
export function curatedEnemiesFor(championId: string): string[] {
  return [...(matchupNotes.get(championId)?.keys() ?? [])];
}
