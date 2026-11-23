import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Re-checked against Riot's own sources on 23 Nov 2026 (OD6; riotRecheck): Data Dragon 16.23.1 against
  16.22.1 (every ability's cooldown, cost, ranks, range, description and tooltip, the passive and the
  base stats) and Riot's patch notes for 26.23 (the champions, and the items and runes the notes
  name): no change on Summoner's Rift. The wiki's pages were not read again (its Terms of Use forbid
  automated use without consent), so what rests on them is as checked on 17 Nov.
  Renekton: curated champion notes (Layer 1), checked on 17 Nov 2026 against patch 26.22 and Data
  Dragon 16.22.1.

  Sources: the League of Legends Wiki's ability data pages (Template:Data Renekton/<ability>, read at
  the revisions below, CC BY-SA 3.0) and Data Dragon 16.22.1. Each ability's ddragonCooldown and
  ddragonIdentity are Data Dragon's cooldown array, spell id, name, ranks and charges, copied exactly
  (the passive has no cooldown, id or rank in Data Dragon; its 1 rank is the app's placeholder); the
  wiki's cooldown for every ability matches. Cooldowns are per rank, as Data Dragon lists them. Every
  text is UNIIVERSE's own summary of what the page states. Badges read from a page's fields use the
  meanings Template:Ability data gives them: spellshield (a spell shield nullifies it), parry (blind,
  block or dodge prevents it), grounded (grounding disables it) and knockdown (an enemy knock-down or
  displacement interrupts and overrides its movement).

  Cooldown starts, from the page's cooldown-start field (cdstart), and null where it gives none:
  - W: "after-effect-ends" (post-effect).
  - E: "on-cast", as the field says. For an ability cast again (Slice, then Dice), the page does not
    say whether the cooldown runs from the first cast or the last, so the page shows no start
    (the owner, 17 Nov 2026: what the wiki does not say is not used).
  - R: "on-cast".
  - Q: null: no cdstart.
  - P: no cooldown spec: the page gives none, and Data Dragon 16.22.1 gives no passive a cooldown.
  Modifiers: W resets his basic-attack timer, as its page says.

  Left out, and why:
  - level notes: no saved page states a level rule for Renekton;
  - Ruthless Predator's 0.2-second attack cast time: the page marks it as estimated;
  - an exact figure for the lockout after Ruthless Predator's attack: the page gives 0.525 seconds
    rounded up to the next game tick (shown as 0.528 on the champion page), so the text says "just
    over half a second";
  - "per cast" for Cull the Meek's healing cap: the page says "up to a cap", not per what;
  - whether the 50-Fury Dice gives Fury: Slice and Dice's page says both casts do, and Reign of
    Anger's says empowered abilities give none.
*/

const notes: ChampionNotes = {
  championId: "Renekton",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17", riotRecheck: { patch: "26.23", ddragonVersion: "16.23.1", on: "2026-11-23" } },
  sources: [
    { id: "renekton-p", title: "League of Legends Wiki: Reign of Anger (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Reign_of_Anger", kind: "wiki-ability", revision: 3961774, revisionTime: "2025-10-29T04:36:45Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-q", title: "League of Legends Wiki: Cull the Meek (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Cull_the_Meek", kind: "wiki-ability", revision: 4008014, revisionTime: "2026-04-13T03:35:33Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-w", title: "League of Legends Wiki: Ruthless Predator (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Ruthless_Predator", kind: "wiki-ability", revision: 4065616, revisionTime: "2026-09-23T19:37:45Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-e", title: "League of Legends Wiki: Slice and Dice (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Slice_and_Dice", kind: "wiki-ability", revision: 3943397, revisionTime: "2025-08-08T18:04:56Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-r", title: "League of Legends Wiki: Dominus (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Dominus", kind: "wiki-ability", revision: 3963895, revisionTime: "2025-11-07T10:15:32Z", licence: "CC BY-SA 3.0" },
    { id: "ability-data", title: "League of Legends Wiki: Template:Ability data (what each field means)", url: "https://wiki.leagueoflegends.com/en-us/Template:Ability_data", kind: "wiki-reference", revision: 4084623, revisionTime: "2026-10-13T17:49:21Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Renekton", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Renekton.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "Reign of Anger", maxRank: 1, charges: null },
      facts: [
        { kind: "empowerment", label: "Empowered at 50 Fury", detail: "At 50 Fury or more, his next Q, W or Dice (not Slice) spends 50 Fury for a stronger version, which generates no Fury.", appliesTo: "self", source: "renekton-p" },
        { kind: "exception", label: "More Fury below half health", detail: "Below 50% of his maximum health he gains 50% more Fury from every source.", appliesTo: "self", source: "renekton-p" },
        { kind: "exception", label: "Fury fades out of combat", detail: "After 12 seconds out of combat without attacking, he loses 1 Fury every 0.25 seconds. While Dominus lasts, the 12 seconds keep restarting.", appliesTo: "self", source: "renekton-p" },
      ],
      details: [
        "Basic attacks give 5 Fury on hit against enemies other than structures; his abilities also give Fury (see each).",
        "Entering combat or attacking stops the loss and restarts the 12 seconds.",
      ],
    },
    Q: {
      ddragonCooldown: [7, 7, 7, 7, 7],
      ddragonIdentity: { id: "RenektonCleave", name: "Cull the Meek", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [7, 7, 7, 7, 7], starts: null },
      facts: [
        { kind: "sustain", label: "Heals per enemy hit", detail: "More per champion than per other unit, up to a cap of 50 to 150 (by rank). With 50 Fury the healing triples and the cap is 200 to 600.", appliesTo: "self", tags: ["heal"], source: "renekton-q" },
        { kind: "interaction", label: "Wounds apply after the cap", detail: "Healing modifiers such as Grievous Wounds and Spirit Visage apply after the cap.", appliesTo: "self", tags: ["heal"], source: "renekton-q" },
      ],
      details: [
        "Hits nearby enemies: radius 400 units, 480 during Dominus.",
        "Healing per champion hit: 12 to 44 (+17% bonus AD); per other unit: 2 to 6 (+2% bonus AD).",
        "Gives 2.5 Fury per non-champion and 10 per champion hit, up to 30 a cast. With 50 Fury it deals more damage and gives no Fury.",
        "For 0.25 seconds after the cast he cannot attack or cast Slice and Dice or Dominus.",
      ],
    },
    W: {
      ddragonCooldown: [16, 14, 12, 10, 8],
      ddragonIdentity: { id: "RenektonPreExecute", name: "Ruthless Predator", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [16, 14, 12, 10, 8], starts: "after-effect-ends" },
      modifiers: { resetsAttack: true },
      facts: [
        { kind: "crowd-control", label: "Stun", detail: "0.75 seconds; 1.5 seconds with 50 Fury.", appliesTo: "target", tags: ["stun"], source: "renekton-w" },
        { kind: "interaction", label: "Breaks shields", detail: "With 50 Fury, the first strike destroys the target's damage shields before any damage, even when a spell shield blocks the attack. Monsters keep theirs.", appliesTo: "target", tags: ["shield-break"], source: "renekton-w" },
        { kind: "interaction", label: "Blockable", detail: "A spell shield blocks it, and blind, block or dodge stop it.", appliesTo: "target", tags: ["spell-shield"], source: "renekton-w" },
      ],
      details: [
        "His next attack within 7 seconds has 175 range and strikes twice, three times with 50 Fury. On-hit effects apply to each strike. Without the 50-Fury bonus, each strike gives Fury and hitting a champion gives 10 more; the 50-Fury version gives none.",
        "After the attack's cast time he cannot move or cast Q or E for just over half a second; casting Dominus ends this early.",
        "The empowerment is kept when the attack is cancelled because its target died or turned untargetable during the cast time.",
      ],
    },
    E: {
      ddragonCooldown: [16, 14.5, 13, 11.5, 10],
      ddragonIdentity: { id: "RenektonSliceAndDice", name: "Slice and Dice", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [16, 14.5, 13, 11.5, 10], starts: "on-cast" },
      recast: { count: 1, windowSeconds: 4, note: "Dice, the same dash and damage again, if Slice hits an enemy." },
      facts: [
        { kind: "mobility", label: "Dash", detail: "Slice dashes a fixed distance (range 450), damaging enemies in its path.", appliesTo: "self", tags: ["dash"], source: "renekton-e" },
        { kind: "damage", label: "Armour reduction", detail: "With 50 Fury, Dice deals bonus damage and reduces the armour of enemies hit by 25 to 35% (by rank) for 4 seconds.", appliesTo: "target", source: "renekton-e" },
        { kind: "interaction", label: "Interruptible dash", detail: "Grounding disables Slice and Dice, and an enemy knock-down or displacement interrupts and overrides its dash.", appliesTo: "self", tags: ["ground", "interrupt"], source: "renekton-e" },
      ],
      details: [
        "Dash speed: 760 plus his movement speed.",
        "Slice, and Dice without the 50-Fury bonus, give 2 Fury per non-champion and 10 per champion hit, up to 30 a cast.",
      ],
    },
    R: {
      ddragonCooldown: [120, 100, 80],
      ddragonIdentity: { id: "RenektonReignOfTheTyrant", name: "Dominus", maxRank: 3, charges: null },
      cooldown: { kind: "per-rank", seconds: [120, 100, 80], starts: "on-cast" },
      facts: [
        { kind: "defence", label: "Bonus health", detail: "300 to 700 (by rank) for 15 seconds. When it ends he keeps the health it gave, if he is not over his normal maximum.", appliesTo: "self", source: "renekton-r" },
        { kind: "interaction", label: "Unaffected by Grievous Wounds", detail: "Grievous Wounds and Spirit Visage do not affect the bonus health.", appliesTo: "self", source: "renekton-r" },
      ],
      details: [
        "For 15 seconds he deals magic damage to enemies within 375 units every 0.5 seconds: 30 to 120 per tick by rank, + 5% bonus AD + 5% AP. Spell shields do not block it.",
        "He gains 20 Fury, 20% size, 25 bonus attack range and a wider Cull the Meek, and generates 5 Fury a second up to 75.",
        "It has a 0.25-second cast time; dying during the cast animation does not refund the cooldown.",
      ],
    },
  },
};

export default notes;
