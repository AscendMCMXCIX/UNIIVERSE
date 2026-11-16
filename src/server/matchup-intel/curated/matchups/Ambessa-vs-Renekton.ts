import type { MatchupNotes } from "@/domain/matchup-intel/types";

/*
  Ambessa (you) against Renekton (the enemy): curated matchup notes (Layer 2, this direction only),
  checked on patch 26.22 against Data Dragon 16.22.1.

  Every point rests on mechanics the League of Legends Wiki states (CC BY-SA 3.0) for the abilities
  it names, all present in the two champions' notes. The Renekton champion page is cited for the
  wiki's own definition of a stun, shown on that page: an immobilising effect that interrupts
  attack windups except uncancellable ones. No win rates, tiers or advice on what to do.
  Left out: whether Ruthless Predator's stun stops Public Execution's cast time. No saved source
  says (see the note in Ambessa's champion notes).
*/

const notes: MatchupNotes = {
  championId: "Ambessa",
  vsId: "Renekton",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "ambessa-p", title: "League of Legends Wiki: Drakehound's Step (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Drakehound's_Step", revision: 4078254, licence: "CC BY-SA 3.0" },
    { id: "ambessa-q1", title: "League of Legends Wiki: Cunning Sweep (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Cunning_Sweep", revision: 4077875, licence: "CC BY-SA 3.0" },
    { id: "ambessa-w", title: "League of Legends Wiki: Repudiation (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Repudiation", revision: 4085581, licence: "CC BY-SA 3.0" },
    { id: "ambessa-r", title: "League of Legends Wiki: Public Execution (Ambessa)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ambessa/Public_Execution", revision: 4077930, licence: "CC BY-SA 3.0" },
    { id: "renekton-p", title: "League of Legends Wiki: Reign of Anger (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Reign_of_Anger", revision: 3961774, licence: "CC BY-SA 3.0" },
    { id: "renekton-q", title: "League of Legends Wiki: Cull the Meek (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Cull_the_Meek", revision: 4008014, licence: "CC BY-SA 3.0" },
    { id: "renekton-w", title: "League of Legends Wiki: Ruthless Predator (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Ruthless_Predator", revision: 4065616, licence: "CC BY-SA 3.0" },
    { id: "renekton-e", title: "League of Legends Wiki: Slice and Dice (Renekton)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Renekton/Slice_and_Dice", revision: 3943397, licence: "CC BY-SA 3.0" },
    { id: "renekton-page", title: "League of Legends Wiki: Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", revision: 4028014, licence: "CC BY-SA 3.0" },
  ],
  briefing: {
    threat: {
      text: "With 50 Fury, Renekton's Ruthless Predator strikes three times and stuns Ambessa for 1.5 seconds instead of 0.75.",
      basedOn: ["Renekton.P", "Renekton.W"],
    },
    opportunity: {
      text: "Ruthless Predator's cooldown starts only when its effect ends, then runs 16 seconds at rank 1 and 8 at rank 5, before ability haste. Until it is ready again, he has neither its stun nor its 50-Fury shield break, which destroys damage shields such as Repudiation's.",
      basedOn: ["Renekton.W", "Ambessa.W"],
    },
    lane: [
      {
        text: "Renekton's Fury comes from his attacks and abilities, 50% more below half health, and drains after 12 seconds out of combat without attacking. At 50 Fury his next Q, W or Dice is empowered.",
        basedOn: ["Renekton.P", "Renekton.Q", "Renekton.W", "Renekton.E"],
      },
      {
        text: "Dice, Renekton's second dash, is open for 4 seconds only after Slice hits an enemy, and with 50 Fury it also cuts armour by 25 to 35% for 4 seconds. Sundering Slam likewise needs Cunning Sweep to hit.",
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
