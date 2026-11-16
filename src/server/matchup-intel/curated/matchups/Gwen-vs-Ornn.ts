import type { MatchupNotes } from "@/domain/matchup-intel/types";

/*
  Gwen against Ornn (this direction only): curated matchup notes (Layer 2), checked on 16 Nov 2026
  against patch 26.22. Every point rests on mechanics the two champions' wiki ability pages state
  (the same revisions as their champion notes, CC BY-SA 3.0) and names the abilities it rests on.
  None is a win rate, a tier, a guess or an instruction on how to play.

  Left out because no saved page states it:
  - whether Hallowed Mist keeps out Ornn's ultimate elemental when Ornn is outside the mist (the
    page covers enemies and their pets, and does not say which the elemental counts as);
  - whether slowing Ornn with Needlework can stop Bellows Breath's lunge (that would rest on
    arithmetic and an estimated movement-speed threshold, not a stated interaction);
  - how Ornn's knock-ups meet Gwen's E dash (only implied by a field on her page).
*/

const notes: MatchupNotes = {
  championId: "Gwen",
  vsId: "Ornn",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "gwen-p", title: "League of Legends Wiki: Template:Data Gwen/A Thousand Cuts", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/A_Thousand_Cuts", revision: 4081720, licence: "CC BY-SA 3.0" },
    { id: "gwen-q", title: "League of Legends Wiki: Template:Data Gwen/Snip Snip!", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Snip_Snip!", revision: 4026398, licence: "CC BY-SA 3.0" },
    { id: "gwen-w", title: "League of Legends Wiki: Template:Data Gwen/Hallowed Mist", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Gwen/Hallowed_Mist", revision: 3973613, licence: "CC BY-SA 3.0" },
    { id: "ornn-p", title: "League of Legends Wiki: Template:Data Ornn/Living Forge", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Living_Forge", revision: 4089066, licence: "CC BY-SA 3.0" },
    { id: "ornn-q", title: "League of Legends Wiki: Template:Data Ornn/Volcanic Rupture", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Volcanic_Rupture", revision: 3998234, licence: "CC BY-SA 3.0" },
    { id: "ornn-w", title: "League of Legends Wiki: Template:Data Ornn/Bellows Breath", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Bellows_Breath", revision: 4011962, licence: "CC BY-SA 3.0" },
    { id: "ornn-e", title: "League of Legends Wiki: Template:Data Ornn/Searing Charge", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Searing_Charge", revision: 4007982, licence: "CC BY-SA 3.0" },
    { id: "ornn-r", title: "League of Legends Wiki: Template:Data Ornn/Call of the Forge God", url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Ornn/Call_of_the_Forge_God", revision: 4007985, licence: "CC BY-SA 3.0" },
  ],
  briefing: {
    threat: {
      text: "If Bellows Breath's final burst hits Gwen, she is Brittle for 3 s. A stun from Ornn's E shockwave (1.25 s) or his R's second pass (1 s) then spends it: with no tenacity the stun lasts 1.625 s or 1.3 s, and she takes magic damage of 9% (at his level 1) to 17% (at level 18) of her maximum health.",
      basedOn: ["Ornn.W", "Ornn.P", "Ornn.E", "Ornn.R"],
    },
    opportunity: {
      text: "While Gwen is inside Hallowed Mist, Ornn cannot target her from outside it. The mist lasts 4 s, longer than the 3 s of Brittle from his W or R.",
      basedOn: ["Gwen.W", "Ornn.W", "Ornn.R"],
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
    { text: "While Gwen is Brittle, slows on her, such as Ornn's Q, also last longer, and they do not spend Brittle.", abilities: ["Ornn.P", "Ornn.Q"], source: "ornn-p" },
    { text: "Ornn's attack on a Brittle Gwen knocks her back a short way and ends Brittle, without its bonus damage.", abilities: ["Ornn.P"], source: "ornn-p" },
    { text: "Damage from Gwen interrupts Ornn's 4 s forge channel, which lets him buy items away from the shop.", abilities: ["Ornn.P"], source: "ornn-p" },
  ],
};

export default notes;
