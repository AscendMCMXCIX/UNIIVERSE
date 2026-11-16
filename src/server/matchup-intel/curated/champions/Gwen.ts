import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Gwen: curated champion notes (Layer 1), checked on 16 Nov 2026 against patch 26.22.

  Sources: the League of Legends Wiki's ability data pages (Template:Data Gwen/<ability>, read at the
  revisions below, CC BY-SA 3.0) and Data Dragon 16.22.1. Each ddragonCooldown is that spell's
  "cooldown" array copied exactly (the passive's is []); the wiki's cooldown for every ability
  matches it. Numbers are base values per rank, without ability haste. Every text is UNIIVERSE's
  own summary of what the page states.

  Left out for want of a stated source:
  - the passive's cooldown: the wiki's cooldown field for A Thousand Cuts is empty and Data Dragon
    has none for passives, so the page says it is not in Riot's data rather than "none";
  - a recast count for Hallowed Mist: the current page says it can be recast (from 0.5 s) but not
    how many times, so it is described in the details, not as a Recast;
  - level notes: no saved page states an unlock or a level for Gwen's abilities (her passive's
    heal cap and minion damage only scale smoothly with level).
*/

const notes: ChampionNotes = {
  championId: "Gwen",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "gwen-p", title: "League of Legends Wiki: A Thousand Cuts (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/A_Thousand_Cuts", kind: "wiki-ability", revision: 4081720, revisionTime: "2026-10-09T12:23:52Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-q", title: "League of Legends Wiki: Snip Snip! (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Snip_Snip!", kind: "wiki-ability", revision: 4026398, revisionTime: "2026-06-09T21:51:08Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-w", title: "League of Legends Wiki: Hallowed Mist (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Hallowed_Mist", kind: "wiki-ability", revision: 3973613, revisionTime: "2025-12-11T11:22:05Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-e", title: "League of Legends Wiki: Skip 'n Slash (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Skip_'n_Slash", kind: "wiki-ability", revision: 4026400, revisionTime: "2026-06-09T21:51:27Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-r", title: "League of Legends Wiki: Needlework (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Needlework", kind: "wiki-ability", revision: 4085130, revisionTime: "2026-10-14T00:57:19Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Gwen", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Gwen.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "A Thousand Cuts", maxRank: 1, charges: null },
      // No cooldown spec: the wiki's cooldown field is empty and Data Dragon has none (see the header).
      facts: [
        { kind: "damage", label: "% max health", detail: "Her attacks, the centre of each Q snip and every R needle add magic damage of 1% (+0.6% per 100 AP) of the target's maximum health.", appliesTo: "target", tags: ["max-health-damage"], source: "gwen-p" },
        { kind: "sustain", label: "Heal", detail: "Against champions she heals for 67% of that damage after resistances, up to 12–40 (rising with level, +7% AP) per hit.", appliesTo: "self", tags: ["heal"], source: "gwen-p" },
      ],
      details: [
        "Against minions under 40% health it adds 8–30 magic damage (rising with level); against monsters it deals at most 3 (+5% AP).",
        "It does not apply to structures.",
      ],
    },
    Q: {
      ddragonCooldown: [6.5, 5.75, 5, 4.25, 3.5],
      ddragonIdentity: { id: "GwenQ", name: "Snip Snip!", maxRank: 5, charges: null },
      // "on-cast": the wiki gives no special start (the page has no cdstart field).
      cooldown: { kind: "per-rank", seconds: [6.5, 5.75, 5, 4.25, 3.5], starts: "on-cast" },
      facts: [
        { kind: "damage", label: "True damage centre", detail: "Half the damage at the centre of each snip is true damage, and the centre applies her passive.", appliesTo: "target", tags: ["true-damage"], source: "gwen-q" },
        { kind: "exception", label: "Up to 6 snips", detail: "Each attack that lands gives a stack for 6 s (up to 4), and each stack adds a snip to her next Q.", appliesTo: "self", source: "gwen-q" },
        { kind: "interaction", label: "Spell shield: one snip", detail: "A spell shield stops one snip, not the rest.", appliesTo: "target", tags: ["spell-shield"], source: "gwen-q" },
      ],
      details: [
        "She snips at least twice in a cone in the direction she aims, over a 0.5 s cast; the last snip deals more damage.",
        "It deals 80% damage to minions and kills those under 20% health with its first hit.",
      ],
    },
    W: {
      ddragonCooldown: [22, 21, 20, 19, 18],
      ddragonIdentity: { id: "GwenW", name: "Hallowed Mist", maxRank: 5, charges: null },
      // "after-effect-ends": the wiki's cdstart field says post-effect.
      cooldown: { kind: "per-rank", seconds: [22, 21, 20, 19, 18], starts: "after-effect-ends" },
      cooldownNote: "Counts from when the mist ends; the mist lasts 4 s.",
      facts: [
        { kind: "defence", label: "Untargetable from outside", detail: "While she is inside the mist, enemies outside it cannot target her; turrets and monsters still can.", appliesTo: "self", tags: ["untargetable"], source: "gwen-w" },
        { kind: "defence", label: "Armour and magic resistance", detail: "Inside the mist she gains 22–30 (by rank, +7% AP) bonus armour and magic resistance.", appliesTo: "self", source: "gwen-w" },
        { kind: "interaction", label: "Stops targeted shots", detail: "Enemy champions' targeted projectiles fired from outside the mist are destroyed on reaching it.", appliesTo: "self", source: "gwen-w" },
      ],
      details: [
        "She is ghosted while inside the mist.",
        "From 0.5 s she can recast it to move the mist to her; it also moves on its own if she tries to leave, following a dash to its end.",
        "Targeted projectiles from minions and monsters still land, and monsters outside the mist can attack her but deal no damage.",
        "Enemy pets outside the mist cannot target her even if their owner is inside; pets inside can, even if their owner is outside.",
      ],
    },
    E: {
      ddragonCooldown: [13, 12.5, 12, 11.5, 11],
      ddragonIdentity: { id: "GwenE", name: "Skip 'n Slash", maxRank: 5, charges: null },
      // "on-cast": the wiki gives no special start (the page has no cdstart field).
      cooldown: { kind: "per-rank", seconds: [13, 12.5, 12, 11.5, 11], starts: "on-cast" },
      cooldownNote: "Her first attack within the next 4 s refunds 25–65% of it (by rank).",
      facts: [
        { kind: "mobility", label: "Dash", detail: "Dashes to the target spot: 350 units, or up to 450 across terrain.", appliesTo: "self", tags: ["dash"], source: "gwen-e" },
        { kind: "exception", label: "Attack reset", detail: "Resets her attack timer, and she can cast it during her other abilities, and them during it.", appliesTo: "self", tags: ["attack-reset"], source: "gwen-e" },
      ],
      details: [
        "For 4 s after the dash her attacks gain 30–80% attack speed (by rank), 75 range and 15 (+20% AP) magic damage on-hit.",
        "The dash has no minimum distance.",
      ],
    },
    R: {
      ddragonCooldown: [120, 100, 80],
      ddragonIdentity: { id: "GwenR", name: "Needlework", maxRank: 3, charges: null },
      // "on-cast": the wiki's cdstart field says on-cast.
      cooldown: { kind: "per-rank", seconds: [120, 100, 80], starts: "on-cast" },
      cooldownNote: "The casts are 1 s apart at least, a static cooldown that ability haste does not shorten.",
      recast: { count: 2, windowSeconds: 8, note: "The free recasts throw 3, then 5 needles; each cast restarts the 8 s window." },
      facts: [
        { kind: "crowd-control", label: "Slow", detail: "The first needle to hit a target slows it 40–60% for 1.5 s; each later hit slows it 15–25% (by rank).", appliesTo: "target", tags: ["slow"], source: "gwen-r" },
        { kind: "damage", label: "Passive on every needle", detail: "Each needle applies her passive's maximum-health damage, up to 9 needles over the three casts.", appliesTo: "target", tags: ["max-health-damage"], source: "gwen-r" },
        { kind: "exception", label: "Cast on the move", detail: "She can move while casting it.", appliesTo: "self", source: "gwen-r" },
        { kind: "interaction", label: "Spell shield: one needle", detail: "A spell shield stops one needle, not the rest.", appliesTo: "target", tags: ["spell-shield"], source: "gwen-r" },
      ],
      details: [
        "The needles start 100 units behind her and fly 1350 units.",
        "If she dies during a cast, that cast's remaining needles are not thrown.",
      ],
    },
  },
};

export default notes;
