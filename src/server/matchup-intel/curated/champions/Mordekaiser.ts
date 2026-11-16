import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Mordekaiser: curated champion notes (Layer 1), checked on 16 Nov 2026 against patch 26.22 and Data
  Dragon 16.22.1.

  Sources: the League of Legends Wiki's ability data pages for his current abilities
  (Template:Data Mordekaiser/<ability>, read at the revisions below, CC BY-SA 3.0) and Data Dragon
  16.22.1. The saved pages also hold his abilities from before his rework (Iron Man, Mace of
  Spades, Harvester of Sorrow, Siphon of Destruction, Children of the Grave, last edited in 2019
  and 2020); the slot pages (Template:Data Mordekaiser/I, Q, W, E and R) redirect to the current
  ones, and nothing here comes from the old pages. Each ability's ddragonCooldown and
  ddragonIdentity are Data Dragon's cooldown array, spell id, name, ranks and charges, copied exactly
  (the passive has no cooldown or id in Data Dragon); the wiki's cooldown for every ability matches.
  Numbers are base values per rank, without ability haste. Every text is UNIIVERSE's own summary of
  what the page states. Badges read from a page's fields use the meanings Template:Ability data
  gives them (spellshield: a spell shield nullifies it).

  Realm of Death's page was read at revision 4093177 (8 Nov 2026, during patch 26.22). What that
  revision changed from the one before (4082248, 9 Oct) was not compared: only the current text was
  saved, and the wiki is not read by scripts.

  Cooldown starts, from the page's cooldown-start field (cdstart), and null where it gives none:
  - W: "after-effect-ends" (post-effect).
  - R: "on-cast".
  - Q, E: null: no cdstart.
  - P: no cooldown spec: the page gives none, and Data Dragon never gives a passive one.

  Level notes: Darkness Rise's movement-speed steps at levels 6 and 11, and Obliterate's per-level
  damage from level 10, as the pages give them. The page's movement-speed scale also lists steps
  at levels 19, 24 and 30; they are left out.

  Disputed, so left off the page until a person resolves it:
  - whose kill lets him keep the stolen stats: the wiki says the target dying inside the Death
    Realm; Riot's tooltip says Mordekaiser killing them. The notes say what both cover: when he
    kills them inside.

  Left out, and why:
  - the levels at which the ultimate gains ranks: no saved page states them;
  - a recast window in seconds for Indestructible: the recast is open from 0.5 seconds while the
    4-second shield lasts, which the recast note says in words;
  - which way Death's Grasp pulls: the page gives the distance (250 units), not the direction
    (Riot's tooltip says "in his direction", but tooltips are not used: their numbers are
    unresolved placeholders);
  - the wiki's lane tip on where to cast Realm of Death: advice, not a mechanic.
*/

const notes: ChampionNotes = {
  championId: "Mordekaiser",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "mordekaiser-p", title: "League of Legends Wiki: Darkness Rise (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Darkness_Rise", kind: "wiki-ability", revision: 4070051, revisionTime: "2026-09-29T15:58:08Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-q", title: "League of Legends Wiki: Obliterate (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Obliterate", kind: "wiki-ability", revision: 4078264, revisionTime: "2026-10-06T20:47:39Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-w", title: "League of Legends Wiki: Indestructible (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Indestructible", kind: "wiki-ability", revision: 4016354, revisionTime: "2026-05-10T19:48:19Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-e", title: "League of Legends Wiki: Death's Grasp (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Death's_Grasp", kind: "wiki-ability", revision: 4070332, revisionTime: "2026-09-29T18:36:13Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-r", title: "League of Legends Wiki: Realm of Death (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Realm_of_Death", kind: "wiki-ability", revision: 4093177, revisionTime: "2026-11-08T17:57:11Z", licence: "CC BY-SA 3.0" },
    { id: "ability-data", title: "League of Legends Wiki: Template:Ability data (what each field means)", url: "https://wiki.leagueoflegends.com/en-us/Template:Ability_data", kind: "wiki-reference", revision: 4084623, revisionTime: "2026-10-13T17:49:21Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Mordekaiser", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Mordekaiser.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "Darkness Rise", maxRank: 1, charges: null },
      facts: [
        { kind: "exception", label: "Three stacks to activate", detail: "Hits on enemy champions and large monsters, by his attacks or basic abilities, give a stack each; stacks last 4 seconds, renewed by every new one, and 3 turn Darkness Rise on.", appliesTo: "self", source: "mordekaiser-p" },
        { kind: "damage", label: "% max health aura", detail: "While it is on, enemies within 375 units take magic damage every second: 5 (+30% AP) plus 1–5% of their maximum health, rising with his level.", appliesTo: "area", tags: ["max-health-damage"], source: "mordekaiser-p" },
        { kind: "exception", label: "Stacks hidden from enemies", detail: "Other champions cannot see how many stacks he has.", appliesTo: "self", source: "mordekaiser-p" },
        { kind: "interaction", label: "Blocked abilities still stack", detail: "A basic ability gives a stack even when a spell shield or invulnerability stops its damage. An attack gives none if it is dodged, blocked, missed through blindness or meets invulnerability.", appliesTo: "self", tags: ["spell-shield"], source: "mordekaiser-p" },
      ],
      details: [
        "His basic attacks deal bonus magic damage of 40% AP on hit, except against structures.",
        "While Darkness Rise is on he gains bonus movement speed: 3%, rising to 6% at level 6 and 9% at level 11.",
        "The aura deals its damage in eighths, every 0.125 seconds. Against monsters it is capped at 40 to 200 a second, by level.",
        "The aura's own damage does not refresh Darkness Rise, and a spell shield does not block it.",
      ],
    },
    Q: {
      ddragonCooldown: [8, 7, 6, 5, 4],
      ddragonIdentity: { id: "MordekaiserQ", name: "Obliterate", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null },
      facts: [
        { kind: "damage", label: "More on a lone target", detail: "30% more damage at rank 1, up to 50% at rank 5, when it hits only one enemy.", appliesTo: "target", source: "mordekaiser-q" },
        { kind: "exception", label: "0.5-second windup", detail: "It strikes at the end of its 0.5-second cast time, towards where his cursor was when the cast began.", appliesTo: "self", source: "mordekaiser-q" },
        { kind: "interaction", label: "Blockable", detail: "A spell shield blocks it.", appliesTo: "target", tags: ["spell-shield"], source: "mordekaiser-q" },
      ],
      details: [
        "Magic damage: 80 to 220 (+120% bonus AD) (+70% AP) by rank, plus 7 at level 10, rising by 7 a level to 63 at level 18.",
        "It strikes a line from 22.5 to 625 units in front of him, 90 units wide at the start and 150 at the end.",
      ],
    },
    W: {
      ddragonCooldown: [12, 11, 10, 9, 8],
      ddragonIdentity: { id: "MordekaiserW", name: "Indestructible", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [12, 11, 10, 9, 8], starts: "after-effect-ends" },
      cooldownNote: "The shield lasts 4 seconds, and the recast consumes what is left of it.",
      recast: { count: 1, note: "From 0.5 seconds after the cast, while the shield lasts: he consumes what is left of it and heals for 35 to 45% of that amount (by rank)." },
      facts: [
        { kind: "defence", label: "Shield", detail: "Turns his stored Potential Shield into a shield for 4 seconds, which decays over that time.", appliesTo: "self", tags: ["shield"], source: "mordekaiser-w" },
        { kind: "sustain", label: "Heal on recast", detail: "35 to 45% (by rank) of the shield left: at least 1.75 to 2.25% and at most 10.5 to 13.5% of his maximum health.", appliesTo: "self", tags: ["heal"], source: "mordekaiser-w" },
        { kind: "exception", label: "Stored from damage", detail: "45% of the damage he deals (after mitigation) and 7.5% of the damage he takes (before mitigation) go into his store, capped at 30% of his maximum health.", appliesTo: "self", tags: ["shield"], source: "mordekaiser-w" },
      ],
      details: [
        "Damage dealt to or taken from non-champions stores 75% less.",
        "After 1 second with no damage dealt or taken, the store drains by 8 to 25 a second (by level).",
        "When Indestructible is ready, the store does not drain below 5% of his maximum health; when the cooldown ends, a lower store is topped up to 5%.",
        "The cast and the recast each count for on-cast effects, Spellblade for example. It has no cast time.",
      ],
    },
    E: {
      ddragonCooldown: [16, 14, 12, 10, 8],
      ddragonIdentity: { id: "MordekaiserE", name: "Death's Grasp", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [16, 14, 12, 10, 8], starts: null },
      facts: [
        { kind: "crowd-control", label: "Pull", detail: "0.5 seconds after he summons the claw, it damages enemies in its area and pulls them 250 units.", appliesTo: "target", tags: ["pull"], source: "mordekaiser-e" },
        { kind: "exception", label: "Seen late", detail: "Enemies see the claw only once it is at least 300 units inside their vision.", appliesTo: "self", source: "mordekaiser-e" },
        { kind: "interaction", label: "Blockable", detail: "A spell shield blocks it.", appliesTo: "target", tags: ["spell-shield"], source: "mordekaiser-e" },
      ],
      details: [
        "Magic damage: 60 to 140 (+45% AP) by rank.",
        "Cast range 700 units and maximum range 900; the claw is 200 units wide. The cast time is 0.25 seconds.",
        "The claw gives sight of its area, and its pull lands even if Mordekaiser dies first.",
        "Passive: 5 to 15% magic penetration, by rank.",
      ],
    },
    R: {
      ddragonCooldown: [120, 110, 100],
      ddragonIdentity: { id: "MordekaiserR", name: "Realm of Death", maxRank: 3, charges: null },
      cooldown: { kind: "per-rank", seconds: [120, 110, 100], starts: "on-cast" },
      facts: [
        { kind: "crowd-control", label: "Slow, 75%", detail: "During the 0.5-second cast the target champion is slowed by 75% and revealed. A spell shield does not stop the slow.", appliesTo: "target", tags: ["slow"], source: "mordekaiser-r" },
        // Who has it: the target, whom he banishes; he goes with them.
        { kind: "exception", label: "Death Realm, 7 s", detail: "After the cast, he and the target alone go to the Death Realm for 7 seconds. Units outside see only where they are and cannot affect them, and the reverse.", appliesTo: "target", source: "mordekaiser-r" },
        { kind: "exception", label: "Steals 10% of stats", detail: "For the 7 seconds he takes 10% of the target's AP, attack speed, maximum health, armour and magic resistance, and base AD equal to 10% of their AD. If he kills them inside, he keeps the stats until they respawn.", appliesTo: "self", source: "mordekaiser-r" },
        { kind: "sustain", label: "Heal", detail: "He heals for 10% of the target's maximum health; healing modifiers apply.", appliesTo: "self", tags: ["heal"], source: "mordekaiser-r" },
        { kind: "interaction", label: "Health loss ignores shields", detail: "The maximum health it takes ignores shields, resistances and invulnerability, and does not take the target below 1 health.", appliesTo: "target", tags: ["max-health-damage"], source: "mordekaiser-r" },
        { kind: "interaction", label: "Fails on spell shields", detail: "A spell shield, crowd-control immunity or displacement immunity on the target when the cast ends makes it fail and go on cooldown; any gained after the banish does nothing.", appliesTo: "target", tags: ["spell-shield", "cc-immune", "displacement-immune"], source: "mordekaiser-r" },
      ],
      details: [
        "Range 650 units. The realm is an arena of radius 1,200 that keeps the map's walls and brush. Its edge holds them in, and dashes, blinks and displacements stop at it.",
        "The death of either, or either being forced out, ends it early.",
        "A cast cancelled because the target turned untargetable, died, got too far away or was hidden from him by nearsight does not use the cooldown.",
        "Turrets are not split by the realms: they behave as if nobody had left.",
        "Going in clears forced-action effects from both, and targeted projectiles are destroyed whenever the two go in or out.",
        "Both keep earning gold and experience while inside.",
      ],
    },
  },
  levelNotes: [
    { level: 6, text: "Darkness Rise's bonus movement speed rises from 3% to 6%.", source: "mordekaiser-p", basedOn: ["P"] },
    { level: 10, text: "Obliterate starts gaining damage with his level: 7 at level 10, then 7 more each level, to 63 at level 18.", source: "mordekaiser-q", basedOn: ["Q"] },
    { level: 11, text: "Darkness Rise's bonus movement speed rises to 9%.", source: "mordekaiser-p", basedOn: ["P"] },
  ],
};

export default notes;
