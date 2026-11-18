import { FACT_KIND_GROUP, KIND_GROUPS, RIOT_TEXT_KIND_GROUP, RIOT_TEXT_KINDS, type AbilityView, type ChampionIntelView, type CooldownDisplay, type FactKind, type FactSubject, type FactTag, type KindGroup, type RiotTextKind, type RiotTextSource, type Slot, type SourceLinkView } from "./types";

/*
  MATCHUP INTEL's assembled reference (docs/MATCHUP_INTEL.md, "The assembled reference"): one
  champion's facts grouped by kind, for the dashboard's danger and opportunity sides and its ability
  tiles. Pure functions over the plain view the page already built: no query, no new claim.

  Group, never judge. Each side's facts are sorted by their own kind (crowd control, burst and
  power, mobility, defence, sustain, how a cooldown behaves), in slot order (P, Q, W, E, R) and then
  in the kinds' own order. Nothing here chooses a threat or an opportunity, ranks one fact above
  another, or relates one champion's kit to the other's: the two kits are only set side by side.

  Where the facts come from: a champion's checked notes (L2) where it has them, else its facts
  from Riot's text (L3), else none, which the page says in words ("none recorded", never "none").
*/

/** A checked fact (L2) as a chip: its own label, and what its tip says. */
export interface CheckedChip {
  layer: "checked";
  group: KindGroup | null;
  kind: FactKind;
  word: string;
  detail: string | null;
  appliesTo: FactSubject | null;
  tags: FactTag[];
  source: SourceLinkView;
}

/** A kind from Riot's text (L3) as a chip: the kind's word, and every clause it rests on for this ability. */
export interface RiotTextChip {
  layer: "riot-text";
  group: KindGroup;
  kind: RiotTextKind;
  clauses: Array<{ clause: string; source: RiotTextSource }>;
}

export type FactChip = CheckedChip | RiotTextChip;

/** One ability's part of a group: the chips of that group on it, and its cooldown line (Riot's numbers or the checked ones). */
export interface KitItem {
  slot: Slot;
  ability: string;
  chips: FactChip[];
  cooldown: CooldownDisplay;
  /** Riot's data for this ability moved after its checked notes were checked: they are flagged. */
  flagged: boolean;
}

export interface KitGroup {
  group: KindGroup;
  items: KitItem[];
}

/** An ability whose facts from Riot's text are hidden, and why (RiotTextAbilityView). */
export interface HiddenFacts {
  slot: Slot;
  ability: string;
  count: number;
  because: "changed" | "renamed" | "unknown";
}

export interface Kit {
  championId: string;
  name: string;
  /** Where the facts come from: checked notes (L2), Riot's text (L3), or none of either. */
  from: "checked" | "riot-text" | "none";
  /** No ability data is stored for this champion (or it cannot be read). */
  noAbilities: boolean;
  /** Every group, in KIND_GROUPS' order, each with the abilities that have a fact of it (possibly none). */
  groups: KitGroup[];
  /** Checked interactions and exceptions (L2), in slot order: they are no group's. */
  interactions: KitItem[];
  hidden: HiddenFacts[];
}

const KIND_ORDER = new Map<string, number>(RIOT_TEXT_KINDS.map((k, i) => [k, i]));
const GROUP_ORDER = new Map<string, number>(KIND_GROUPS.map((g, i) => [g, i]));

/**
 * An ability's chips, in the order a tile shows them: by group (crowd control first, interactions
 * and exceptions last), then the kinds' own order for Riot's text, the notes' own order for checked
 * facts. Checked facts where the ability has them (a champion with checked notes shows only those);
 * otherwise one chip per kind from Riot's text, holding every clause that names it.
 */
export function abilityChips(a: AbilityView): FactChip[] {
  if (a.facts.length) {
    const checked = a.facts.map((f, i): CheckedChip & { i: number } => ({ layer: "checked", group: FACT_KIND_GROUP[f.kind] ?? null, kind: f.kind, word: f.label, detail: f.detail, appliesTo: f.appliesTo, tags: f.tags, source: f.source, i }));
    return checked
      .sort((x, y) => (x.group === null ? KIND_GROUPS.length : GROUP_ORDER.get(x.group)!) - (y.group === null ? KIND_GROUPS.length : GROUP_ORDER.get(y.group)!) || x.i - y.i)
      .map(({ i: _i, ...chip }) => chip);
  }
  const byKind = new Map<RiotTextKind, RiotTextChip>();
  for (const f of a.riotText?.facts ?? []) {
    const group = RIOT_TEXT_KIND_GROUP[f.kind];
    if (!group) continue;
    const chip = byKind.get(f.kind) ?? { layer: "riot-text", group, kind: f.kind, clauses: [] };
    if (!chip.clauses.some((c) => c.clause === f.clause && c.source === f.source)) chip.clauses.push({ clause: f.clause, source: f.source });
    byKind.set(f.kind, chip);
  }
  return [...byKind.values()].sort((x, y) => GROUP_ORDER.get(x.group)! - GROUP_ORDER.get(y.group)! || KIND_ORDER.get(x.kind)! - KIND_ORDER.get(y.kind)!);
}

/** Where a champion's facts come from: checked notes, else Riot's text, else none. */
export function factsFrom(intel: ChampionIntelView): Kit["from"] {
  if (intel.curated) return "checked";
  if (intel.riotText) return "riot-text";
  return "none";
}

/** One champion's kit, grouped by kind (see the module's comment). */
export function kitOf(intel: ChampionIntelView): Kit {
  const abilities = intel.abilities ?? [];
  const from = factsFrom(intel);
  const groups: KitGroup[] = KIND_GROUPS.map((group) => ({ group, items: [] }));
  const interactions: KitItem[] = [];
  const hidden: HiddenFacts[] = [];
  for (const a of abilities) {
    const chips = abilityChips(a);
    const flagged = a.freshness === "changed-since";
    for (const g of groups) {
      const mine = chips.filter((c) => c.group === g.group);
      if (mine.length) g.items.push({ slot: a.slot, ability: a.name, chips: mine, cooldown: a.cooldown, flagged });
    }
    const other = chips.filter((c) => c.group === null);
    if (other.length) interactions.push({ slot: a.slot, ability: a.name, chips: other, cooldown: a.cooldown, flagged });
    if (a.riotText && a.riotText.hidden > 0 && a.riotText.hiddenBecause) hidden.push({ slot: a.slot, ability: a.name, count: a.riotText.hidden, because: a.riotText.hiddenBecause });
  }
  return { championId: intel.champion.id, name: intel.champion.name, from, noAbilities: !intel.abilities || intel.abilities.length === 0, groups, interactions, hidden };
}

/** The groups a side of the dashboard lists (how a cooldown behaves shows on the ability tiles instead). */
export const SIDE_GROUPS: readonly KindGroup[] = ["crowd-control", "power", "mobility", "defence", "sustain"];
