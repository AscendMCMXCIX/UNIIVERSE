import { patchFromVersion, publicPatchName, comparePatches } from "@/domain/patch";
import { ddragonCooldownDisplay, type CooldownDisplay } from "./cooldown";
import { costDisplay, type CostDisplay } from "./cost";
import { keyMechanics, mechanicsOf, type KeyMechanics, type MechanicFact } from "./mechanics";
import { resourceName, statRows, type StatRow } from "./stats";
import { SLOTS, type ChampionChoice, type DdragonChampionAbilities, type Slot } from "./types";

/*
  CHAMPION INTEL's page as data (docs/CHAMPION_INTEL.md), built on the server from the roster and
  the stored Data Dragon record of each champion the address names (one, or two side by side);
  plain data goes to the browser. Pure, so it is tested without a database (view.test.ts).
*/

/** One ability as the page draws it. */
export interface LookupAbility {
  slot: Slot;
  name: string;
  /** The icon on Data Dragon at the record's version; null when the version or file name is not one (the page draws the key instead). */
  icon: string | null;
  /** Ranks the ability takes (1 for the passive). */
  ranks: number;
  /** Riot's base cooldown per rank, or why there is none (ddragonCooldownDisplay). */
  cooldown: CooldownDisplay;
  /** Riot's description, its markup removed; "" where Riot's text could not be shown whole. */
  description: string;
  /** The ability's cost where Riot's own resource line is filled by its own data (costDisplay), else null. */
  cost: CostDisplay | null;
  /** The kinds of mechanic Riot's description names, each with its sentence and where its words stand (mechanicsOf). */
  mechanics: MechanicFact[];
  /** What changed in Riot's data for this ability since the champion's previous stored version, with that version's public patch; null for nothing known. */
  changed: { sincePatch: string | null; text: boolean; cooldown: boolean; cost: boolean } | null;
}

/** The champion's own facts as the page shows them: Riot's resource and classes, its base statistics. */
export interface LookupFacts {
  /** Riot's word for its resource ("Mana", "Energy", "Fury"); null for none ("None") or none named. */
  resource: string | null;
  /** The champion has no resource at all by Riot's data ("None"), said as that. */
  resourceless: boolean;
  /** Riot's classes ("Mage", "Assassin"). */
  classes: string[];
  /** Base statistics and their growth (statRows). */
  stats: StatRow[];
  /** The public patch of the previous stored version, where Riot's base stats differed; null when they did not or nothing was compared. */
  statsChangedSincePatch: string | null;
}

export interface LookupChampion {
  champion: ChampionChoice;
  /** The Data Dragon version the abilities were read at ("16.22.1"); null when none are stored. */
  version: string | null;
  /** That version's public patch ("26.22"); null with no version. */
  patch: string | null;
  /** The abilities come from the committed offline copy (stored where Data Dragon could not be read), not a copy the game-data job read. */
  offline: boolean;
  /** The five abilities, Passive first; null when none are stored for this champion yet, or what is stored cannot be read (`unreadable`). */
  abilities: LookupAbility[] | null;
  /** A record is stored for this champion but is not in the shape the page reads. */
  unreadable: boolean;
  /** Riot's resource, classes and base statistics; null on a record from before rules format 4 (they arrive with the next game-data update). */
  facts: LookupFacts | null;
  /** The kinds of mechanic Riot's descriptions name, grouped (keyMechanics); empty groups with no abilities. */
  mechanics: KeyMechanics;
}

export interface LookupPage {
  /** Every active champion, by name (the selector's list). */
  champions: ChampionChoice[];
  /** The champion the address names, or null (none named, or not on the roster: `dropped`). */
  lookup: LookupChampion | null;
  /** The second champion the address names (`champion2`), shown beside the first; null for none. */
  second: LookupChampion | null;
  /** The address named a champion that is not on the roster: left out, never repeated back. */
  dropped: boolean;
  /** The game's current patch, public name ("26.22"); null when none is known (or it is the offline fixture). */
  currentPatch: string | null;
}

/** A Data Dragon version as stored ("16.22.1"). */
const VERSION = /^\d{1,3}(\.\d{1,4}){1,3}$/;
/** A Data Dragon image file name ("RivenTriCleave.png", "Renekton_Predator.png"). */
const ICON_FILE = /^[\w.\- ]{1,100}\.(png|jpe?g|webp)$/i;

/** An ability's icon on Data Dragon: /img/passive/ for the passive, /img/spell/ for the others; null when the version or the file name is not one. */
export function abilityIconUrl(version: string | null, slot: Slot, icon: string): string | null {
  if (!version || !VERSION.test(version) || typeof icon !== "string" || !ICON_FILE.test(icon)) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/${slot === "P" ? "passive" : "spell"}/${encodeURIComponent(icon)}`;
}

/** "26.22" for Data Dragon "16.22.1": the public patch a version belongs to; null when it is not a version. */
export function publicPatchOf(version: string | null): string | null {
  const patch = version && VERSION.test(version) ? patchFromVersion(version) : null;
  return patch ? publicPatchName(patch) : null;
}

/** Whether the abilities are older than the game's current patch (both public names), so the page says which patch they are from. */
export function behindPatch(abilitiesPatch: string | null, currentPatch: string | null): boolean {
  return !!abilitiesPatch && !!currentPatch && comparePatches(abilitiesPatch, currentPatch) < 0;
}

/** A search key: case, accents, spaces and punctuation ignored ("Kha'Zix" = "khazix"). */
const looseKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The longest id or name the address may carry; anything longer is not a champion. */
const MAX_PARAM = 64;

/**
 * The champion an address names, from the roster only: its id exactly, else its id or name with
 * case, accents and punctuation ignored ("ahri", "Wukong" for MonkeyKing, "kha'zix"). Anything else
 * is dropped, so only the roster's own ids ever reach a link, a query or an attribute.
 */
export function championResolver(champions: readonly ChampionChoice[]): (raw: unknown) => ChampionChoice | null {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const byKey = new Map<string, ChampionChoice>();
  for (const c of champions) for (const k of [looseKey(c.id), looseKey(c.name)]) if (k && !byKey.has(k)) byKey.set(k, c);
  return (raw) => {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s || s.length > MAX_PARAM) return null;
    return byId.get(s) ?? byKey.get(looseKey(s)) ?? null;
  };
}

/** The champion's own facts from its record (rules format 4), or null for a record without them. */
export function lookupFacts(record: DdragonChampionAbilities | null): LookupFacts | null {
  const facts = record?.facts;
  if (!facts || typeof facts !== "object") return null;
  const partype = typeof facts.partype === "string" ? facts.partype.trim() : "";
  return {
    resource: resourceName(partype),
    resourceless: /^none$/i.test(partype),
    classes: Array.isArray(facts.tags) ? facts.tags.filter((t): t is string => typeof t === "string" && /^[A-Za-z ]{1,30}$/.test(t)) : [],
    stats: statRows(facts),
    statsChangedSincePatch: typeof facts.statsChangedSince === "string" ? publicPatchOf(facts.statsChangedSince) : null,
  };
}

/** One champion's page from its stored record (null: none stored), in slot order, each ability through the cooldown guard, its cost rule and its mechanics' words. */
export function lookupChampion(champion: ChampionChoice, record: DdragonChampionAbilities | null, flags: { offline?: boolean; unreadable?: boolean } = {}): LookupChampion {
  const version = record?.version ?? null;
  const partype = record?.facts?.partype ?? null;
  const abilities = record
    ? SLOTS.map((slot): LookupAbility | null => {
        const a = record.abilities.find((x) => x.slot === slot);
        if (!a) return null;
        const description = typeof a.description === "string" ? a.description : "";
        const changed = a.changed && typeof a.changed === "object" ? { sincePatch: publicPatchOf(a.changed.since), text: a.changed.text === true, cooldown: a.changed.cooldown === true, cost: a.changed.cost === true } : null;
        return {
          slot,
          name: a.name,
          icon: abilityIconUrl(version, slot, a.icon),
          ranks: a.maxRank,
          cooldown: ddragonCooldownDisplay(a),
          description,
          cost: costDisplay(a, partype),
          mechanics: mechanicsOf({ slot, description, textHash: a.textHash ?? null }, { id: champion.id, name: champion.name }),
          changed: changed && (changed.text || changed.cooldown || changed.cost) ? changed : null,
        };
      })
    : null;
  const whole = abilities && abilities.every((a): a is LookupAbility => a !== null) ? abilities : null;
  return {
    champion,
    version,
    patch: publicPatchOf(version),
    offline: !!record && flags.offline === true,
    abilities: whole,
    unreadable: flags.unreadable === true || (!!record && !whole),
    facts: whole ? lookupFacts(record) : null,
    mechanics: keyMechanics(whole ? whole.flatMap((a) => a.mechanics) : []),
  };
}
