import type { MatchupNotes } from "@/domain/matchup-intel/types";

/*
  Riven (you) against Mordekaiser (the enemy): curated matchup notes (Layer 2, this direction
  only), checked on 16 Nov 2026 against patch 26.22 and Data Dragon 16.22.1.

  Every point rests on mechanics the League of Legends Wiki's ability data pages state (the same
  revisions as the two champions' notes, CC BY-SA 3.0) and names the abilities it rests on, all
  present in those notes. That Death's Grasp's pull counts as a displacement is the wiki's own
  linking: its page ties "pulls" to the same airborne tip the Realm of Death page uses for
  "displacements". Broken Wings' and Valor's pages set the knockdown field, which Template:Ability
  data defines as movement interrupted and overridden by an enemy knock-down or displacement. No
  win rates, tiers, guesses or instructions on how to play.

  Left out because no saved page states it:
  - whether Ki Burst's stun or Broken Wings' knock-back interrupts the cast time of Obliterate,
    Death's Grasp or Realm of Death;
  - how far "too far away" is for Realm of Death's cancel during its cast, so nothing is said
    about leaving its range with a dash;
  - the wiki's lane tip on where to cast Realm of Death (advice, not a mechanic).
*/

const notes: MatchupNotes = {
  championId: "Riven",
  vsId: "Mordekaiser",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "riven-p", title: "League of Legends Wiki: Template:Data Riven/Runic Blade", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Runic_Blade", revision: 4091406, licence: "CC BY-SA 3.0" },
    { id: "riven-q", title: "League of Legends Wiki: Template:Data Riven/Broken Wings", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Broken_Wings", revision: 4025373, licence: "CC BY-SA 3.0" },
    { id: "riven-e", title: "League of Legends Wiki: Template:Data Riven/Valor", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Valor", revision: 3959341, licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-p", title: "League of Legends Wiki: Template:Data Mordekaiser/Darkness Rise", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Darkness_Rise", revision: 4070051, licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-q", title: "League of Legends Wiki: Template:Data Mordekaiser/Obliterate", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Obliterate", revision: 4078264, licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-w", title: "League of Legends Wiki: Template:Data Mordekaiser/Indestructible", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Indestructible", revision: 4016354, licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-e", title: "League of Legends Wiki: Template:Data Mordekaiser/Death's Grasp", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Death's_Grasp", revision: 4070332, licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-r", title: "League of Legends Wiki: Template:Data Mordekaiser/Realm of Death", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Realm_of_Death", revision: 4093177, licence: "CC BY-SA 3.0" },
    { id: "ability-data", title: "League of Legends Wiki: Template:Ability data (what each field means)", url: "https://wiki.leagueoflegends.com/en-us/Template:Ability_data", revision: 4084623, licence: "CC BY-SA 3.0" },
  ],
  briefing: {
    threat: {
      text: "Realm of Death slows Riven by 75% during its 0.5-second cast, then takes only her and Mordekaiser into the Death Realm for 7 seconds, moving 10% of her AD, attack speed, maximum health, armour and magic resistance to him. The health it takes ignores Valor's shield.",
      basedOn: ["Mordekaiser.R", "Riven.E"],
    },
    opportunity: {
      text: "Death's Grasp's cooldown is 16 seconds at rank 1 and 8 at rank 5, before ability haste. While it is on cooldown, he cannot use its pull, which interrupts a Broken Wings or Valor dash that it catches.",
      basedOn: ["Mordekaiser.E", "Riven.Q", "Riven.E"],
    },
    lane: [
      {
        text: "Darkness Rise turns on at 3 stacks: he gains one each time his attack damages Riven or a basic ability hits her, and each new stack refreshes their 4 seconds. Its aura then deals magic damage every second while she is within 375 units, including 1–5% of her maximum health (by his level).",
        basedOn: ["Mordekaiser.P"],
      },
      {
        text: "Only Mordekaiser sees his Darkness Rise stack count, as only Riven sees her Runic Blade charges.",
        basedOn: ["Mordekaiser.P", "Riven.P"],
      },
      {
        text: "Obliterate lands at the end of its 0.5-second cast time, towards the spot he aimed at when the cast began, and deals 30% more at rank 1 (50% at rank 5) when it hits only one enemy.",
        basedOn: ["Mordekaiser.Q"],
      },
      {
        text: "45% of the damage Mordekaiser deals to Riven (after mitigation) and 7.5% of the damage she deals to him (before mitigation) build his Potential Shield, up to 30% of his maximum health. Indestructible turns it into a 4-second shield, and its recast heals him for 35–45% (by rank) of the shield left.",
        basedOn: ["Mordekaiser.W"],
      },
    ],
  },
  interactions: [
    { text: "Death's Grasp's pull is a displacement, and an enemy displacement interrupts and overrides Valor's dash.", abilities: ["Mordekaiser.E", "Riven.E"], source: "riven-e" },
    { text: "A displacement such as Death's Grasp's pull also interrupts and overrides a Broken Wings dash.", abilities: ["Mordekaiser.E", "Riven.Q"], source: "riven-q" },
    { text: "In the Death Realm, Riven's dashes and Broken Wings' knock-back stop at the arena's edge.", abilities: ["Mordekaiser.R", "Riven.Q", "Riven.E"], source: "mordekaiser-r" },
    { text: "The realm change does not affect turrets: they behave as if Riven and Mordekaiser were both still in the normal realm.", abilities: ["Mordekaiser.R"], source: "mordekaiser-r" },
  ],
};

export default notes;
