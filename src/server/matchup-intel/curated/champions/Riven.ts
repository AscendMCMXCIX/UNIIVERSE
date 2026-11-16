import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Riven: curated champion notes (Layer 1), checked on 16 Nov 2026 against patch 26.22.

  Sources: the League of Legends Wiki's ability data pages (Template:Data Riven/<ability>, read at the
  revisions below, CC BY-SA 3.0) and Data Dragon 16.22.1. Each ddragonCooldown is that spell's
  "cooldown" array copied exactly (the passive's is []); the wiki's cooldown for every ability
  matches it. Numbers are base values per rank, without ability haste. Every text is UNIIVERSE's own
  summary of what the page states.

  Badges read from a page's fields use the meanings Template:Ability data gives them: spellshield
  (a spell shield nullifies it), parry (blind, block or dodge prevents it), grounded (grounding
  disables it) and knockdown (its movement is interrupted and overridden by an enemy knock-down or
  displacement).

  Cooldown starts:
  - Q: "after-first-cast", from the wiki's cooldown note ("Starts after first cast"). Its
    cooldown-start field says on-cast, which names the same moment: the 13 seconds run from the
    first cast.
  - R: "after-effect-ends", from the wiki's cooldown-start field ("post-effect").
  - W, E: "on-cast" as the ordinary case: the wiki gives no special start.
  - P: no cooldown recorded. The wiki gives none for Runic Blade and Data Dragon never does.

  Left out for want of a stated source:
  - level notes: no saved page states when her abilities unlock or when her ultimate gains ranks;
  - a recast window in seconds for Wind Slash: the page allows it from 0.5 seconds into Blade of
    the Exile until the 15 seconds end, which the recast note says in words;
  - that each Broken Wings cast gives a Runic Blade charge: Runic Blade's page says ability casts
    give charges and Broken Wings' page that each cast counts for on-cast effects, but neither
    names the other;
  - whether Wind Slash ends Blade of the Exile early: neither page says.
*/

const notes: ChampionNotes = {
  championId: "Riven",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "riven-p", title: "League of Legends Wiki: Runic Blade (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Runic_Blade", kind: "wiki-ability", revision: 4091406, revisionTime: "2026-10-30T14:54:09Z", licence: "CC BY-SA 3.0" },
    { id: "riven-q", title: "League of Legends Wiki: Broken Wings (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Broken_Wings", kind: "wiki-ability", revision: 4025373, revisionTime: "2026-06-05T15:05:11Z", licence: "CC BY-SA 3.0" },
    { id: "riven-w", title: "League of Legends Wiki: Ki Burst (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Ki_Burst", kind: "wiki-ability", revision: 4024218, revisionTime: "2026-05-30T15:30:49Z", licence: "CC BY-SA 3.0" },
    { id: "riven-e", title: "League of Legends Wiki: Valor (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Valor", kind: "wiki-ability", revision: 3959341, revisionTime: "2025-10-13T20:20:07Z", licence: "CC BY-SA 3.0" },
    { id: "riven-r", title: "League of Legends Wiki: Blade of the Exile (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Blade_of_the_Exile", kind: "wiki-ability", revision: 4046587, revisionTime: "2026-07-28T20:03:18Z", licence: "CC BY-SA 3.0" },
    { id: "riven-wind-slash", title: "League of Legends Wiki: Wind Slash (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Wind_Slash", kind: "wiki-ability", revision: 4046588, revisionTime: "2026-07-28T20:03:27Z", licence: "CC BY-SA 3.0" },
    { id: "ability-data", title: "League of Legends Wiki: Template:Ability data (what each field means)", url: "https://wiki.leagueoflegends.com/en-us/Template:Ability_data", kind: "wiki-reference", revision: 4084623, revisionTime: "2026-10-13T17:49:21Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Riven", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Riven.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "Runic Blade", maxRank: 1, charges: null },
      facts: [
        { kind: "exception", label: "Charged attacks", detail: "Each ability cast stores a charge for 6 seconds, up to 3, and each basic attack spends one for bonus physical damage.", appliesTo: "self", source: "riven-p" },
        { kind: "exception", label: "Charges hidden from enemies", detail: "Only Riven's player sees how many charges she holds, on a counter under her health bar.", appliesTo: "self", source: "riven-p" },
        { kind: "interaction", label: "Crits and life steal apply", detail: "The bonus damage can critically strike, and life steal applies to it in full.", appliesTo: "self", source: "riven-p" },
      ],
      details: [
        "Bonus damage per charge: 30% of her AD at level 1, rising evenly to 45% at level 18. Half as much against structures; 50 more against monsters.",
        "A new ability cast, or spending a charge, restarts the 6 seconds.",
        "Blind, block or dodge stop the bonus damage, and it never triggers on wards.",
      ],
    },
    Q: {
      ddragonCooldown: [13, 13, 13, 13, 13],
      ddragonIdentity: { id: "RivenTriCleave", name: "Broken Wings", maxRank: 5, charges: null },
      // Wiki cooldown note: "Starts after first cast" (its cooldown-start field, on-cast, names the same moment).
      cooldown: { kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast" },
      cooldownNote: "The 13 seconds count from the first cast. Between casts there is a 0.3125-second wait that ability haste does not shorten.",
      recast: { count: 2, windowSeconds: 4, note: "Each recast must come within 4 seconds of the cast before it, or the ability goes on cooldown. The third hits a wider area and knocks enemies back." },
      facts: [
        { kind: "mobility", label: "Three dashes", detail: "Each cast dashes 225 units the way she faces, or up to 225 units towards a targeted enemy. Only the third can cross terrain.", appliesTo: "self", tags: ["dash"], source: "riven-q" },
        { kind: "crowd-control", label: "Knock-back", detail: "The third cast knocks enemies hit back 75 units over 0.5 seconds.", appliesTo: "target", tags: ["knock-back"], source: "riven-q" },
        { kind: "exception", label: "Resets her attack", detail: "Each cast resets her basic attack timer and orders an attack on the targeted enemy, if there is one.", appliesTo: "self", tags: ["attack-reset"], source: "riven-q" },
        { kind: "interaction", label: "Interruptible dash", detail: "Grounding disables it, and an enemy knock-down or displacement interrupts and overrides the dash.", appliesTo: "self", tags: ["ground", "interrupt"], source: "riven-q" },
        { kind: "interaction", label: "Blockable", detail: "A spell shield blocks it.", appliesTo: "target", tags: ["spell-shield"], source: "riven-q" },
      ],
      details: [
        "Physical damage per cast: 45 to 165 (+60 to 80% bonus AD) by rank; three times that over all three casts.",
        "Radius: 150 units for the first two casts and 250 for the third; 200 and 300 during Blade of the Exile.",
        "After the third cast she is kept from attacking or casting for longer than after the first two.",
        "Every cast counts separately for on-cast effects, Spellblade for example.",
      ],
    },
    W: {
      ddragonCooldown: [11, 10, 9, 8, 7],
      ddragonIdentity: { id: "RivenMartyr", name: "Ki Burst", maxRank: 5, charges: null },
      // The wiki gives no cooldown start: on-cast, the ordinary case.
      cooldown: { kind: "per-rank", seconds: [11, 10, 9, 8, 7], starts: "on-cast" },
      facts: [
        { kind: "crowd-control", label: "Stun", detail: "0.75 seconds, on enemies within 300 units (360 during Blade of the Exile).", appliesTo: "target", tags: ["stun"], source: "riven-w" },
        { kind: "exception", label: "Instant effect", detail: "The damage and stun apply at once; the 0.25-second cast time comes after them.", appliesTo: "self", source: "riven-w" },
        { kind: "interaction", label: "Blockable", detail: "A spell shield blocks it.", appliesTo: "target", tags: ["spell-shield"], source: "riven-w" },
      ],
      details: [
        "Physical damage: 65 to 185 (+100% bonus AD) by rank.",
        "Once the cast time ends, she cannot attack for a moment.",
      ],
    },
    E: {
      ddragonCooldown: [10, 9, 8, 7, 6],
      ddragonIdentity: { id: "RivenFeint", name: "Valor", maxRank: 5, charges: null },
      // The wiki gives no cooldown start: on-cast, the ordinary case.
      cooldown: { kind: "per-rank", seconds: [10, 9, 8, 7, 6], starts: "on-cast" },
      facts: [
        { kind: "mobility", label: "Dash", detail: "Up to 250 units in the chosen direction, not through terrain; aimed beyond that, it goes the full 250. She can cast her other abilities during it.", appliesTo: "self", tags: ["dash"], source: "riven-e" },
        { kind: "defence", label: "Shield", detail: "70 to 170 (+110% bonus AD) by rank, for 1.5 seconds.", appliesTo: "self", tags: ["shield"], source: "riven-e" },
        { kind: "interaction", label: "Interruptible dash", detail: "Grounding disables it, and an enemy knock-down or displacement interrupts and overrides the dash.", appliesTo: "self", tags: ["ground", "interrupt"], source: "riven-e" },
      ],
      details: ["It has no cast time."],
    },
    R: {
      ddragonCooldown: [120, 90, 60],
      ddragonIdentity: { id: "RivenFengShuiEngine", name: "Blade of the Exile", maxRank: 3, charges: null },
      // Wiki cooldown-start field: post-effect.
      cooldown: { kind: "per-rank", seconds: [120, 90, 60], starts: "after-effect-ends" },
      cooldownNote: "Starts after the effect, not on cast; the empowerment lasts 15 seconds.",
      // One Wind Slash: the wiki describes a single cast within the duration, and Data Dragon's description says "once".
      recast: { count: 1, note: "Wind Slash, from 0.5 seconds into Blade of the Exile until its 15 seconds end: three missiles in a cone that deal more damage the more health the target is missing." },
      facts: [
        { kind: "damage", label: "Bonus AD for 15 s", detail: "Bonus AD equal to 20% of her AD, 75 more attack range, and wider Broken Wings and Ki Burst areas.", appliesTo: "self", source: "riven-r" },
        { kind: "damage", label: "Missing-health damage", detail: "Wind Slash's damage rises with the health the target is missing, up to three times as much at 75% missing.", appliesTo: "target", source: "riven-wind-slash" },
        { kind: "interaction", label: "Wind Slash blockable", detail: "A spell shield blocks Wind Slash.", appliesTo: "target", tags: ["spell-shield"], source: "riven-wind-slash" },
      ],
      details: [
        "The bonuses start 0.5 seconds into the cast, and the bonus AD is fixed when she casts it.",
        "Blade of the Exile and Wind Slash each have a 0.25-second cast time.",
        "Wind Slash: 100 to 200 (+55% bonus AD) physical damage by rank, rising by 2.667% for each 1% of health the target is missing, to 300 to 600 (+165% bonus AD) at 75% missing or more.",
        "Its three missiles fan out over 18° and travel 1,100 units; each enemy is hit by one at most. It flies towards where her cursor was as the cast began.",
        "A hit while Riven is hidden briefly reveals the area around her to enemies.",
      ],
    },
  },
};

export default notes;
