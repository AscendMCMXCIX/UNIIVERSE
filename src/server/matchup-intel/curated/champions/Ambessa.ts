import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Ambessa: curated champion notes (Layer 1), checked on patch 26.22 against Data Dragon 16.22.1.

  Sources: the League of Legends Wiki's ability data templates at the revisions below (CC BY-SA 3.0)
  and Data Dragon 16.22.1 for the cooldown arrays. Every text is UNIIVERSE's own summary.

  Cooldown starts:
  - Q: "on-cast", from the wiki's cooldown-start field on Cunning Sweep (the first cast).
  - W, E, R: "on-cast" as the ordinary case: the wiki gives no special start for them.
  - P: no cooldown recorded. The wiki gives none for Drakehound's Step and Data Dragon never does.
  The wiki's R cooldown ({{ap|130 to 100}}) shows as 130 / 115 / 100 on the rendered ability,
  the same as Data Dragon's three ranks.

  Not claimed: that only death interrupts Public Execution. Its interaction table lists death as
  what interrupts the cast time and lockout, but the same kind of table on Drakehound's Step lists
  only death too, while that template's knockdown field says displacements interrupt the dash. So
  the table is not a full list, and no saved source says whether a stun stops the cast time.
*/

const notes: ChampionNotes = {
  championId: "Ambessa",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "ambessa-p", title: "League of Legends Wiki: Drakehound's Step (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Drakehound's_Step", revision: 4078254, licence: "CC BY-SA 3.0" },
    { id: "ambessa-q1", title: "League of Legends Wiki: Cunning Sweep (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Cunning_Sweep", revision: 4077875, licence: "CC BY-SA 3.0" },
    { id: "ambessa-q2", title: "League of Legends Wiki: Sundering Slam (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Sundering_Slam", revision: 4077904, licence: "CC BY-SA 3.0" },
    { id: "ambessa-w", title: "League of Legends Wiki: Repudiation (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Repudiation", revision: 4085581, licence: "CC BY-SA 3.0" },
    { id: "ambessa-e", title: "League of Legends Wiki: Lacerate (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Lacerate", revision: 4077910, licence: "CC BY-SA 3.0" },
    { id: "ambessa-r", title: "League of Legends Wiki: Public Execution (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Public_Execution", revision: 4077930, licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Ambessa", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Ambessa.json", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      facts: [
        { kind: "mobility", label: "Dash", detail: "During any ability's lockout, a move or attack command queues a dash of 175 to 350 units, taken when the lockout ends. It cannot cross terrain.", source: "ambessa-p" },
        { kind: "interaction", label: "Immobilising or grounding stops it", detail: "She cannot dash while immobilised or grounded, and either one during a lockout cancels the dash she queued. Knock-downs and displacements interrupt the dash itself.", source: "ambessa-p" },
        { kind: "exception", label: "Uncancellable empowered attacks", detail: "Attacks empowered by Medarda Maxim, one stack per ability cast, have an uncancellable windup.", source: "ambessa-p" },
      ],
      details: [
        "Each ability cast adds a Medarda Maxim stack once its lockout ends: up to 3, lasting 4 seconds, refreshed by later casts.",
        "Each basic attack spends one stack for 75 bonus range, 50% bonus attack speed, 5 to 25 (by level) + 20% bonus AD bonus physical damage, and energy: 40, then 55 from level 7 and 70 from level 13.",
        "The dash moves at 770 speed at level 1, 60 more at levels 6, 11 and 16, plus her movement speed.",
        "It heads for the latest move or attack command given during the lockout; if the latest command is anything else, there is no dash.",
      ],
    },
    Q: {
      ddragonCooldown: [14, 13, 12, 11, 10],
      // Wiki cooldown-start field (Cunning Sweep): on-cast.
      cooldown: { kind: "per-rank", seconds: [14, 13, 12, 11, 10], starts: "on-cast" },
      cooldownNote: "Starts when Cunning Sweep is cast.",
      recast: { count: 1, windowSeconds: 4, note: "Sundering Slam, only after Cunning Sweep hits at least one enemy." },
      facts: [
        { kind: "damage", label: "Max-health damage", detail: "Cunning Sweep deals a share of the target's maximum health, doubled at the outer edge of the sweep.", source: "ambessa-q1" },
        { kind: "damage", label: "Doubled on first enemy", detail: "Sundering Slam also deals a share of maximum health, doubled on the first enemy in its line.", source: "ambessa-q2" },
      ],
      details: [
        "Cunning Sweep is a 180° sweep reaching 400 units; Sundering Slam is a 650-unit line, 80 units wide.",
        "The health share is 2 to 3% by rank, plus 1.5% (Sweep) or 2% (Slam) per 100 bonus AD, before doubling.",
        "Each cast starts with a 0.225-second lockout. A dash queued during it, or started within 0.275 seconds after, comes after the hit.",
      ],
    },
    W: {
      ddragonCooldown: [18, 17, 16, 15, 14],
      // The wiki gives no cooldown start: on-cast, the ordinary case.
      cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "on-cast" },
      facts: [
        { kind: "defence", label: "Shield", detail: "On cast: 50 to 320 (by level) + 150% bonus AD, for 1.5 seconds.", source: "ambessa-w" },
        { kind: "interaction", label: "Stronger if the shield absorbs", detail: "The smash deals 50% more if, before it lands, the shield has taken damage from a champion, a large monster or a turret.", source: "ambessa-w" },
      ],
      details: [
        "She braces for up to 0.5 seconds, unable to act for the first 0.225, then smashes the ground around her (325 units).",
        "In the brace's last 0.275 seconds she can use her other abilities.",
        "With a dash during the brace, the smash lands at the dash's end if the brace finishes during the dash; otherwise it lands where she stands when the brace ends.",
      ],
    },
    E: {
      ddragonCooldown: [13, 12, 11, 10, 9],
      // The wiki gives no cooldown start: on-cast, the ordinary case.
      cooldown: { kind: "per-rank", seconds: [13, 12, 11, 10, 9], starts: "on-cast" },
      facts: [
        { kind: "crowd-control", label: "Slow", detail: "99%, fading over 1 second.", source: "ambessa-e" },
        { kind: "exception", label: "Spins again after a dash", detail: "A dash queued during the lockout, or started within 0.275 seconds after it, repeats the spin where the dash ends, at no extra cost, even if the dash is interrupted.", source: "ambessa-e" },
      ],
      details: ["The spin hits enemies around her (325 units) and comes with a 0.225-second lockout."],
    },
    R: {
      ddragonCooldown: [130, 115, 100],
      // The wiki gives no cooldown start: on-cast, the ordinary case.
      cooldown: { kind: "per-rank", seconds: [130, 115, 100], starts: "on-cast" },
      facts: [
        { kind: "mobility", label: "Blink", detail: "After a 0.7-second cast time, she blinks behind the farthest enemy champion in a 1250-unit line.", source: "ambessa-r" },
        { kind: "crowd-control", label: "Suppression", detail: "0.75 seconds; the target is revealed.", source: "ambessa-r" },
        { kind: "crowd-control", label: "Stun", detail: "0.4 seconds, with the slam's damage, once she crashes the target down.", source: "ambessa-r" },
        { kind: "defence", label: "Displacement immune", detail: "Through the cast time and the target's suppression; polymorphs do not affect her then either.", source: "ambessa-r" },
        { kind: "interaction", label: "Removing the suppression ends it", detail: "A target that clears the suppression, with a cleanse for example, breaks free at once: no slam damage or stun, and her lockout and displacement immunity end early.", source: "ambessa-r" },
        { kind: "interaction", label: "Resisted by crowd-control immunity", detail: "A target immune to crowd control or displacement, or behind a spell shield, is not seized: she still blinks, with no damage and no stun.", source: "ambessa-r" },
        { kind: "sustain", label: "Heals from ability damage", detail: "Passive: 15 to 20% (by rank) of the damage her active abilities deal after mitigation, plus half her life steal; 25% as effective against minions and monsters.", source: "ambessa-r" },
      ],
      details: [
        "Passive: 10 to 30% armour penetration (by rank).",
        "If the blink would end inside an enemy turret's attack range, it tries to place her outside it.",
        "She is revealed during the cast time when an enemy champion is nearby.",
        "Flash, Teleport and Recall cannot be used during the cast time or the lockout, and grounding disables the ability.",
      ],
    },
  },
  levelNotes: [
    { level: 7, text: "Medarda Maxim attacks restore 55 energy, up from 40.", source: "ambessa-p" },
    { level: 13, text: "Medarda Maxim attacks restore 70 energy.", source: "ambessa-p" },
  ],
};

export default notes;
