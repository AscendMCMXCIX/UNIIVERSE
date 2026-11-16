import type { MatchupNotes } from "@/domain/matchup-intel/types";

/*
  Gwen (you) against Ornn (the enemy): curated matchup notes (Layer 2, this direction only), checked
  on 16 Nov 2026 against patch 26.22 and Data Dragon 16.22.1, the same version as both champions'
  notes.

  Every point rests on mechanics the two champions' wiki ability pages state (the same revisions as
  their champion notes, CC BY-SA 3.0) and names the abilities it rests on. A point may apply what a
  page states of a whole class to a member that a page names as one: that a stun spends Brittle
  rests on Living Forge's page (immobilising effects spend it; Riot's tooltip says the same of
  immobilising effects) and on the wiki's definition of a stun as an immobilising effect, shown on
  the Renekton page (revision 4028014), which is therefore one of the sources below, as it is for
  Ambessa vs Renekton. Ornn's own pages give the lengthened stuns (1.625 s and 1.3 s) but call a stun
  an immobilising effect only through that definition. The points are considerations: no win
  rates, tiers, guesses or instructions on how to play.

  Changed or left out on the re-check of 16 Nov 2026, and why:
  - "the mist lasts 4 s, longer than the 3 s of Brittle": a comparison of two numbers that no page
    makes, so the opportunity no longer draws it;
  - that slows on a Brittle Gwen last longer without spending it: the wiki says so, but Riot's
    tooltip names only immobilising effects, so it is disputed (Ornn's champion notes);
  - that Ornn's attack on a Brittle Gwen deals no bonus damage: disputed the same way.

  Left out because no saved page states it:
  - whether Hallowed Mist keeps out Ornn's ultimate elemental when Ornn is outside the mist (the
    page covers enemies and their pets, and does not say which the elemental counts as);
  - whether slowing Ornn with Needlework can stop Bellows Breath's lunge (that would rest on
    arithmetic and an estimated movement-speed threshold, not a stated interaction);
  - how Ornn's knock-ups meet Gwen's E dash: her page's knockdown field says an enemy displacement
    interrupts it, but Ornn's pages do not call their knock-ups displacements in words.
*/

const notes: MatchupNotes = {
  championId: "Gwen",
  vsId: "Ornn",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "gwen-p", title: "League of Legends Wiki: A Thousand Cuts (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/A_Thousand_Cuts", kind: "wiki-ability", revision: 4081720, revisionTime: "2026-10-09T12:23:52Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-q", title: "League of Legends Wiki: Snip Snip! (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Snip_Snip!", kind: "wiki-ability", revision: 4026398, revisionTime: "2026-06-09T21:51:08Z", licence: "CC BY-SA 3.0" },
    { id: "gwen-w", title: "League of Legends Wiki: Hallowed Mist (Gwen)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Hallowed_Mist", kind: "wiki-ability", revision: 3973613, revisionTime: "2025-12-11T11:22:05Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-p", title: "League of Legends Wiki: Living Forge (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Living_Forge", kind: "wiki-ability", revision: 4089066, revisionTime: "2026-10-22T20:31:26Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-q", title: "League of Legends Wiki: Volcanic Rupture (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Volcanic_Rupture", kind: "wiki-ability", revision: 3998234, revisionTime: "2026-03-10T20:08:53Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-w", title: "League of Legends Wiki: Bellows Breath (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Bellows_Breath", kind: "wiki-ability", revision: 4011962, revisionTime: "2026-04-24T08:40:56Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-e", title: "League of Legends Wiki: Searing Charge (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Searing_Charge", kind: "wiki-ability", revision: 4007982, revisionTime: "2026-04-13T02:25:31Z", licence: "CC BY-SA 3.0" },
    { id: "ornn-r", title: "League of Legends Wiki: Call of the Forge God (Ornn)", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Call_of_the_Forge_God", kind: "wiki-ability", revision: 4007985, revisionTime: "2026-04-13T02:32:34Z", licence: "CC BY-SA 3.0" },
    { id: "renekton-page", title: "League of Legends Wiki: Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", kind: "wiki-champion", revision: 4028014, revisionTime: "2026-06-13T11:56:18Z", licence: "CC BY-SA 3.0" },
  ],
  briefing: {
    threat: {
      text: "If Bellows Breath's final burst hits Gwen, she is Brittle for 3 s. A stun from Ornn's E shockwave (1.25 s) or his R's second pass (1 s) then spends it: with no tenacity the stun lasts 1.625 s or 1.3 s, and she takes magic damage of 9% (at his level 1) to 17% (at level 18) of her maximum health.",
      basedOn: ["Ornn.W", "Ornn.P", "Ornn.E", "Ornn.R"],
    },
    opportunity: {
      text: "While Gwen is inside Hallowed Mist, Ornn cannot target her from outside it. The mist lasts 4 s, and Hallowed Mist's cooldown starts only when it ends.",
      basedOn: ["Gwen.W"],
    },
    lane: [
      {
        text: "Searing Charge knocks up and stuns only when Ornn rams terrain, such as a wall or the pillar his Q leaves for 4 s; without terrain it is a damaging dash.",
        basedOn: ["Ornn.E", "Ornn.Q"],
      },
      {
        text: "During Bellows Breath's 0.75 s march Ornn cannot attack or cast his other abilities, and he cannot act for 0.5 s after Searing Charge's dash, or during his R recast dash and for 0.5 s after it.",
        basedOn: ["Ornn.W", "Ornn.E", "Ornn.R"],
      },
      {
        text: "Ornn's passive raises his bonus health, armour and magic resistance by 10%, and by up to 30% with Masterwork upgrades from level 13. Gwen's passive deals magic damage based on his maximum health, and half of each Q snip's centre damage is true damage.",
        basedOn: ["Ornn.P", "Gwen.P", "Gwen.Q"],
      },
    ],
  },
  interactions: [
    { text: "Ornn's attack on a Brittle Gwen knocks her back a short way and ends Brittle.", abilities: ["Ornn.P"], source: "ornn-p" },
    { text: "Damage from Gwen interrupts Ornn's 4 s forge channel, which lets him buy items away from the shop.", abilities: ["Ornn.P"], source: "ornn-p" },
  ],
};

export default notes;
