import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Ornn: curated champion notes (Layer 1), checked on 16 Nov 2026 against patch 26.22.

  Sources: the League of Legends Wiki's ability data pages (Template:Data Ornn/<ability>, read at the
  revisions below, CC BY-SA 3.0) and Data Dragon 16.22.1. Each ddragonCooldown is that spell's
  "cooldown" array copied exactly (the passive's is []); the wiki's cooldown for every ability
  matches it. Numbers are base values per rank, without ability haste. Every text is UNIIVERSE's
  own summary of what the page states.

  Left out for want of a stated source:
  - a recast window in seconds for Call of the Forge God: the page says the recast is available
    while the elemental is active, with no number;
  - a cooldown for Brittle or Master Craftsman: the page gives the passive only one timer, the
    forge's (below);
  - the levels at which the ultimate gains ranks: no saved page states them.
*/

const notes: ChampionNotes = {
  championId: "Ornn",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "ornn-p", title: "League of Legends Wiki: Living Forge (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Living_Forge", kind: "wiki-ability", revision: 4089066, revisionTime: "2026-10-22T20:31:26Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-q", title: "League of Legends Wiki: Volcanic Rupture (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Volcanic_Rupture", kind: "wiki-ability", revision: 3998234, revisionTime: "2026-03-10T20:08:53Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-w", title: "League of Legends Wiki: Bellows Breath (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Bellows_Breath", kind: "wiki-ability", revision: 4011962, revisionTime: "2026-04-24T08:40:56Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-e", title: "League of Legends Wiki: Searing Charge (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Searing_Charge", kind: "wiki-ability", revision: 4007982, revisionTime: "2026-04-13T02:25:31Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-r", title: "League of Legends Wiki: Call of the Forge God (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Call_of_the_Forge_God", kind: "wiki-ability", revision: 4007985, revisionTime: "2026-04-13T02:32:34Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Ornn", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Ornn.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "Living Forge", maxRank: 1, charges: null },
      // The page's only cooldown on the passive: the "Forge Disable Time", 4 s counted from the start of a
      // forge channel and unaffected by ability haste. It belongs to the forge, not to Brittle.
      cooldown: { kind: "passive", seconds: [4], scalesWith: "none" },
      cooldownNote: "The forge only: once a forge channel starts, he cannot forge again for 4 s, and ability haste does not shorten it.",
      facts: [
        { kind: "interaction", label: "Brittle", detail: "Enemies hit by his W or R turn Brittle, which makes crowd control on them last longer (knock-ups excepted). The first immobilise or silence from him or an ally spends it and lasts 30% longer.", appliesTo: "target", source: "ornn-p" },
        // The page's formula is 9 + (17 - 9) / 17 × (level - 1), so 9% at level 1 and 17% at level 18.
        { kind: "damage", label: "% max health", detail: "Spending Brittle deals magic damage of 9% (at his level 1) to 17% (at level 18) of the target's maximum health.", appliesTo: "target", tags: ["max-health-damage"], source: "ornn-p" },
        { kind: "crowd-control", label: "Knock-back", detail: "His attacks knock a Brittle target back a short way and end Brittle, without the bonus damage.", appliesTo: "target", tags: ["knock-back"], source: "ornn-p" },
        { kind: "defence", label: "Bonus stats +10–30%", detail: "His bonus armour, magic resistance and health from all sources are raised by 10%, and by 4% more per Masterwork upgrade (30% after 5).", appliesTo: "self", source: "ornn-p" },
        { kind: "exception", label: "Buys anywhere", detail: "He can buy any non-consumable item anywhere through a 4 s channel, which damage from enemy champions or turrets interrupts.", appliesTo: "self", tags: ["interrupt"], source: "ornn-p" },
      ],
      details: [
        "Brittle does not lengthen knock-ups, but his E and R stun as they knock up, so their stuns are lengthened.",
        "Slows, blinds, cripples, disarms and grounds also last longer on a Brittle target, without spending it.",
        // The page's spell-shield note also names "bonus damage" for this attack, but its own note above says
        // the attack does not deal Brittle's bonus damage (except to epic monsters), so only the knock-back is kept.
        "A spell shield blocks the knock-back of his attack on a Brittle target.",
      ],
    },
    Q: {
      ddragonCooldown: [9, 8.5, 8, 7.5, 7],
      ddragonIdentity: { id: "OrnnQ", name: "Volcanic Rupture", maxRank: 5, charges: null },
      // "on-cast": the wiki gives no special start (the page has no cdstart field).
      cooldown: { kind: "per-rank", seconds: [9, 8.5, 8, 7.5, 7], starts: "on-cast" },
      facts: [
        { kind: "crowd-control", label: "Slow", detail: "The fissure slows enemies it hits by 40% for 2 s.", appliesTo: "target", tags: ["slow"], source: "ornn-q" },
        { kind: "crowd-control", label: "Knock-aside", detail: "1.125 s later a pillar erupts where the fissure stopped and knocks enemies aside.", appliesTo: "target", tags: ["knock-back"], source: "ornn-q" },
        { kind: "exception", label: "Makes terrain", detail: "The pillar stands as impassable terrain for 4 s, and does not expire while his E is dashing.", appliesTo: "area", source: "ornn-q" },
      ],
      details: [
        "The fissure travels 750 units, or stops 200 units past the first champion it hits, still damaging others on the way.",
        "A spell shield does not stop the pillar's knock-aside.",
        "Aimed into a wall, the pillar tries to rise on the far side and breaks if it cannot.",
      ],
    },
    W: {
      ddragonCooldown: [12, 11.5, 11, 10.5, 10],
      ddragonIdentity: { id: "OrnnW", name: "Bellows Breath", maxRank: 5, charges: null },
      // "on-cast": the wiki gives no special start (the page has no cdstart field).
      cooldown: { kind: "per-rank", seconds: [12, 11.5, 11, 10.5, 10], starts: "on-cast" },
      facts: [
        { kind: "defence", label: "Displacement immune", detail: "For the 0.75 s march he is immune to displacement, and crowd control does not stop the march.", appliesTo: "self", tags: ["displacement-immune"], source: "ornn-w" },
        // The 80–280 floor is the page's "Total Minimum" (80/5–280/5 per hit), so it holds only when every hit lands.
        { kind: "damage", label: "% max health", detail: "The flames hit every 0.15 s; all of them together deal magic damage of 12–16% (by rank) of the target's maximum health, at least 80–280.", appliesTo: "target", tags: ["max-health-damage"], source: "ornn-w" },
        { kind: "interaction", label: "Applies Brittle", detail: "The final burst, 560 units long against 500 for the others, makes the enemies it hits Brittle for 3 s.", appliesTo: "target", source: "ornn-w" },
        // The page's interaction table has attack, cast and items false; its summoner-spell column cannot be read
        // without the table's template (not saved), so the text says no more than those three.
        { kind: "exception", label: "Locked while marching", detail: "During the march he cannot attack, use items or cast his other abilities.", appliesTo: "self", source: "ornn-w" },
      ],
      details: [
        "He lunges as far as 35% of his total movement speed, taken when he casts it, would carry him in 0.75 s; at an estimated 190 movement speed or less he does not lunge at all.",
        "A spell shield cancels the final burst's damage, and the target does not turn Brittle.",
      ],
    },
    E: {
      ddragonCooldown: [14, 13.5, 13, 12.5, 12],
      ddragonIdentity: { id: "OrnnE", name: "Searing Charge", maxRank: 5, charges: null },
      // "on-cast": the wiki gives no special start (the page has no cdstart field).
      cooldown: { kind: "per-rank", seconds: [14, 13.5, 13, 12.5, 12], starts: "on-cast" },
      facts: [
        { kind: "mobility", label: "Dash", detail: "Charges up to 650 units, damaging enemies in his path and stopping at terrain.", appliesTo: "self", tags: ["dash"], source: "ornn-e" },
        { kind: "crowd-control", label: "Knock-up and stun", detail: "Ramming terrain sets off a shockwave at the point of impact that knocks up and stuns enemies for 1.25 s (1.625 s on a Brittle target with no tenacity).", appliesTo: "target", tags: ["knock-up", "stun"], source: "ornn-e" },
        { kind: "interaction", label: "Needs terrain", detail: "Walls, his Q pillar (which the shockwave breaks) and terrain made by enemy champions (partly broken) all trigger it.", appliesTo: "self", source: "ornn-e" },
        { kind: "exception", label: "Locked after the dash", detail: "He cannot act for 0.5 s after the dash ends.", appliesTo: "self", source: "ornn-e" },
      ],
      details: [
        "The shockwave (360 radius) also damages enemies the charge did not hit.",
        "Displacement immunity resists the stun as well as the knock-up.",
        "He does not dash if he is airborne when the 0.35 s cast ends.",
      ],
    },
    R: {
      ddragonCooldown: [140, 120, 100],
      ddragonIdentity: { id: "OrnnR", name: "Call of the Forge God", maxRank: 3, charges: null },
      // "after-effect-ends": the wiki's cdstart field says post-effect.
      cooldown: { kind: "per-rank", seconds: [140, 120, 100], starts: "after-effect-ends" },
      // One recast: the page speaks of "both casts". No window in seconds is stated (see the header).
      recast: { count: 1, note: "From 1.25 s after he starts the first cast, while the elemental is still out: he dashes 300 units, and if he meets the elemental it stampedes the way he dashed." },
      facts: [
        { kind: "crowd-control", label: "Slow", detail: "On its first pass, towards Ornn, the elemental slows enemies 40–60% (by rank) for 2 s.", appliesTo: "target", tags: ["slow"], source: "ornn-r" },
        { kind: "crowd-control", label: "Knock-up and stun", detail: "If his recast dash meets the elemental, its second pass knocks up and stuns: 1 s for the first champion it hits (1.3 s on a Brittle target with no tenacity), 0.5 s for any after.", appliesTo: "target", tags: ["knock-up", "stun"], source: "ornn-r" },
        { kind: "mobility", label: "Dash", detail: "The recast is a 300-unit dash that cannot cross terrain.", appliesTo: "self", tags: ["dash"], source: "ornn-r" },
        { kind: "interaction", label: "Applies Brittle", detail: "Both passes make the enemies they hit Brittle for 3 s; neither pass hits the same enemy twice.", appliesTo: "target", source: "ornn-r" },
        { kind: "interaction", label: "Root or ground stops recast", detail: "He cannot recast while rooted or grounded.", appliesTo: "self", tags: ["root", "ground"], source: "ornn-r" },
      ],
      details: [
        "The elemental appears 3000 units away and speeds up as it runs back to where he cast.",
        "He cannot act during the recast dash or for 0.5 s after it.",
        "A spell shield stops one of the two passes, not both.",
        "The elemental reveals the area along its path.",
      ],
    },
  },
  levelNotes: [
    { level: 13, text: "Master Craftsman: his first eligible Legendary item becomes a Masterwork item on its own, and his passive's stat bonus goes from 10% to 14%.", source: "ornn-p" },
    { level: 14, text: "At each level from 14 to 17 he can upgrade one ally's Legendary item, once per ally, with a forge channel within 600 range.", source: "ornn-p" },
  ],
};

export default notes;
