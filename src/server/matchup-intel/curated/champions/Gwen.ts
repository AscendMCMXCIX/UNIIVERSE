import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Re-checked against Riot's own sources on 23 Nov 2026 (OD6; riotRecheck): Data Dragon 16.23.1 against
  16.22.1 (every ability's cooldown, cost, ranks, range, description and tooltip, the passive and the
  base stats) and Riot's patch notes for 26.23 (the champions, and the items and runes the notes
  name): no change on Summoner's Rift. The wiki's pages were not read again (its Terms of Use forbid
  automated use without consent), so what rests on them is as checked on 17 Nov.
  Gwen: curated champion notes (Layer 1), checked on 17 Nov 2026 against patch 26.22 and Data
  Dragon 16.22.1.

  Sources: the League of Legends Wiki's ability data pages (Template:Data Gwen/<ability>, read at the
  revisions below, CC BY-SA 3.0) and Data Dragon 16.22.1. Each ability's ddragonCooldown and
  ddragonIdentity are Data Dragon's cooldown array, spell id, name, ranks and charges, copied exactly
  (the passive has no cooldown, id or rank in Data Dragon; its 1 rank is the app's placeholder); the
  wiki's cooldown for every ability matches.
  The abilities' cooldowns are Data Dragon's and the pages' base values per rank, with no ability
  haste applied; the other numbers are as the pages give them: by rank, by level where a text says
  "rising with level", or fixed. Every text is UNIIVERSE's own summary of what the page states.
  Badges read from a page's fields use the meanings Template:Ability data gives them: grounded
  (grounding disables it) and knockdown (an enemy knock-down or displacement interrupts and
  overrides its movement).

  Cooldown starts, from the page's cooldown-start field (cdstart), and null where it gives none:
  - W: "after-effect-ends" (post-effect).
  - R: "on-cast", as the field says. For an ability cast again, the page does not say whether the
    cooldown runs from the first cast or the last, so the page shows no start (the owner, 17 Nov 2026: what the wiki does not say is not used).
  - Q, E: null: no cdstart.
  - P: no cooldown spec: the page's cooldown field is empty and Data Dragon has none for passives,
    so the page says it is not in Riot's data rather than "none".
  Modifiers, as the pages state them: E refunds 25 / 35 / 45 / 55 / 65% of its cooldown on her first
  basic attack within its 4 seconds, and resets her attack timer; R has a 1-second static cooldown
  between casts.

  Disputed, so left off the page until a person resolves it:
  - Needlework's recast window: the wiki says twice more within 8 seconds of the activation, each
    cast refreshing it; Riot's tooltip says up to 2 more times within 6 seconds. Both say two more
    casts, which the recast gives.

  Left out, and why:
  - a recast count for Hallowed Mist: the page says it can be recast after 0.5 s but not how many
    times, so it is described in the details, not as a Recast;
  - which effect's end starts Hallowed Mist's cooldown: its cooldown-start field says post-effect
    and names no effect, so the mist's 4 s is a detail, not a cooldown note;
  - totals added up from the pages' counts (Q's snips with every stack, R's needles over its three
    casts): the docs leave sums out;
  - level notes: no saved page states an unlock or a level for Gwen's abilities (her passive's heal
    cap and minion damage only scale smoothly with level).
*/

const notes: ChampionNotes = {
  championId: "Gwen",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17", riotRecheck: { patch: "26.23", ddragonVersion: "16.23.1", on: "2026-11-23" } },
  sources: [
    { id: "gwen-p", title: "League of Legends Wiki: A Thousand Cuts (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/A_Thousand_Cuts", kind: "wiki-ability", revision: 4081720, revisionTime: "2026-10-09T12:23:52Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-q", title: "League of Legends Wiki: Snip Snip! (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Snip_Snip!", kind: "wiki-ability", revision: 4026398, revisionTime: "2026-06-09T21:51:08Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-w", title: "League of Legends Wiki: Hallowed Mist (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Hallowed_Mist", kind: "wiki-ability", revision: 3973613, revisionTime: "2025-12-11T11:22:05Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-e", title: "League of Legends Wiki: Skip 'n Slash (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Skip_'n_Slash", kind: "wiki-ability", revision: 4026400, revisionTime: "2026-06-09T21:51:27Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-r", title: "League of Legends Wiki: Needlework (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Needlework", kind: "wiki-ability", revision: 4085130, revisionTime: "2026-10-14T00:57:19Z", licence: "CC BY-SA 3.0" },
    { id: "ability-data", title: "League of Legends Wiki: Template:Ability data (what each field means)", url: "https://wiki.leagueoflegends.com/en-us/Template:Ability_data", kind: "wiki-reference", revision: 4084623, revisionTime: "2026-10-13T17:49:21Z", licence: "CC BY-SA 3.0" },
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
      cooldown: { kind: "per-rank", seconds: [6.5, 5.75, 5, 4.25, 3.5], starts: null },
      facts: [
        { kind: "damage", label: "True damage centre", detail: "Half the damage at the centre of each snip is true damage, and the centre applies her passive.", appliesTo: "target", tags: ["true-damage"], source: "gwen-q" },
        { kind: "exception", label: "Stacks add snips", detail: "Each attack that lands gives a stack for 6 s (up to 4), and each stack adds a snip to her next Q.", appliesTo: "self", source: "gwen-q" },
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
      cooldown: { kind: "per-rank", seconds: [22, 21, 20, 19, 18], starts: "after-effect-ends" },
      facts: [
        { kind: "defence", label: "Untargetable from outside", detail: "While she is inside the mist, enemies outside it cannot target her; turrets and monsters still can.", appliesTo: "self", tags: ["untargetable"], source: "gwen-w" },
        { kind: "defence", label: "Armour and magic resistance", detail: "Inside the mist she gains 22–30 (by rank, +7% AP) bonus armour and magic resistance.", appliesTo: "self", source: "gwen-w" },
        { kind: "interaction", label: "Stops targeted shots", detail: "Projectiles that enemy champions outside the mist target at her are destroyed when they attempt to pass through the mist or are inside it.", appliesTo: "self", source: "gwen-w" },
      ],
      details: [
        "The mist lasts 4 s.",
        "She is ghosted while inside the mist.",
        "From 0.5 s she can recast it to move the mist to her; it also moves on its own if she tries to leave, following a dash to its end.",
        "Targeted projectiles from minions and monsters still land, and monsters outside the mist can attack her but deal no damage.",
        "Enemy pets outside the mist cannot target her even if their owner is inside; pets inside can, even if their owner is outside.",
      ],
    },
    E: {
      ddragonCooldown: [13, 12.5, 12, 11.5, 11],
      ddragonIdentity: { id: "GwenE", name: "Skip 'n Slash", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [13, 12.5, 12, 11.5, 11], starts: null },
      modifiers: { refund: { unit: "percent", amount: [25, 35, 45, 55, 65], when: "her first basic attack within the 4 seconds after the dash" }, resetsAttack: true },
      facts: [
        { kind: "mobility", label: "Dash", detail: "Dashes to the target spot: 350 units, or up to 450 across terrain.", appliesTo: "self", tags: ["dash"], source: "gwen-e" },
        { kind: "exception", label: "Cast during other abilities", detail: "She can cast it during any of her other abilities, and them during it.", appliesTo: "self", source: "gwen-e" },
        { kind: "interaction", label: "Interruptible dash", detail: "Grounding disables it, and an enemy knock-down or displacement interrupts and overrides the dash.", appliesTo: "self", tags: ["ground", "interrupt"], source: "gwen-e" },
      ],
      details: [
        "For 4 s after the dash her attacks gain 30–80% attack speed (by rank), 75 range and 15 (+20% AP) magic damage on-hit.",
        "The dash has no minimum distance.",
      ],
    },
    R: {
      ddragonCooldown: [120, 100, 80],
      ddragonIdentity: { id: "GwenR", name: "Needlework", maxRank: 3, charges: null },
      cooldown: { kind: "per-rank", seconds: [120, 100, 80], starts: "on-cast" },
      modifiers: { lockout: { seconds: 1, static: true } },
      // Two more casts, as both the wiki and Riot's tooltip say; their window is disputed (see the header).
      recast: { count: 2, note: "The recasts cost nothing more and throw 3 needles, then 5." },
      facts: [
        { kind: "crowd-control", label: "Slow", detail: "The first needle to hit a target slows it 40–60% for 1.5 s; each later hit slows it 15–25% (by rank).", appliesTo: "target", tags: ["slow"], source: "gwen-r" },
        { kind: "damage", label: "Passive on every needle", detail: "Each needle applies her passive's maximum-health damage.", appliesTo: "target", tags: ["max-health-damage"], source: "gwen-r" },
        { kind: "exception", label: "Cast on the move", detail: "She can move while casting it.", appliesTo: "self", source: "gwen-r" },
        { kind: "interaction", label: "Spell shield: one needle", detail: "A spell shield stops one needle, not the rest.", appliesTo: "target", tags: ["spell-shield"], source: "gwen-r" },
      ],
      details: [
        "The needles start 100 units behind her and fly 1,350 units.",
        "If she dies during a cast, that cast's remaining needles are not thrown.",
      ],
    },
  },
};

export default notes;
