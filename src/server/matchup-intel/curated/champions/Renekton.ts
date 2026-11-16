import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Renekton: curated champion notes (Layer 1), checked on patch 26.22 against Data Dragon 16.22.1.

  Sources: the League of Legends Wiki's ability data templates at the revisions below (CC BY-SA 3.0)
  and Data Dragon 16.22.1 for the cooldown arrays. Every text is UNIIVERSE's own summary.

  Cooldown starts:
  - W: "after-effect-ends", from the wiki's cooldown-start field ("post-effect").
  - E, R: "on-cast", from the wiki's cooldown-start field.
  - Q: "on-cast" as the ordinary case: the wiki gives no special start.
  - P: no cooldown recorded. The wiki gives none for Reign of Anger and Data Dragon never does.
  No level notes: the saved sources state no level rule for Renekton.
*/

const notes: ChampionNotes = {
  championId: "Renekton",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "renekton-p", title: "League of Legends Wiki: Reign of Anger (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Reign_of_Anger", kind: "wiki-ability", revision: 3961774, revisionTime: "2025-10-29T04:36:45Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-q", title: "League of Legends Wiki: Cull the Meek (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Cull_the_Meek", kind: "wiki-ability", revision: 4008014, revisionTime: "2026-04-13T03:35:33Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-w", title: "League of Legends Wiki: Ruthless Predator (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Ruthless_Predator", kind: "wiki-ability", revision: 4065616, revisionTime: "2026-09-23T19:37:45Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-e", title: "League of Legends Wiki: Slice and Dice (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Slice_and_Dice", kind: "wiki-ability", revision: 3943397, revisionTime: "2025-08-08T18:04:56Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-r", title: "League of Legends Wiki: Dominus (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Dominus", kind: "wiki-ability", revision: 3963895, revisionTime: "2025-11-07T10:15:32Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Renekton", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Renekton.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "Reign of Anger", maxRank: 1, charges: null },
      facts: [
        { kind: "exception", label: "Empowered at 50 Fury", detail: "At 50 Fury or more, his next Q, W or Dice (never Slice) spends 50 Fury for a stronger version, which generates no Fury.", appliesTo: "self", source: "renekton-p" },
        { kind: "exception", label: "More Fury below half health", detail: "Below 50% of his maximum health he gains 50% more Fury from every source.", appliesTo: "self", source: "renekton-p" },
        { kind: "exception", label: "Fury fades out of combat", detail: "After 12 seconds out of combat without attacking, he loses 1 Fury every 0.25 seconds. Dominus stops the loss while it lasts.", appliesTo: "self", source: "renekton-p" },
      ],
      details: [
        "Each basic attack gives 5 Fury on hit, against anything but structures; his abilities also give Fury (see each).",
        "Entering combat or attacking stops the loss and restarts the 12 seconds.",
      ],
    },
    Q: {
      ddragonCooldown: [7, 7, 7, 7, 7],
      ddragonIdentity: { id: "RenektonCleave", name: "Cull the Meek", maxRank: 5, charges: null },
      // The wiki gives no cooldown start: on-cast, the ordinary case.
      cooldown: { kind: "per-rank", seconds: [7, 7, 7, 7, 7], starts: "on-cast" },
      facts: [
        { kind: "sustain", label: "Heals per enemy hit", detail: "More per champion than per other unit, capped at 50 to 150 a cast. With 50 Fury the healing triples and the cap is 200 to 600.", appliesTo: "self", tags: ["heal"], source: "renekton-q" },
        { kind: "interaction", label: "Wounds apply after the cap", detail: "Grievous Wounds, and boosts such as Spirit Visage, change the healing after the cap.", appliesTo: "self", tags: ["heal"], source: "renekton-q" },
      ],
      details: [
        "Hits all enemies around him: 400 units, 480 during Dominus.",
        "Healing per champion hit: 12 to 44 (+17% bonus AD); per other unit: 2 to 6 (+2% bonus AD).",
        "Gives 2.5 Fury per non-champion and 10 per champion hit, up to 30 a cast. With 50 Fury it also deals more damage.",
        "For 0.25 seconds after the cast he cannot attack or cast Slice and Dice or Dominus.",
      ],
    },
    W: {
      ddragonCooldown: [16, 14, 12, 10, 8],
      ddragonIdentity: { id: "RenektonPreExecute", name: "Ruthless Predator", maxRank: 5, charges: null },
      // Wiki cooldown-start field: post-effect.
      cooldown: { kind: "per-rank", seconds: [16, 14, 12, 10, 8], starts: "after-effect-ends" },
      cooldownNote: "Starts when the effect ends, not on pressing W: the empowered attack is held for up to 7 seconds.",
      facts: [
        { kind: "crowd-control", label: "Stun", detail: "0.75 seconds; 1.5 seconds with 50 Fury.", appliesTo: "target", tags: ["stun"], source: "renekton-w" },
        { kind: "interaction", label: "Breaks shields", detail: "With 50 Fury, the first strike destroys the target's damage shields before any damage, even when a spell shield blocks the attack. Monsters keep theirs.", appliesTo: "target", tags: ["shield-break"], source: "renekton-w" },
        { kind: "interaction", label: "Blockable", detail: "A spell shield blocks it, and blind, block or dodge stop it.", appliesTo: "target", tags: ["spell-shield"], source: "renekton-w" },
      ],
      details: [
        "His next attack within 7 seconds has 175 range and strikes twice, three times with 50 Fury. Each strike applies on-hit effects and gives Fury; hitting a champion gives 10 more.",
        "It resets his attack timer. After the attack's cast time he cannot move or cast Q or E for just over half a second; casting Dominus ends this early.",
        "The empowerment is kept when the attack is cancelled because its target died or turned untargetable during the cast time.",
      ],
    },
    E: {
      ddragonCooldown: [16, 14.5, 13, 11.5, 10],
      ddragonIdentity: { id: "RenektonSliceAndDice", name: "Slice and Dice", maxRank: 5, charges: null },
      // Wiki cooldown-start field: on-cast.
      cooldown: { kind: "per-rank", seconds: [16, 14.5, 13, 11.5, 10], starts: "on-cast" },
      cooldownNote: "Starts when Slice is cast.",
      recast: { count: 1, windowSeconds: 4, note: "Dice, only after Slice hits an enemy: the same dash and damage again." },
      facts: [
        { kind: "mobility", label: "Dash", detail: "Slice dashes a fixed distance (range 450), damaging enemies in its path.", appliesTo: "self", tags: ["dash"], source: "renekton-e" },
        { kind: "damage", label: "Armour reduction", detail: "With 50 Fury, Dice deals bonus damage and reduces the armour of enemies hit by 25 to 35% (by rank) for 4 seconds.", appliesTo: "target", source: "renekton-e" },
        { kind: "interaction", label: "Grounding disables it", detail: "Grounding disables Slice and Dice, and knock-downs or displacements interrupt its dash.", appliesTo: "self", tags: ["ground", "interrupt"], source: "renekton-e" },
      ],
      details: [
        "Dash speed: 760 plus his movement speed.",
        "Each cast gives 2 Fury per non-champion and 10 per champion hit, up to 30.",
      ],
    },
    R: {
      ddragonCooldown: [120, 100, 80],
      ddragonIdentity: { id: "RenektonReignOfTheTyrant", name: "Dominus", maxRank: 3, charges: null },
      // Wiki cooldown-start field: on-cast.
      cooldown: { kind: "per-rank", seconds: [120, 100, 80], starts: "on-cast" },
      facts: [
        { kind: "defence", label: "Bonus health", detail: "300 to 700 (by rank) for 15 seconds. When it ends his health drops only if it is above his normal maximum.", appliesTo: "self", source: "renekton-r" },
        { kind: "interaction", label: "Unaffected by Grievous Wounds", detail: "The bonus health is not reduced by Grievous Wounds or raised by Spirit Visage.", appliesTo: "self", source: "renekton-r" },
      ],
      details: [
        "For 15 seconds he deals magic damage to enemies within 375 units every 0.5 seconds: 30 to 120 per tick by rank, + 5% bonus AD + 5% AP. Spell shields do not block it.",
        "He gains 20 Fury at once, then 5 a second up to 75, plus 20% size, 25 bonus attack range and a wider Cull the Meek.",
        "It has a 0.25-second cast time; dying during it does not refund the cooldown.",
      ],
    },
  },
};

export default notes;
