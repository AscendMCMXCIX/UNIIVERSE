import type { MatchupNotes } from "@/domain/matchup-intel/types";

/*
  Re-checked against Riot's own sources on 23 Nov 2026 (OD6; riotRecheck): Data Dragon 16.23.1 against
  16.22.1 (every ability's cooldown, cost, ranks, range, description and tooltip, the passive and the
  base stats) and Riot's patch notes for 26.23 (the champions, and the items and runes the notes
  name): no change on Summoner's Rift. The wiki's pages were not read again (its Terms of Use forbid
  automated use without consent), so what rests on them is as checked on 17 Nov.
  Ambessa (you) against Renekton (the enemy): curated matchup notes (Layer 2, this direction only),
  checked on 17 Nov 2026 against patch 26.22 and Data Dragon 16.22.1, the same version as both
  champions' notes.

  Every point rests on what the cited pages state (CC BY-SA 3.0): the named abilities' data pages,
  at the revisions the two champions' notes also cite, and the glossary shown on the saved copy of
  the Renekton champion page, for what a stun is and interrupts and what an ability's cooldown means. A point may apply
  what a page states of a whole class (damage shields, immobilising effects) to a member that a page
  names as one. The Renekton champion page is cited for the wiki's own definition of a stun, shown
  on that page: an immobilising effect that interrupts attack windups except uncancellable ones. The
  points are considerations: no win rates, tiers or advice on what to do.

  Left out, and why:
  - whether Ruthless Predator's stun stops Public Execution's cast time: no saved source says (see
    the note in Ambessa's champion notes).
*/

const notes: MatchupNotes = {
  championId: "Ambessa",
  vsId: "Renekton",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17", riotRecheck: { patch: "26.23", ddragonVersion: "16.23.1", on: "2026-11-23" } },
  sources: [
    { id: "ambessa-p", title: "League of Legends Wiki: Drakehound's Step (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Drakehound's_Step", kind: "wiki-ability", revision: 4078254, revisionTime: "2026-10-06T20:43:13Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-q1", title: "League of Legends Wiki: Cunning Sweep (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Cunning_Sweep", kind: "wiki-ability", revision: 4077875, revisionTime: "2026-10-06T14:46:36Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-w", title: "League of Legends Wiki: Repudiation (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Repudiation", kind: "wiki-ability", revision: 4085581, revisionTime: "2026-10-15T15:27:13Z", licence: "CC BY-SA 3.0" },
    { id: "ambessa-r", title: "League of Legends Wiki: Public Execution (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Public_Execution", kind: "wiki-ability", revision: 4077930, revisionTime: "2026-10-06T15:21:06Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-p", title: "League of Legends Wiki: Reign of Anger (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Reign_of_Anger", kind: "wiki-ability", revision: 3961774, revisionTime: "2025-10-29T04:36:45Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-q", title: "League of Legends Wiki: Cull the Meek (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Cull_the_Meek", kind: "wiki-ability", revision: 4008014, revisionTime: "2026-04-13T03:35:33Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-w", title: "League of Legends Wiki: Ruthless Predator (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Ruthless_Predator", kind: "wiki-ability", revision: 4065616, revisionTime: "2026-09-23T19:37:45Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-e", title: "League of Legends Wiki: Slice and Dice (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Slice_and_Dice", kind: "wiki-ability", revision: 3943397, revisionTime: "2025-08-08T18:04:56Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-page", title: "League of Legends Wiki: Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", kind: "wiki-champion", revision: 4028014, revisionTime: "2026-06-13T11:56:18Z", licence: "CC BY-SA 3.0" },
  ],
  briefing: {
    threat: {
      text: "With 50 Fury, Renekton's Ruthless Predator strikes three times and stuns Ambessa for 1.5 seconds instead of 0.75.",
      basedOn: ["Renekton.P", "Renekton.W"],
    },
    opportunity: {
      text: "Ruthless Predator's cooldown, 16 seconds at rank 1 and 8 at rank 5, starts when its effect ends. Until it is ready again, he has neither its stun nor its 50-Fury shield break, which destroys damage shields such as Repudiation's.",
      basedOn: ["Renekton.W", "Ambessa.W"],
    },
    lane: [
      {
        text: "Renekton's Fury comes from his attacks and abilities, 50% more below half health, and drains after 12 seconds out of combat without attacking. At 50 Fury his next Q, W or Dice is empowered.",
        basedOn: ["Renekton.P", "Renekton.Q", "Renekton.W", "Renekton.E"],
      },
      {
        text: "Dice, Renekton's second dash, can be cast within 4 seconds if Slice hits an enemy, and with 50 Fury it also cuts armour by 25 to 35% for 4 seconds. Sundering Slam can likewise be cast within 4 seconds if Cunning Sweep hits an enemy.",
        basedOn: ["Renekton.E", "Ambessa.Q"],
      },
      {
        text: "Cull the Meek heals Renekton for each enemy hit, more against champions, and with 50 Fury its healing triples (cap 200 to 600). Public Execution's passive heals Ambessa for 15 to 20% (by rank) of the damage her active abilities deal.",
        basedOn: ["Renekton.Q", "Ambessa.R"],
      },
    ],
  },
  interactions: [
    {
      text: "Fury-empowered Ruthless Predator destroys damage shields before it deals damage, so Repudiation's shield is removed instead of absorbing the hit.",
      abilities: ["Renekton.W", "Ambessa.W"],
      source: "renekton-w",
    },
    {
      text: "If Ruthless Predator stuns Ambessa during an ability's lockout, the dash she queued is cancelled: a stun is an immobilising effect.",
      abilities: ["Renekton.W", "Ambessa.P"],
      source: "ambessa-p",
    },
    {
      text: "Ruthless Predator's stun does not interrupt the windup of an attack empowered by Medarda Maxim: that windup is uncancellable, and stuns do not interrupt uncancellable windups.",
      abilities: ["Renekton.W", "Ambessa.P"],
      source: "renekton-page",
    },
  ],
};

export default notes;
