import { describe, expect, it } from "vitest";
import { KIND_GROUPS, RIOT_TEXT_KINDS, type UnknownCooldownReason } from "@/domain/matchup-intel/types";
import { estimateWord, refusedWords } from "@/domain/matchup-intel/refused-words";
import {
  UNKNOWN_WORDS,
  abilityAnchor,
  abilityName,
  announcementWords,
  changedAbilitiesWords,
  cooldownLines,
  cooldownSourceWords,
  cooldownWords,
  dataSourceWords,
  expiredBriefingWords,
  expiredInteractionsWords,
  expiredNotesWords,
  flaggedNotesWords,
  freshnessWords,
  generalReferenceWords,
  hiddenBriefingWords,
  hiddenInteractionsWords,
  hiddenPartWords,
  hiddenPointsWords,
  listWords,
  missingAbilitiesWords,
  modifierWords,
  notRecheckedWords,
  recastWords,
  revisionWords,
  staleDataWords,
  subjectWords,
  ASSEMBLED_TITLE,
  CONDITIONAL_WORDS,
  DIFFER_NEITHER_WORDS,
  DIFFER_WORDS,
  KIND_GROUP_WORDS,
  NO_ABILITY_FACTS_WORDS,
  NO_INTERACTIONS_WORDS,
  RIOT_TEXT_KIND_WORDS,
  RIOT_TEXT_LABEL,
  alsoDescribedWords,
  assembledWords,
  conditionalNoteWords,
  dangerSideWords,
  hiddenRiotTextWords,
  moreWords,
  noFactsWords,
  noLevelNotesWords,
  noneOutsideHiddenWords,
  noneRecordedWords,
  differSideWords,
  qualifierChipWords,
  qualifierWords,
  riotTextProcessWords,
  riotTextReviewedWords,
  riotTextSourceWords,
  tightCooldownWords,
  toolsSideWords,
  ASSEMBLED_IN_PLACE_WORDS,
  CHECKED_NOTES_LABEL,
  RIOT_TEXT_NO_NUMBERS_WORDS,
  briefingHiddenAboveWords,
  cooldownsFromWords,
  hiddenPartsBarWords,
  noBriefingWords,
} from "./wording";

describe("the cooldown line", () => {
  it("writes a base cooldown per rank, and the same value once", () => {
    expect(cooldownWords({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: null, from: "ddragon" })).toEqual({ value: "18 / 17 / 16 / 15 / 14\u00a0s", notes: [], known: true });
    expect(cooldownWords({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: null, from: "ddragon" }).value).toBe("13\u00a0s at every rank");
  });

  it("says when a cooldown starts only when a source says so, and never the ordinary on cast", () => {
    expect(cooldownWords({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast", from: "curated" }).notes).toEqual(["starts after the first cast"]);
    expect(cooldownWords({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "on-cast", from: "curated" }).notes).toEqual([]);
    expect(cooldownWords({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "curated" }).notes).toEqual([]);
    expect(cooldownWords({ kind: "per-rank", seconds: [20, 18, 16, 14, 12], starts: "after-effect-ends", from: "curated" }).notes).toEqual(["starts when the effect ends"]);
    expect(cooldownWords({ kind: "per-rank", seconds: [20, 18, 16, 14, 12], starts: "after-last-recast", from: "curated" }).notes).toEqual(["starts after the last recast"]);
    expect(cooldownWords({ kind: "per-rank", seconds: [20, 18, 16, 14, 12], starts: "after-channel", from: "curated" }).notes).toEqual(["starts after the channel"]);
  });

  it("says a static cooldown is unaffected by ability haste", () => {
    expect(cooldownWords({ kind: "per-rank", seconds: [11], starts: null, from: "curated" }, { static: true })).toEqual({ value: "11\u00a0s", notes: ["unaffected by ability haste"], known: true });
  });

  it("gives charges, one count or one per rank, with their recharge", () => {
    expect(cooldownWords({ kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] })).toEqual({ value: "3 / 4 / 5\u00a0charges", notes: ["one back every 35 / 30 / 25\u00a0s"], known: true });
    expect(cooldownWords({ kind: "charges", charges: [2], recharge: [20] })).toEqual({ value: "2\u00a0charges", notes: ["one back every 20\u00a0s"], known: true });
    expect(cooldownWords({ kind: "charges", charges: [1], recharge: [12, 12, 12] }).value).toBe("1\u00a0charge");
    expect(cooldownWords({ kind: "charges", charges: [3, 3, 3, 3, 3], recharge: [17, 16, 15, 14, 13] })).toEqual({ value: "3\u00a0charges", notes: ["one back every 17 / 16 / 15 / 14 / 13\u00a0s"], known: true });
  });

  it("gives a passive's own cooldown by level or rank, per target, static, with its start", () => {
    const passive = { kind: "passive" as const, levels: null, perTarget: false, static: false, starts: null };
    expect(cooldownWords({ ...passive, seconds: [12, 9, 6], scalesWith: "level", levels: [1, 7, 13] })).toEqual({ value: "12 / 9 / 6\u00a0s", notes: ["at levels 1 / 7 / 13"], known: true });
    expect(cooldownWords({ ...passive, seconds: [10], scalesWith: "none" })).toEqual({ value: "10\u00a0s", notes: [], known: true });
    expect(cooldownWords({ ...passive, seconds: [30, 25, 20], scalesWith: "rank" })).toEqual({ value: "30 / 25 / 20\u00a0s", notes: ["by its rank"], known: true });
    expect(cooldownWords({ ...passive, seconds: [6, 6, 6], scalesWith: "level", levels: [1, 6, 11] }).value).toBe("6\u00a0s at every level");
    // Zed's: 10 s for each target, static. Shen's: 11 s, static, from when he gains the shield.
    expect(cooldownWords({ ...passive, seconds: [10], scalesWith: "none", perTarget: true, static: true })).toEqual({ value: "10\u00a0s", notes: ["per target", "unaffected by ability haste"], known: true });
    expect(cooldownWords({ ...passive, seconds: [11], scalesWith: "none", static: true, starts: "on-trigger" }).notes).toEqual(["unaffected by ability haste", "starts when it takes effect"]);
    expect(cooldownWords({ ...passive, seconds: [8], scalesWith: "none", starts: "after-effect-ends" }).notes).toEqual(["starts when the effect ends"]);
  });

  it("writes one line per form, each with its own cooldown", () => {
    const forms = cooldownLines({
      kind: "forms",
      forms: [
        { name: "Mercury Hammer", cooldown: { kind: "per-rank", seconds: [16, 14, 12, 10, 8, 6], starts: null, from: "curated" } },
        { name: "Mercury Cannon", cooldown: { kind: "per-rank", seconds: [8, 8, 8, 8, 8, 8], starts: "after-effect-ends", from: "curated" } },
        { name: "Transform", cooldown: { kind: "none" } },
      ],
    });
    expect(forms).toEqual([
      { form: "Mercury Hammer", value: "16 / 14 / 12 / 10 / 8 / 6\u00a0s", notes: [], known: true },
      { form: "Mercury Cannon", value: "8\u00a0s at every rank", notes: ["starts when the effect ends"], known: true },
      { form: "Transform", value: "No cooldown", notes: [], known: true },
    ]);
    expect(cooldownWords({ kind: "forms", forms: [{ name: "Hammer", cooldown: { kind: "none" } }, { name: "Cannon", cooldown: { kind: "charges", charges: [2], recharge: [8] } }] })).toEqual({ value: "Hammer: No cooldown; Cannon: 2\u00a0charges · one back every 8\u00a0s", notes: [], known: true });
    expect(cooldownLines({ kind: "none" })).toEqual([{ form: null, value: "No cooldown", notes: [], known: true }]);
  });

  it("says plainly why there is no number, for every reason, never a guess", () => {
    const reasons: UnknownCooldownReason[] = ["passive-not-in-ddragon", "charges-in-ddragon", "no-number-in-ddragon", "two-abilities-in-ddragon", "ranks-mismatch-in-ddragon", "known-wrong-in-ddragon", "several-abilities-in-ddragon", "picked-up-spell-in-ddragon", "unreadable", "no-data"];
    for (const reason of reasons) {
      const w = cooldownWords({ kind: "unknown", reason });
      expect(w.known, reason).toBe(false);
      expect(w.value, reason).toBe(UNKNOWN_WORDS[reason]);
      expect(w.value, reason).not.toMatch(/\d/);
    }
    expect(UNKNOWN_WORDS).toEqual({
      "passive-not-in-ddragon": "Cooldown not in Riot's data",
      "charges-in-ddragon": "Riot's data lists charges but not their recharge",
      "no-number-in-ddragon": "No cooldown number in Riot's data",
      "two-abilities-in-ddragon": "Two abilities share this slot in Riot's data",
      "ranks-mismatch-in-ddragon": "Riot's data doesn't give one number per rank",
      "known-wrong-in-ddragon": "Riot's number for this ability is known to be wrong",
      "several-abilities-in-ddragon": "Several abilities share this slot in Riot's data",
      "picked-up-spell-in-ddragon": "This slot casts spells picked up in a game",
      unreadable: "Riot's cooldown data can't be read",
      "no-data": "No cooldown data held yet",
    });
    expect(cooldownWords({ kind: "none" })).toEqual({ value: "No cooldown", notes: [], known: true });
    // Numbers that are not numbers are a dash, not a number.
    expect(cooldownWords({ kind: "per-rank", seconds: [], starts: null, from: "curated" })).toEqual({ value: "—", notes: [], known: false });
    expect(cooldownWords({ kind: "per-rank", seconds: [8, Number.NaN], starts: null, from: "ddragon" })).toEqual({ value: "—", notes: [], known: false });
    expect(cooldownWords({ kind: "charges", charges: [], recharge: [] })).toEqual({ value: "—", notes: [], known: false });
  });
});

describe("where a line comes from", () => {
  const at = (freshness: "current" | "unchanged-since" | "changed-since" | null) => ({ freshness, checkedPatch: freshness ? "26.22" : null, dataPatch: "26.23" });
  it("tells checked notes apart from Riot's own data and from Riot's newer data", () => {
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [8], starts: null, from: "curated" }, at("current"))).toBe("Checked on patch 26.22");
    expect(cooldownSourceWords({ kind: "charges", charges: [2], recharge: [20] }, at("unchanged-since"))).toBe("Checked on patch 26.22");
    expect(cooldownSourceWords({ kind: "none" }, at("current"))).toBe("Checked on patch 26.22");
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [8], starts: null, from: "ddragon" }, at(null))).toBe("Riot's data, not reviewed");
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [9], starts: null, from: "ddragon" }, at("changed-since"))).toBe("Riot's data for patch 26.23, not re-checked");
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [9], starts: null, from: "ddragon" }, { freshness: "changed-since", checkedPatch: "26.22", dataPatch: null })).toBe("Riot's data, not re-checked");
    // Notes that state no cooldown spec say no more than Riot's data: its numbers are not reviewed.
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [8], starts: null, from: "ddragon" }, at("current"))).toBe("Riot's data, not reviewed");
  });

  it("says 'not reviewed' under a line without a number where nobody has checked it, and nothing where nothing is held", () => {
    expect(cooldownSourceWords({ kind: "unknown", reason: "charges-in-ddragon" }, at(null))).toBe("Not reviewed");
    expect(cooldownSourceWords({ kind: "unknown", reason: "passive-not-in-ddragon" }, at("current"))).toBeNull();
    expect(cooldownSourceWords({ kind: "unknown", reason: "two-abilities-in-ddragon" }, at("changed-since"))).toBe("Not re-checked");
    expect(cooldownSourceWords({ kind: "unknown", reason: "no-data" }, at(null))).toBeNull();
  });
});

describe("modifiers, flags and hidden points", () => {
  it("writes the wait between casts, refunds and attack resets, each on a line", () => {
    expect(modifierWords({ lockout: { seconds: 0.3125, static: true }, resetsAttack: true })).toEqual(["0.3125\u00a0s between casts, unaffected by ability haste", "Resets the basic-attack timer"]);
    expect(modifierWords({ refund: { unit: "percent", amount: [25, 35, 45, 55, 65], when: "her first attack within 4 seconds" } })).toEqual(["Refunds 25 / 35 / 45 / 55 / 65%\u00a0of the cooldown: her first attack within 4 seconds"]);
    expect(modifierWords({ refund: { unit: "seconds", amount: [2], when: "each hit on a champion" }, lockout: { seconds: 0.5 } })).toEqual(["0.5\u00a0s between casts", "Refunds 2\u00a0s of the cooldown: each hit on a champion"]);
    // A static cooldown is said on the line itself, not here.
    expect(modifierWords({ static: true })).toEqual([]);
    expect(modifierWords(null)).toEqual([]);
  });

  it("flags notes once Riot's data moved, saying what moved", () => {
    expect(flaggedNotesWords("26.22", ["cooldown"])).toBe("Notes from patch 26.22 · may be out of date: Riot changed its cooldown since");
    expect(flaggedNotesWords("26.22", ["id", "name", "cooldown"])).toBe("Notes from patch 26.22 · may be out of date: Riot changed its spell id, name and cooldown since");
    expect(flaggedNotesWords(null, [])).toBe("These notes · may be out of date");
    expect(changedAbilitiesWords(1)).toBe("Riot changed one ability after the check: its notes are flagged");
    expect(changedAbilitiesWords(3)).toBe("Riot changed three abilities after the check: their notes are flagged");
  });

  it("names what a hidden point rests on, never hiding it silently", () => {
    expect(hiddenPointsWords(1, ["Renekton W"])).toBe("One point is hidden: Riot changed Renekton W after this briefing was checked.");
    expect(hiddenPointsWords(2, ["Renekton W", "Renekton E"])).toBe("Two points are hidden: Riot changed Renekton W and Renekton E after this briefing was checked.");
    expect(hiddenPartWords(["Renekton W"])).toBe("Hidden: Riot changed Renekton W after this briefing was checked.");
    expect(hiddenBriefingWords(["Renekton passive", "Renekton W", "Ambessa R"])).toBe("This briefing is hidden: Riot changed Renekton passive, Renekton W and Ambessa R after it was checked.");
    expect(hiddenInteractionsWords(1, ["Renekton W"])).toBe("One interaction is hidden: Riot changed Renekton W after it was checked.");
    expect(hiddenInteractionsWords(12, ["Renekton W"])).toBe("12 interactions are hidden: Riot changed Renekton W after they were checked.");
    expect(hiddenPartWords([])).toBe("Hidden: Riot changed an ability it rests on after this briefing was checked.");
    expect(listWords([])).toBe("");
  });
});

describe("the rest of the page's words", () => {
  it("names recasts, abilities and their rows", () => {
    expect(recastWords({ count: 2, windowSeconds: 4, note: "" })).toBe("Can be cast 2\u00a0more times within 4\u00a0s");
    expect(recastWords({ count: 1, note: "" })).toBe("Can be cast again");
    expect(abilityName("Renekton", "W")).toBe("Renekton W");
    expect(abilityName("Riven", "P")).toBe("Riven passive");
    expect(abilityAnchor("Renekton", "W")).toBe("ability-Renekton-W");
  });

  it("says who has an effect only where its kind would not say it", () => {
    expect(subjectWords("crowd-control", "target", "Mordekaiser")).toBeNull();
    expect(subjectWords("crowd-control", "self", "Mordekaiser")).toBe("on Mordekaiser");
    expect(subjectWords("crowd-control", "area", "Ornn")).toBe("in an area");
    expect(subjectWords("sustain", "self", "Mordekaiser")).toBeNull();
    expect(subjectWords("defence", "allies", "Shen")).toBe("on allies");
    expect(subjectWords("interaction", "target", "Mordekaiser")).toBe("on the target");
    expect(subjectWords("empowerment", "self", "Riven")).toBeNull();
    expect(subjectWords("damage", null, "Riven")).toBeNull();
  });

  it("says a wiki page's revision by its day, and nothing for a time it cannot read", () => {
    expect(revisionWords("2026-09-23T19:37:45Z")).toBe("revision of 23 Sep 2026");
    for (const bad of [null, undefined, "", "yesterday", "2026-13-01T00:00:00Z"]) expect(revisionWords(bad), String(bad)).toBeNull();
  });

  it("says when notes were checked, and warns only when Riot's data moved after the check", () => {
    expect(freshnessWords("current", "26.22")).toEqual({ checked: "Checked on patch 26.22", warning: null });
    expect(freshnessWords("unchanged-since", "26.21")).toEqual({ checked: "Checked on patch 26.21", warning: null });
    expect(freshnessWords("changed-since", "26.21")).toEqual({ checked: "Checked on patch 26.21", warning: "Riot changed abilities this rests on after the check: may be out of date" });
  });
});

describe("a check a patch or more behind, and data that is old, an offline copy or missing", () => {
  it("says a checked line has not been re-checked for a later patch, and nothing of the kind under Riot's own data", () => {
    const at = { freshness: "unchanged-since" as const, checkedPatch: "26.22", dataPatch: "26.23", notRecheckedFor: "26.23" };
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [8], starts: null, from: "curated" }, at)).toBe("Checked on patch 26.22 · not re-checked for 26.23");
    expect(cooldownSourceWords({ kind: "none" }, { ...at, checkedPatch: null })).toBe("Checked · not re-checked for 26.23");
    expect(cooldownSourceWords({ kind: "per-rank", seconds: [8], starts: null, from: "ddragon" }, { ...at, freshness: null })).toBe("Riot's data, not reviewed");
    expect(notRecheckedWords("26.23")).toBe("Not re-checked for 26.23");
  });

  it("says how long ago a check too old to show was, and what it hides", () => {
    expect(expiredNotesWords(3)).toBe("Checked three patches ago: may be out of date");
    expect(expiredNotesWords(12)).toBe("Checked 12 patches ago: may be out of date");
    expect(expiredBriefingWords("26.22", 3)).toBe("This briefing is hidden: it was checked on patch 26.22, three patches ago, and not since. It shows again once a person checks it.");
    expect(expiredInteractionsWords(1, "26.22", 3)).toBe("One interaction is hidden: it was checked on patch 26.22, three patches ago, with the briefing.");
    expect(expiredInteractionsWords(2, "26.22", 4)).toBe("Two interactions are hidden: they were checked on patch 26.22, four patches ago, with the briefing.");
  });

  it("names whose ability data is older than the game's patch, unless it is all of it", () => {
    const tail = "the game is on patch 26.23. The next game-data update reads it from Riot again.";
    expect(staleDataWords([{ name: "Riven", patch: "26.22" }], "26.23", false)).toBe(`Riven's ability data is from patch 26.22; ${tail}`);
    expect(staleDataWords([{ name: "Riven", patch: "26.22" }], "26.23", true)).toBe(`The ability data held here is from patch 26.22; ${tail}`);
    expect(staleDataWords([{ name: "Riven", patch: "26.22" }, { name: "Mordekaiser", patch: "26.22" }], "26.23", true)).toBe(`The ability data held here is from patch 26.22; ${tail}`);
    expect(staleDataWords([{ name: "Riven", patch: "26.21" }, { name: "Mordekaiser", patch: "26.22" }], "26.23", true)).toBe(`Riven's ability data is from patch 26.21 and Mordekaiser's from 26.22; ${tail}`);
    expect(staleDataWords([], "26.23", true)).toBe("");
  });

  it("names an offline copy as one, and says what is missing plainly: none stored, or a copy that cannot be read", () => {
    expect(dataSourceWords("16.22.1", false)).toBe("Riot Data Dragon 16.22.1");
    expect(dataSourceWords("16.22.1", true)).toBe("an offline copy of Riot Data Dragon 16.22.1");
    expect(dataSourceWords("16.22.1", true, true)).toBe("Offline copy of Riot Data Dragon 16.22.1");
    expect(missingAbilitiesWords("Riven", false)).toEqual({ title: "Ability details aren't stored yet", body: "Riven's abilities are read from Riot's Data Dragon once per game version, and none are stored yet." });
    expect(missingAbilitiesWords("Riven", true).title).toBe("Riot's ability data for Riven could not be read");
  });

  it("names only what the general reference holds where no briefing exists: checked notes only where there are some", () => {
    expect(generalReferenceWords("Renekton", { abilities: true, notes: true })).toBe("What follows is the general reference for Renekton: abilities, base cooldowns and checked notes.");
    expect(generalReferenceWords("Darius", { abilities: true, notes: false })).toBe("What follows is the general reference for Darius: abilities and base cooldowns from Riot's data.");
    // No abilities stored (or none readable): the panel below says why, and this claims none.
    expect(generalReferenceWords("Darius", { abilities: false, notes: false })).toBe("What follows is the general reference for Darius.");
    expect(generalReferenceWords("Renekton", { abilities: false, notes: true })).toBe("What follows is the general reference for Renekton.");
    for (const abilities of [true, false]) expect(generalReferenceWords("Darius", { abilities, notes: false })).not.toMatch(/notes/);
  });

  it("tells a screen reader what arrived after a choice", () => {
    const c = (id: string) => ({ id, name: id, title: "", portrait: "" });
    const matchup = { verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" } } as Parameters<typeof announcementWords>[0]["matchup"];
    expect(announcementWords({ you: c("Riven"), enemy: c("Mordekaiser"), matchup }, true)).toBe("Riven vs Mordekaiser: curated briefing, checked on patch 26.22. Mordekaiser's abilities follow.");
    expect(announcementWords({ you: c("Riven"), enemy: c("Mordekaiser"), matchup }, false)).toBe("Riven vs Mordekaiser: the curated briefing is hidden; an assembled reference from each champion's own facts follows. Mordekaiser's abilities follow.");
    expect(announcementWords({ you: c("Garen"), enemy: c("Darius"), matchup: null }, false)).toBe("No curated briefing for Garen vs Darius yet: an assembled reference from each champion's own facts, which no person has checked as a pair. Darius's abilities follow.");
    expect(announcementWords({ you: c("Riven"), enemy: null, matchup: null }, false)).toBe("Playing Riven: now choose the enemy.");
    expect(announcementWords({ you: null, enemy: c("Darius"), matchup: null }, false)).toBe("Darius's abilities and base cooldowns.");
    expect(announcementWords({ you: null, enemy: null, matchup: null }, false)).toBe("Choose your champion and the enemy.");
  });
});

describe("the assembled reference's fixed sentences and labels", () => {
  // Every fixed sentence the page may show for a pair with no curated briefing, with neutral names.
  const sentences = [
    ASSEMBLED_TITLE,
    assembledWords("Riven", "Darius"),
    noFactsWords("Darius"),
    noneRecordedWords("checked"),
    noneRecordedWords("riot-text"),
    noneOutsideHiddenWords(["R"]),
    hiddenRiotTextWords(1, "changed", "W"),
    hiddenRiotTextWords(3, "renamed", "R"),
    hiddenRiotTextWords(2, "unknown", "Q"),
    noLevelNotesWords(["Darius", "Riven"]),
    NO_INTERACTIONS_WORDS,
    dangerSideWords("Darius"),
    toolsSideWords("Riven"),
    RIOT_TEXT_LABEL,
    riotTextSourceWords("tooltip", "Apprehend"),
    riotTextSourceWords("description", "Apprehend"),
    riotTextReviewedWords("26.22", "2026-11-18"),
    CONDITIONAL_WORDS,
    conditionalNoteWords(["stun", "pull"]),
    DIFFER_WORDS,
    DIFFER_NEITHER_WORDS,
    NO_ABILITY_FACTS_WORDS,
    qualifierWords("stun", "Mega Gnar", undefined, "Hyper / Wallop"),
    qualifierWords("cooldownrefund", "Mantra", "tooltip", "Gathering Fire"),
    qualifierChipWords("stun", "Mega Gnar"),
    qualifierChipWords("cooldownrefund", "Mantra"),
    alsoDescribedWords("leap", "description"),
    differSideWords("pull", "description", "Fate Sealed"),
    differSideWords("knockup", "tooltip", "Fate Sealed"),
    riotTextProcessWords({ automatedReviewers: 2, adjudicated: true, consistencyCheckers: 2, checkedByPerson: false }),
    hiddenRiotTextWords(2, "changed", "R", 1),
    hiddenRiotTextWords(0, "renamed", "R", 1),
    moreWords(2),
    ...Object.values(KIND_GROUP_WORDS),
    ...Object.values(RIOT_TEXT_KIND_WORDS),
    announcementWords({ you: { id: "Riven", name: "Riven", title: "", portrait: "" }, enemy: { id: "Darius", name: "Darius", title: "", portrait: "" }, matchup: null }, false),
  ];

  it("never instructs, judges or claims too much (REFUSED_WORDS), never estimates, and never says verified", () => {
    for (const text of sentences) {
      expect(refusedWords(text), text).toEqual([]);
      expect(estimateWord(text), text).toBeNull();
      expect(text, text).not.toMatch(/verif/i);
    }
  });

  it("says every time that the reference was put together from each champion's facts and that no person checked the pair", () => {
    expect(assembledWords("Riven", "Darius")).toBe("Put together from each champion's own facts. No person has checked Riven vs Darius as a pair.");
    expect(ASSEMBLED_TITLE).not.toMatch(/briefing/i);
  });

  it("labels facts from Riot's text in the owner's words", () => {
    expect(RIOT_TEXT_LABEL).toBe("From Riot's ability text, reviewed automatically (not by a person)");
    expect(riotTextReviewedWords("26.22", "2026-11-18")).toBe("Reviewed against Riot's text of patch 26.22, on 18 Nov 2026");
  });

  it("says what is missing in words, never a bare none: no reviewed fact, which says nothing of what an ability does", () => {
    expect(noneRecordedWords("riot-text")).toBe("No reviewed facts of this kind");
    expect(NO_ABILITY_FACTS_WORDS).toBe("No reviewed facts for this ability");
    for (const words of [noneRecordedWords("riot-text"), NO_ABILITY_FACTS_WORDS, noneOutsideHiddenWords(["R"])]) expect(words, words).not.toMatch(/\bnone\b|recorded in Riot's text/i);
    // Beside hidden facts, only what holds outside them: a hidden fact may be of the group's kind.
    expect(noneOutsideHiddenWords(["R"])).toBe("No reviewed facts of this kind outside R");
    expect(noneOutsideHiddenWords(["Passive", "W"])).toBe("No reviewed facts of this kind outside Passive and W");
    expect(noFactsWords("Darius")).toBe("No reviewed facts for Darius yet: crowd control, mobility, defence and sustain are not recorded.");
    expect(noLevelNotesWords(["Darius", "Riven"])).toBe("No level changes recorded for Darius or Riven.");
    expect(noLevelNotesWords(["Darius"])).toBe("No level changes recorded for Darius.");
    expect(hiddenRiotTextWords(1, "changed", "W")).toBe("Riot's text for W changed after the review: its fact is hidden.");
    expect(hiddenRiotTextWords(3, "changed", "W")).toBe("Riot's text for W changed after the review: its 3 facts are hidden.");
  });

  it("says what a fact from Riot's text holds only with, in Riot's words, and the marker in the owner's words, never a condition of its own", () => {
    expect(CONDITIONAL_WORDS).toBe("Conditional: see Riot's text");
    // Under an ability's chips, once, naming the chips it marks by their own words.
    expect(conditionalNoteWords(["slow"])).toBe("Conditional: see Riot's text (Slow)");
    expect(conditionalNoteWords(["stun", "pull"])).toBe("Conditional: see Riot's text (Stun and Pull)");
    expect(conditionalNoteWords(["knockback", "stun", "cooldownrefund"])).toBe("Conditional: see Riot's text (Knock-back, Stun and Cooldown refund)");
    // On the chip, after the kind's word: the qualifier quoted; on a cooldown refund, the abilities whose cooldown it cuts.
    expect(qualifierChipWords("stun", "Mega Gnar")).toBe(" · “Mega Gnar”");
    expect(qualifierChipWords("cooldownrefund", "his other basic abilities")).toBe(" of “his other basic abilities”");
    // In a tip and the details: the qualifier's line, and which text it is from where that is not the clause's.
    expect(qualifierWords("stun", "Mega Gnar", undefined, "Hyper / Wallop")).toBe("Riot adds “Mega Gnar”");
    expect(qualifierWords("dash", "If the lance connects with Demacian Standard", "tooltip", "Dragon Strike")).toBe("Riot adds “If the lance connects with Demacian Standard” (Riot's tooltip for Dragon Strike)");
    expect(qualifierWords("cooldownrefund", "Mantra", undefined, "Gathering Fire")).toBe("Cuts the cooldown of “Mantra”");
    expect(alsoDescribedWords("leap", "description")).toBe("Riot's description calls it leap");
    expect(alsoDescribedWords("knockup", "description")).toBe("Riot's description calls it knock-up");
  });

  it("says where Riot's two texts differ, both sides alike, picking neither", () => {
    expect(DIFFER_WORDS).toBe("Riot's texts differ");
    expect(differSideWords("pull", "description", "Fate Sealed")).toBe("Pull, in Riot's description of Fate Sealed");
    expect(differSideWords("knockup", "tooltip", "Fate Sealed")).toBe("Knock-up, in Riot's tooltip for Fate Sealed");
    expect(DIFFER_NEITHER_WORDS).toBe("Neither is shown as a fact.");
    expect(hiddenRiotTextWords(2, "changed", "R", 1)).toBe("Riot's text for R changed after the review: its 2 facts and the note that Riot's texts differ are hidden.");
    expect(hiddenRiotTextWords(1, "changed", "R", 1)).toBe("Riot's text for R changed after the review: its fact and the note that Riot's texts differ are hidden.");
    expect(hiddenRiotTextWords(0, "renamed", "R", 1)).toBe("Riot renamed R after the review: the note that Riot's texts differ is hidden.");
    expect(hiddenRiotTextWords(0, "unknown", "R", 2)).toBe("Whether Riot's text for R changed since the review is not known yet: the notes that Riot's texts differ are hidden.");
  });

  it("says how the facts were reviewed from the review record (added for the import from the review's own sentence), and that no person checked them, never that each was drafted by the rules", () => {
    expect(riotTextProcessWords({ automatedReviewers: 2, adjudicated: true, consistencyCheckers: 2, checkedByPerson: false })).toBe(
      "Reviewed by two independent automated reviewers and an adjudicator, then a consistency pass checked by two more independent automated checkers; no person has checked them.",
    );
    expect(riotTextProcessWords({ automatedReviewers: 1, adjudicated: false, consistencyCheckers: 0, checkedByPerson: false })).toBe("Reviewed by one independent automated reviewer; no person has checked them.");
    expect(riotTextProcessWords({ automatedReviewers: 3, adjudicated: true, consistencyCheckers: 1, checkedByPerson: false })).toBe("Reviewed by three independent automated reviewers and an adjudicator, then a consistency pass checked by one more independent automated checker; no person has checked them.");
    // Some facts came in as a reviewer's addition or with the consistency pass: no "each was drafted".
    for (const r of [{ automatedReviewers: 2, adjudicated: true, consistencyCheckers: 2, checkedByPerson: false }, { automatedReviewers: 1, adjudicated: false, consistencyCheckers: 0, checkedByPerson: false }]) expect(riotTextProcessWords(r)).not.toMatch(/drafted|each/i);
    expect(RIOT_TEXT_NO_NUMBERS_WORDS).toBe("No number in that text is used for these facts.");
  });

  it("above the assembled reference: no curated briefing yet, or the curated briefing hidden above, never both", () => {
    expect(noBriefingWords("Riven", "Darius")).toBe("No curated briefing for Riven vs Darius yet.");
    expect(briefingHiddenAboveWords("Ambessa", "Renekton")).toBe("The curated briefing for Ambessa vs Renekton is hidden, above.");
    expect(briefingHiddenAboveWords("Ambessa", "Renekton")).not.toMatch(/No curated briefing|yet/);
    expect(ASSEMBLED_IN_PLACE_WORDS).toBe("Put together from each champion's own facts in its place. No person has checked them as a pair.");
    expect(assembledWords("Riven", "Darius")).toBe("Put together from each champion's own facts. No person has checked Riven vs Darius as a pair.");
  });

  it("the bar's warning for parts hidden because Riot changed what they rest on, by count, or the briefing as a whole", () => {
    expect(hiddenPartsBarWords(1, false)).toBe("Changed since the check: one part hidden");
    expect(hiddenPartsBarWords(3, false)).toBe("Changed since the check: three parts hidden");
    expect(hiddenPartsBarWords(12, false)).toBe("Changed since the check: 12 parts hidden");
    expect(hiddenPartsBarWords(5, true)).toBe("Changed since the check: the briefing is hidden");
  });

  it("names who checked the checked notes, as the facts from Riot's text say who reviewed them; a side's or a panel's cooldowns said once", () => {
    expect(CHECKED_NOTES_LABEL).toBe("Checked notes (drafted and audited by AI agents, not by a person)");
    expect(CHECKED_NOTES_LABEL).not.toMatch(/verified/i);
    expect(cooldownsFromWords("Riot's data, not reviewed")).toBe("Cooldowns: Riot's data, not reviewed");
  });

  it("names every kind and every group", () => {
    for (const k of RIOT_TEXT_KINDS) expect(RIOT_TEXT_KIND_WORDS[k], k).toMatch(/^[A-Z]/);
    for (const g of KIND_GROUPS) expect(KIND_GROUP_WORDS[g], g).toMatch(/^[A-Z]/);
  });

  it("writes a grouped fact's cooldown tight, only where it is one number per rank", () => {
    expect(tightCooldownWords({ kind: "per-rank", seconds: [24, 21, 18, 15, 12], starts: null, from: "ddragon" })).toBe("24/21/18/15/12\u00a0s");
    expect(tightCooldownWords({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: null, from: "ddragon" })).toBe("13\u00a0s at every rank");
    expect(tightCooldownWords({ kind: "unknown", reason: "passive-not-in-ddragon" })).toBeNull();
    expect(tightCooldownWords({ kind: "charges", charges: [3], recharge: [30] })).toBeNull();
  });
});
