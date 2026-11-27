import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";
import { costDisplay } from "@/domain/champion-lookup/cost";
import { ddragonCooldownDisplay, NOT_THE_COOLDOWN } from "@/domain/champion-lookup/cooldown";
import { mechanicsOf, NOT_THE_MECHANIC } from "@/domain/champion-lookup/mechanics";

/*
  THE PATCH CHECK (Release 19, R19-P; docs/PATCH_MAINTENANCE.md): what the app's own Champion Intel
  rules make of a new game version's Data Dragon files, in counts, beside the committed offline
  fixture (the version the rules were last checked on), so a patch day starts from numbers rather
  than a page-by-page look. Read only: run by hand (scripts/patch-check.ts), never by a workflow.
  The production sync applies the same rules to the same files hourly (version-check), and an
  unmatched pattern degrades honestly there (no chip, no cost, "not in Riot's data"); this says
  how many, before anyone opens a page.
*/

export interface PatchCounts {
  champions: number;
  spells: number;
  costs: { perRank: number; none: number; words: number; unresolved: number };
  cooldowns: Record<string, number>;
  mechanicChips: number;
  /** Spells whose cost or cooldown the page shows (resolved): the figure a rules break would drop. */
  resolved: number;
}

const SPELL = new Set(["Q", "W", "E", "R"]);

/** Counts of what the rules make of each champion's abilities (records as the sync stores them). `names` gives a champion's name for the mechanics' own-name rule (the id stands in). */
export function patchCounts(records: Readonly<Record<string, DdragonChampionAbilities>>, names: Readonly<Record<string, string>> = {}): PatchCounts {
  const out: PatchCounts = { champions: 0, spells: 0, costs: { perRank: 0, none: 0, words: 0, unresolved: 0 }, cooldowns: {}, mechanicChips: 0, resolved: 0 };
  for (const [id, record] of Object.entries(records)) {
    out.champions += 1;
    const partype = record.facts?.partype ?? null;
    for (const a of record.abilities) {
      out.mechanicChips += mechanicsOf({ slot: a.slot, description: a.description, textHash: a.textHash ?? null }, { id, name: names[id] ?? id }).length;
      if (!SPELL.has(a.slot)) continue;
      out.spells += 1;
      const cost = costDisplay(a, partype);
      if (!cost) out.costs.unresolved += 1;
      else if (cost.kind === "per-rank") out.costs.perRank += 1;
      else if (cost.kind === "none") out.costs.none += 1;
      else out.costs.words += 1;
      const cd = ddragonCooldownDisplay(a);
      const key = cd.kind === "unknown" ? `unknown:${cd.reason}` : cd.kind;
      out.cooldowns[key] = (out.cooldowns[key] ?? 0) + 1;
      if (cost || cd.kind !== "unknown") out.resolved += 1;
    }
  }
  return out;
}

export interface PatchDiff {
  /** Champions in the new files and not in the baseline, and the other way: counts, then ids (static data, nothing personal). */
  added: string[];
  removed: string[];
  /** Spells and passives whose Riot text hash differs from the baseline's. */
  textChanged: number;
  cooldownChanged: number;
  costChanged: number;
  /** Exceptions pinned to Riot's text or array that no longer match it: each needs a look (docs/PATCH_MAINTENANCE.md). */
  staleMechanicExceptions: string[];
  staleCooldownExceptions: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed between the baseline's records and the new ones, ability by ability. */
export function patchDiff(baseline: Readonly<Record<string, DdragonChampionAbilities>>, next: Readonly<Record<string, DdragonChampionAbilities>>): PatchDiff {
  const out: PatchDiff = { added: [], removed: [], textChanged: 0, cooldownChanged: 0, costChanged: 0, staleMechanicExceptions: [], staleCooldownExceptions: [] };
  for (const id of Object.keys(next).sort()) if (!baseline[id]) out.added.push(id);
  for (const id of Object.keys(baseline).sort()) if (!next[id]) out.removed.push(id);
  const bySpellId = new Map<string, number[]>();
  for (const [id, record] of Object.entries(next)) {
    const before = baseline[id];
    for (const a of record.abilities) {
      if (a.id) bySpellId.set(a.id, a.cooldown);
      const b = before?.abilities.find((x) => x.slot === a.slot);
      if (!b) continue;
      if ((a.textHash ?? null) !== (b.textHash ?? null)) out.textChanged += 1;
      if (!same(a.cooldown, b.cooldown)) out.cooldownChanged += 1;
      if (!same(a.cost, b.cost) || (a.resource ?? null) !== (b.resource ?? null)) out.costChanged += 1;
    }
  }
  for (const [key, exception] of NOT_THE_MECHANIC) {
    const [champion, slot] = key.split("|");
    const ability = next[champion ?? ""]?.abilities.find((a) => a.slot === slot);
    if (ability && (ability.textHash ?? null) !== exception.textHash) out.staleMechanicExceptions.push(key);
  }
  for (const [spellId, exception] of NOT_THE_COOLDOWN) {
    const cooldown = bySpellId.get(spellId);
    if (cooldown && !same(cooldown, exception.cooldown)) out.staleCooldownExceptions.push(spellId);
  }
  return out;
}

/** The problems that fail a patch check: a rules crash (unreadable champions), or resolved figures dropping by more than `maxDropPct` per cent. */
export function patchProblems(input: { unreadable: readonly string[]; baseline: PatchCounts; next: PatchCounts; maxDropPct: number }): string[] {
  const problems: string[] = [];
  if (input.unreadable.length) problems.push(`${input.unreadable.length} champion(s) the rules could not read: ${input.unreadable.join(", ")}`);
  const share = (c: PatchCounts) => (c.spells ? c.resolved / c.spells : 0);
  const drop = (share(input.baseline) - share(input.next)) * 100;
  if (drop > input.maxDropPct) problems.push(`resolved costs or cooldowns fell from ${Math.round(share(input.baseline) * 1000) / 10}% to ${Math.round(share(input.next) * 1000) / 10}% of spells (more than ${input.maxDropPct} points)`);
  const chips = (c: PatchCounts) => (c.champions ? c.mechanicChips / c.champions : 0);
  if (chips(input.baseline) > 0 && (chips(input.baseline) - chips(input.next)) / chips(input.baseline) * 100 > input.maxDropPct) problems.push(`mechanics chips per champion fell from ${chips(input.baseline).toFixed(2)} to ${chips(input.next).toFixed(2)} (more than ${input.maxDropPct}%)`);
  return problems;
}
