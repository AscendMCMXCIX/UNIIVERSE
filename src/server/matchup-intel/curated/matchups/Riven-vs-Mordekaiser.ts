import type { MatchupNotes } from "@/domain/matchup-intel/types";

/*
  Re-checked against Riot's own sources on 23 Nov 2026 (OD6; riotRecheck): Data Dragon 16.23.1 against
  16.22.1 (every ability's cooldown, cost, ranks, range, description and tooltip, the passive and the
  base stats) and Riot's patch notes for 26.23 (the champions, and the items and runes the notes
  name): no change on Summoner's Rift. The wiki's pages were not read again (its Terms of Use forbid
  automated use without consent), so what rests on them is as checked on 17 Nov.
  Riven (you) against Mordekaiser (the enemy): curated matchup notes (Layer 2, this direction
  only), checked on 17 Nov 2026 against patch 26.22 and Data Dragon 16.22.1, the same version as
  both champions' notes.

  Every point rests on mechanics the League of Legends Wiki's ability data pages state (the same
  revisions as the two champions' notes, CC BY-SA 3.0) and names the abilities it rests on, all
  present in those notes. A point may apply what a page states of a whole class to a member that a
  page names as one: Realm of Death's page says dashes and other forms of movement stop at the
  realm's edge and that its health loss ignores shields, and Riven's pages call Broken Wings and
  Valor dashes, the third cast's knock-back a movement, and Valor's a shield. The points are
  considerations: no win rates, tiers, guesses or instructions on how to play.

  Changed or left out on the re-check of 16 Nov 2026, and why:
  - that Death's Grasp's pull interrupts a Broken Wings or Valor dash (in the opportunity and two
    interactions): their pages' knockdown field says an enemy displacement interrupts and overrides
    the dash, and Death's Grasp's page marks its pull with the wiki's airborne term, which Realm of
    Death's page shows as "displacements", but no page says it of this pull in words. A person who
    confirms that the wiki's airborne entry counts a pull as a displacement can add it back.

  Left out because no saved page states it:
  - whether Ki Burst's stun or Broken Wings' knock-back interrupts the cast time of Obliterate,
    Death's Grasp or Realm of Death;
  - how far "too far away" is for Realm of Death's cancel during its cast, so nothing is said
    about leaving its range with a dash;
  - that Death's Grasp is Mordekaiser's only pull;
  - whether ability haste shortens Death's Grasp's cooldown;
  - when Obliterate strikes relative to its 0.5-second cast time: its page's own words do not say,
    and the template it calls there (Effect at cast time end) was not saved;
  - the wiki's lane tip on where to cast Realm of Death (advice, not a mechanic).
*/

const notes: MatchupNotes = {
  championId: "Riven",
  vsId: "Mordekaiser",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17", riotRecheck: { patch: "26.23", ddragonVersion: "16.23.1", on: "2026-11-23" } },
  sources: [
    { id: "riven-p", title: "League of Legends Wiki: Runic Blade (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Runic_Blade", kind: "wiki-ability", revision: 4091406, revisionTime: "2026-10-30T14:54:09Z", licence: "CC BY-SA 3.0" },
    { id: "riven-q", title: "League of Legends Wiki: Broken Wings (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Broken_Wings", kind: "wiki-ability", revision: 4025373, revisionTime: "2026-06-05T15:05:11Z", licence: "CC BY-SA 3.0" },
    { id: "riven-e", title: "League of Legends Wiki: Valor (Riven)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Riven/Valor", kind: "wiki-ability", revision: 3959341, revisionTime: "2025-10-13T20:20:07Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-p", title: "League of Legends Wiki: Darkness Rise (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Darkness_Rise", kind: "wiki-ability", revision: 4070051, revisionTime: "2026-09-29T15:58:08Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-q", title: "League of Legends Wiki: Obliterate (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Obliterate", kind: "wiki-ability", revision: 4078264, revisionTime: "2026-10-06T20:47:39Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-w", title: "League of Legends Wiki: Indestructible (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Indestructible", kind: "wiki-ability", revision: 4016354, revisionTime: "2026-05-10T19:48:19Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-e", title: "League of Legends Wiki: Death's Grasp (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Death's_Grasp", kind: "wiki-ability", revision: 4070332, revisionTime: "2026-09-29T18:36:13Z", licence: "CC BY-SA 3.0" },
    { id: "mordekaiser-r", title: "League of Legends Wiki: Realm of Death (Mordekaiser)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Mordekaiser/Realm_of_Death", kind: "wiki-ability", revision: 4093177, revisionTime: "2026-11-08T17:57:11Z", licence: "CC BY-SA 3.0" },
  ],
  briefing: {
    threat: {
      text: "Realm of Death slows Riven by 75% during its 0.5-second cast, then takes only her and Mordekaiser into the Death Realm for 7 seconds, moving 10% of her AD, attack speed, maximum health, armour and magic resistance to him. The health it takes ignores Valor's shield.",
      basedOn: ["Mordekaiser.R", "Riven.E"],
    },
    opportunity: {
      text: "Death's Grasp pulls 0.5 seconds after Mordekaiser summons the claw, and its cooldown is 16 seconds at rank 1 and 8 at rank 5.",
      basedOn: ["Mordekaiser.E"],
    },
    lane: [
      {
        text: "Darkness Rise turns on at 3 stacks: he gains one each time his attack damages Riven or a basic ability hits her, and each new stack refreshes their 4 seconds. Its aura then deals magic damage every second while she is within 375 units, including 1–5% of her maximum health (by his level).",
        basedOn: ["Mordekaiser.P"],
      },
      {
        text: "Neither sees the other's display under the health bar: the one showing Mordekaiser's Darkness Rise stacks is hidden from other champions, and only Riven's player sees the one showing her Runic Blade charges.",
        basedOn: ["Mordekaiser.P", "Riven.P"],
      },
      {
        text: "Obliterate has a 0.5-second cast time; it strikes towards the spot he aimed at when the cast began, and deals 30% more at rank 1 (50% at rank 5) when it hits only one enemy.",
        basedOn: ["Mordekaiser.Q"],
      },
      {
        text: "45% of the damage Mordekaiser deals to Riven (after mitigation) and 7.5% of the damage she deals to him (before mitigation) build his Potential Shield, up to 30% of his maximum health. Indestructible turns it into a 4-second shield, and its recast heals him for 35–45% (by rank) of the shield left.",
        basedOn: ["Mordekaiser.W"],
      },
    ],
  },
  interactions: [
    { text: "In the Death Realm, Riven's dashes and Broken Wings' knock-back stop at the arena's edge.", abilities: ["Mordekaiser.R", "Riven.Q", "Riven.E"], source: "mordekaiser-r" },
    { text: "Structures are present in every realm simultaneously, and turrets act as usual, as if all units shared one realm.", abilities: ["Mordekaiser.R"], source: "mordekaiser-r" },
  ],
};

export default notes;
