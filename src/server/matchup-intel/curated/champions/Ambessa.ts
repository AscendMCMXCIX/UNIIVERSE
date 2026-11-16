import type { ChampionNotes } from "@/domain/matchup-intel/types";

/*
  Ambessa: curated champion notes (Layer 1), checked on 16 Nov 2026 against patch 26.22 and Data
  Dragon 16.22.1.

  Sources: the League of Legends Wiki's ability data pages (Template:Data Ambessa/<ability>, read at
  the revisions below, CC BY-SA 3.0) and Data Dragon 16.22.1. Each ability's ddragonCooldown and
  ddragonIdentity are Data Dragon's cooldown array, spell id, name, ranks and charges, copied exactly
  (the passive has no cooldown or id in Data Dragon); the wiki's cooldown for every ability matches.
  The wiki's R cooldown ({{ap|130 to 100}}) shows as 130 / 115 / 100 on the rendered ability, the
  same as Data Dragon's three ranks. Numbers are base values per rank, without ability haste. Every
  text is UNIIVERSE's own summary of what the page states. Badges read from a page's fields use the
  meanings Template:Ability data gives them: grounded (grounding disables it) and knockdown (an enemy
  knock-down or displacement interrupts and overrides its movement).

  Cooldown starts, from the page's cooldown-start field (cdstart), and null where it gives none:
  - Q: "after-first-cast". Cunning Sweep's field says on-cast, which, on an ability cast again,
    names its first cast: Riven's Broken Wings page gives both, on-cast and "Starts after first
    cast". Sundering Slam's page gives no cooldown of its own.
  - W, E, R: null: no cdstart.
  - P: no cooldown spec: the page gives none, and Data Dragon never gives a passive one.

  Terms: Riot's tooltip calls her "Unstoppable" during Public Execution, where the wiki says
  displacement immune; the notes use the wiki's term, the narrower claim.

  Left out, and why:
  - what interrupts Public Execution's cast time: its interaction table reads "revival-false" and
    its template was not saved, and the wiki's stun definition names attack windups and channels,
    not cast times, so no saved source says whether a stun stops it;
  - which summoner spells she can use during Public Execution: only that interaction table says,
    and it cannot be read without its template;
  - level notes beyond the energy steps: no saved page states another level rule for Ambessa.
*/

const notes: ChampionNotes = {
  championId: "Ambessa",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "ambessa-p", title: "League of Legends Wiki: Drakehound's Step (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Drakehound's_Step", kind: "wiki-ability", revision: 4078254, revisionTime: "2026-10-06T20:43:13Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-q1", title: "League of Legends Wiki: Cunning Sweep (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Cunning_Sweep", kind: "wiki-ability", revision: 4077875, revisionTime: "2026-10-06T14:46:36Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-q2", title: "League of Legends Wiki: Sundering Slam (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Sundering_Slam", kind: "wiki-ability", revision: 4077904, revisionTime: "2026-10-06T15:04:20Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-w", title: "League of Legends Wiki: Repudiation (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Repudiation", kind: "wiki-ability", revision: 4085581, revisionTime: "2026-10-15T15:27:13Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-e", title: "League of Legends Wiki: Lacerate (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Lacerate", kind: "wiki-ability", revision: 4077910, revisionTime: "2026-10-06T15:09:13Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-r", title: "League of Legends Wiki: Public Execution (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Public_Execution", kind: "wiki-ability", revision: 4077930, revisionTime: "2026-10-06T15:21:06Z", licence: "CC BY-SA 3.0" },
    { id: "ability-data", title: "League of Legends Wiki: Template:Ability data (what each field means)", url: "https://wiki.leagueoflegends.com/en-us/Template:Ability_data", kind: "wiki-reference", revision: 4084623, revisionTime: "2026-10-13T17:49:21Z", licence: "CC BY-SA 3.0" },
    { id: "ddragon", title: "Data Dragon 16.22.1: Ambessa", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Ambessa.json", kind: "ddragon", licence: "Riot Games" },
  ],
  abilities: {
    P: {
      ddragonCooldown: [],
      ddragonIdentity: { id: null, name: "Drakehound's Step", maxRank: 1, charges: null },
      facts: [
        { kind: "mobility", label: "Dash", detail: "During any ability's lockout, a move or attack command queues a dash of 175 to 350 units, taken when the lockout ends. It cannot cross terrain.", appliesTo: "self", tags: ["dash"], source: "ambessa-p" },
        { kind: "interaction", label: "Immobilising or grounding stops it", detail: "She cannot dash while immobilised or grounded, and either one during a lockout cancels the dash she queued. An enemy knock-down or displacement interrupts and overrides the dash itself.", appliesTo: "self", tags: ["ground", "interrupt"], source: "ambessa-p" },
        { kind: "empowerment", label: "Uncancellable empowered attacks", detail: "Attacks empowered by Medarda Maxim, one stack per ability cast, have an uncancellable windup.", appliesTo: "self", source: "ambessa-p" },
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
      ddragonIdentity: { id: "AmbessaQ", name: "Cunning Sweep / Sundering Slam", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [14, 13, 12, 11, 10], starts: "after-first-cast" },
      recast: { count: 1, windowSeconds: 4, note: "Sundering Slam, only after Cunning Sweep hits at least one enemy." },
      facts: [
        { kind: "damage", label: "Max-health damage", detail: "Cunning Sweep's damage includes a share of the target's maximum health, and it is doubled at the outer edge of the sweep.", appliesTo: "target", tags: ["max-health-damage"], source: "ambessa-q1" },
        { kind: "damage", label: "Doubled on first enemy", detail: "Sundering Slam's damage also includes a share of maximum health, doubled on the first enemy in its line.", appliesTo: "target", tags: ["max-health-damage"], source: "ambessa-q2" },
      ],
      details: [
        "Cunning Sweep is a 180° sweep reaching 400 units; Sundering Slam is a 650-unit line, 80 units wide.",
        "The health share is 2 to 3% by rank, plus 1.5% (Sweep) or 2% (Slam) per 100 bonus AD, before doubling.",
        "Each cast starts with a 0.225-second lockout. A dash queued during it, or started within 0.275 seconds after, comes after the hit.",
      ],
    },
    W: {
      ddragonCooldown: [18, 17, 16, 15, 14],
      ddragonIdentity: { id: "AmbessaW", name: "Repudiation", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: null },
      facts: [
        { kind: "defence", label: "Shield", detail: "On cast: 50 to 320 (by level) + 150% bonus AD, for 1.5 seconds.", appliesTo: "self", tags: ["shield"], source: "ambessa-w" },
        { kind: "interaction", label: "Stronger if the shield absorbs", detail: "The smash deals 50% more if, before it lands, the shield has taken damage from a champion, a large monster or a turret.", appliesTo: "self", tags: ["shield"], source: "ambessa-w" },
      ],
      details: [
        "She braces for up to 0.5 seconds, unable to act for the first 0.225, then smashes the ground around her (325 units).",
        "In the brace's last 0.275 seconds she can use her other abilities.",
        "With a dash during the brace, the smash lands at the dash's end if the brace finishes during the dash; otherwise it lands where she stands when the brace ends.",
      ],
    },
    E: {
      ddragonCooldown: [13, 12, 11, 10, 9],
      ddragonIdentity: { id: "AmbessaE", name: "Lacerate", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [13, 12, 11, 10, 9], starts: null },
      facts: [
        { kind: "crowd-control", label: "Slow", detail: "99%, fading over 1 second.", appliesTo: "target", tags: ["slow"], source: "ambessa-e" },
        { kind: "exception", label: "Spins again after a dash", detail: "A dash queued during the lockout, or started within 0.275 seconds after it, repeats the spin where the dash ends, at no extra cost, even if the dash is interrupted.", appliesTo: "self", tags: ["dash"], source: "ambessa-e" },
      ],
      details: ["The spin hits enemies around her (325 units) and comes with a 0.225-second lockout."],
    },
    R: {
      ddragonCooldown: [130, 115, 100],
      ddragonIdentity: { id: "AmbessaR", name: "Public Execution", maxRank: 3, charges: null },
      cooldown: { kind: "per-rank", seconds: [130, 115, 100], starts: null },
      facts: [
        { kind: "mobility", label: "Blink", detail: "After a 0.7-second cast time, she blinks behind the farthest enemy champion in a 1,250-unit line.", appliesTo: "self", tags: ["blink"], source: "ambessa-r" },
        { kind: "crowd-control", label: "Suppression", detail: "0.75 seconds; the target is revealed.", appliesTo: "target", tags: ["suppression"], source: "ambessa-r" },
        { kind: "crowd-control", label: "Stun", detail: "0.4 seconds, with the slam's damage, once she crashes the target down.", appliesTo: "target", tags: ["stun"], source: "ambessa-r" },
        { kind: "defence", label: "Displacement immune", detail: "Through the cast time and the target's suppression; polymorphs do not affect her then either.", appliesTo: "self", tags: ["displacement-immune"], source: "ambessa-r" },
        { kind: "interaction", label: "Removing the suppression ends it", detail: "A target that clears the suppression, with a cleanse for example, breaks free at once: no slam damage or stun, and her lockout and displacement immunity end early.", appliesTo: "target", tags: ["suppression"], source: "ambessa-r" },
        { kind: "interaction", label: "Resisted by crowd-control immunity", detail: "A target immune to crowd control or displacement, or behind a spell shield, is not seized: she still blinks, with no damage and no stun.", appliesTo: "target", tags: ["cc-immune", "displacement-immune", "spell-shield"], source: "ambessa-r" },
        { kind: "sustain", label: "Heals from ability damage", detail: "Passive: 15 to 20% (by rank) of the damage her active abilities deal after mitigation, plus half her life steal; 25% as effective against minions and monsters.", appliesTo: "self", tags: ["heal"], source: "ambessa-r" },
      ],
      details: [
        "Passive: 10 to 30% armour penetration (by rank).",
        "If the blink would end inside an enemy turret's attack range, it tries to place her outside it.",
        "She is revealed during the cast time when an enemy champion is nearby.",
        "Grounding disables the ability.",
      ],
    },
  },
  levelNotes: [
    { level: 7, text: "Medarda Maxim attacks restore 55 energy, up from 40.", source: "ambessa-p" },
    { level: 13, text: "Medarda Maxim attacks restore 70 energy.", source: "ambessa-p" },
  ],
};

export default notes;
