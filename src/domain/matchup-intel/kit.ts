import { FACT_KIND_GROUP, KIND_GROUPS, RIOT_TEXT_KIND_GROUP, RIOT_TEXT_KINDS, type AbilityView, type ChampionIntelView, type CooldownDisplay, type FactKind, type FactSubject, type FactTag, type Freshness, type KindGroup, type RiotTextDisagreementView, type RiotTextFactView, type RiotTextKind, type Slot, type SourceLinkView } from "./types";

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

/**
 * A kind from Riot's text (L3) as a chip: the kind's word, and the fact it rests on for this ability
 * (one per ability and kind), with the clause it quotes and what the review recorded beside it: its
 * qualifier and the conditional marker show on the chip itself, so the fact never reads as holding
 * without them; another kind Riot's other text words it as shows in the ability's details only.
 */
export interface RiotTextChip {
  layer: "riot-text";
  group: KindGroup;
  kind: RiotTextKind;
  fact: RiotTextFactView;
}

/**
 * Where Riot's two texts for an ability state different effects: one neutral chip, "Riot's texts
 * differ", whose tip and details give both quotes, picking neither. It sits in the group of each
 * kind it names (once where both share one), and no chip of either kind exists for the ability.
 */
export interface DifferChip {
  layer: "riot-text-differ";
  /** The groups of the two kinds, in KIND_GROUPS' order, each once. */
  groups: KindGroup[];
  disagreement: RiotTextDisagreementView;
}

export type FactChip = CheckedChip | RiotTextChip | DifferChip;

/** Whether a chip belongs to a group (a disagreement to each of its kinds' groups). */
export function inGroup(chip: FactChip, group: KindGroup | null): boolean {
  return chip.layer === "riot-text-differ" ? group !== null && chip.groups.includes(group) : chip.group === group;
}

/** One ability's part of a group: the chips of that group on it, and its cooldown line (Riot's numbers or the checked ones). */
export interface KitItem {
  slot: Slot;
  ability: string;
  chips: FactChip[];
  cooldown: CooldownDisplay;
  /** How fresh the ability's checked notes are (null without notes): its cooldown line's source says it, as on its tile. */
  freshness: Freshness | null;
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
  /** How many of its disagreements are hidden with them. */
  disagreements: number;
  because: "changed" | "renamed" | "unknown";
}

export interface Kit {
  championId: string;
  name: string;
  /** Where the facts come from: checked notes (L2), Riot's text (L3), or none of either. */
  from: "checked" | "riot-text" | "none";
  /** No ability data is stored for this champion (or it cannot be read). */
  noAbilities: boolean;
  /** A record is stored for this champion that cannot be read: said as that, never as missing. */
  unreadable: boolean;
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
 * otherwise one chip per kind from Riot's text, then one "Riot's texts differ" chip for each place
 * Riot's two texts state different effects.
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
    // One chip per kind: the review keeps one fact per ability and kind, and a second is never shown.
    if (!group || byKind.has(f.kind)) continue;
    byKind.set(f.kind, { layer: "riot-text", group, kind: f.kind, fact: f });
  }
  const chips: FactChip[] = [...byKind.values()].sort((x, y) => GROUP_ORDER.get(x.group)! - GROUP_ORDER.get(y.group)! || KIND_ORDER.get(x.kind)! - KIND_ORDER.get(y.kind)!);
  for (const d of a.riotText?.disagreements ?? []) {
    const groups = KIND_GROUPS.filter((g) => RIOT_TEXT_KIND_GROUP[d.description.kind] === g || RIOT_TEXT_KIND_GROUP[d.tooltip.kind] === g);
    if (groups.length) chips.push({ layer: "riot-text-differ", groups, disagreement: d });
  }
  return chips;
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
    const item = { slot: a.slot, ability: a.name, cooldown: a.cooldown, freshness: a.freshness, flagged };
    for (const g of groups) {
      const mine = chips.filter((c) => inGroup(c, g.group));
      if (mine.length) g.items.push({ ...item, chips: mine });
    }
    const other = chips.filter((c) => inGroup(c, null));
    if (other.length) interactions.push({ ...item, chips: other });
    if (a.riotText && (a.riotText.hidden > 0 || a.riotText.hiddenDisagreements > 0) && a.riotText.hiddenBecause) hidden.push({ slot: a.slot, ability: a.name, count: a.riotText.hidden, disagreements: a.riotText.hiddenDisagreements, because: a.riotText.hiddenBecause });
  }
  const noAbilities = !intel.abilities || intel.abilities.length === 0;
  return { championId: intel.champion.id, name: intel.champion.name, from, noAbilities, unreadable: noAbilities && intel.abilitiesUnreadable, groups, interactions, hidden };
}

/** The groups a side of the dashboard lists (how a cooldown behaves shows on the ability tiles instead). */
export const SIDE_GROUPS: readonly KindGroup[] = ["crowd-control", "power", "mobility", "defence", "sustain"];
