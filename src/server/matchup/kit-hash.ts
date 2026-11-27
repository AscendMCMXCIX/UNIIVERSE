import { createHash } from "node:crypto";
import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";

/*
  MATCHUP INTEL's kit hashes (docs/MATCHUP_INTEL.md, "Reviewed notes", Freshness): one short hash of
  what Riot's data says about a champion as version-check stored it (champion_abilities): its base
  statistics and, for each ability, its slot, base cooldowns, ranks, charges, the hash of Riot's
  text, its cost and resource line, and Data Dragon's range per rank (rules format 5: a range Riot
  changes without a word of its text changes the hash too, as Champion Intel's "Changed since" and
  the band's "E range" say). A reviewed note keeps each scope champion's hash at its review;
  any difference at a later read hides the note until it is reviewed again
  (domain/matchup/notes noteFreshness). Unlike the per-patch digests (static_digests) it covers the
  costs, and it is computed from the record the page already reads, so no sync changes.
*/

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 24);

/** The champion's kit hash (24 hex), or null where no record is stored. */
export function kitHash(record: DdragonChampionAbilities | null | undefined): string | null {
  if (!record || !Array.isArray(record.abilities)) return null;
  return sha([record.facts?.stats ?? null, record.abilities.map((a) => [a.slot, a.cooldown, a.maxRank, a.charges, a.textHash ?? null, a.cost ?? null, a.resource ?? null, a.range ?? null])]);
}

/** Each ability's own hash, by slot, for "what changed" in words (the re-review dialog). */
export function abilityHashes(record: DdragonChampionAbilities | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of record?.abilities ?? []) out[a.slot] = sha([a.cooldown, a.maxRank, a.charges, a.textHash ?? null, a.cost ?? null, a.resource ?? null, a.range ?? null]);
  if (record?.facts?.stats) out.stats = sha(record.facts.stats);
  return out;
}

/** What changed since a review, in words: "E, base stats" (the slots whose hash differs). */
export function changedParts(before: Record<string, string> | null | undefined, now: Record<string, string>): string[] {
  if (!before) return [];
  const parts: string[] = [];
  for (const slot of ["P", "Q", "W", "E", "R"]) if (before[slot] !== now[slot]) parts.push(slot === "P" ? "Passive" : slot);
  if (before.stats !== now.stats) parts.push("base stats");
  return parts;
}
