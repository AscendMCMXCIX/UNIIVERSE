import { describe, expect, it } from "vitest";
import type { UnknownCooldownReason } from "@/domain/matchup-intel/types";
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
    expect(announcementWords({ you: c("Riven"), enemy: c("Mordekaiser"), matchup }, false)).toBe("Riven vs Mordekaiser: the curated briefing is hidden. Mordekaiser's abilities follow.");
    expect(announcementWords({ you: c("Garen"), enemy: c("Darius"), matchup: null }, false)).toBe("No curated briefing for Garen vs Darius yet. Darius's abilities follow.");
    expect(announcementWords({ you: c("Riven"), enemy: null, matchup: null }, false)).toBe("Playing Riven: now choose the enemy.");
    expect(announcementWords({ you: null, enemy: c("Darius"), matchup: null }, false)).toBe("Darius's abilities and base cooldowns.");
    expect(announcementWords({ you: null, enemy: null, matchup: null }, false)).toBe("Choose your champion and the enemy.");
  });
});
