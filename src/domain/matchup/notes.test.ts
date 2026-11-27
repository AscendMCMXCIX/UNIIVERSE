import { describe, expect, it } from "vitest";
import { MAX_POINT_WORDS, cleanNoteInput, noteFreshness, noteShown, patchesSince, scopeChampions, scopeName, scopeSentence, textProblems, validateNote, type NoteInput } from "./notes";

/* Matchup Intel's reviewed notes (docs/MATCHUP_INTEL.md, "Reviewed notes"): what a note may say, and when it shows. */

const ctx = { kits: { Darius: ["P", "Q", "W", "E", "R"], Riven: ["P", "Q", "W", "E", "R"] }, roster: new Set(["Darius", "Riven", "Ahri"]), names: ["Demo Mid", "SomeRiotName"] };
const note = (over: Partial<NoteInput> = {}): NoteInput => ({
  scope: "pair",
  role: "TOP",
  opponentId: "Darius",
  championId: "Riven",
  points: [{ text: "Darius's E pulls champions in front of him and slows them.", refs: ["Darius.E"], levels: "1-3" }],
  sources: [{ kind: "client", title: "Darius's E tooltip", url: "", patch: "26.23" }],
  ...over,
});
const fields = (n: NoteInput) => validateNote(n, ctx).map((p) => p.field);

describe("a note's content", () => {
  it("accepts an observation that names its abilities and cites a source", () => {
    expect(validateNote(note(), ctx)).toEqual([]);
    expect(validateNote(note({ scope: "opponent", championId: null, points: [{ text: "Darius's passive stacks bleed on each hit.", refs: ["Darius.P"], levels: null }] }), ctx)).toEqual([]);
  });

  it("refuses the refused words with the word and why, the estimate words, a Riot ID's tag and a member's name", () => {
    const say = (text: string) => validateNote(note({ points: [{ text, refs: ["Darius.E"], levels: null }] }), ctx).map((p) => p.message).join(" | ");
    expect(say("You should stay away from Darius's E.")).toMatch(/"you" is an instruction to the player/);
    expect(say("Riven is favoured early against the pull.")).toMatch(/"favoured" is a verdict on the matchup/);
    expect(say("Darius has the advantage at level 2.")).toMatch(/"advantage"/);
    expect(say("Riven can punish Darius when E is down.")).toMatch(/"punish"/);
    expect(say("The pull reaches roughly 535 units.")).toMatch(/"roughly" gives a value as an estimate/);
    expect(say("Played by Someone#EUW in the team.")).toMatch(/Riot ID/);
    expect(say("Demo Mid plays this lane.")).toMatch(/names a member or player/);
    expect(textProblems("The countdown of Wind Slash is encountered rarely.", [])).toEqual([]);
  });

  it("holds the points to 1–4, 35 words each, sentence case, plain text, and refs of the scope's stored abilities", () => {
    expect(fields(note({ points: [] }))).toContain("points");
    expect(fields(note({ points: Array.from({ length: 5 }, () => note().points[0]!) }))).toContain("points");
    expect(fields(note({ points: [{ text: Array.from({ length: MAX_POINT_WORDS + 1 }, () => "Word").join(" "), refs: ["Darius.E"], levels: null }] }))).toContain("points.0");
    expect(fields(note({ points: [{ text: "lowercase start of a point.", refs: ["Darius.E"], levels: null }] }))).toContain("points.0");
    expect(fields(note({ points: [{ text: "See https://example.com for it.", refs: ["Darius.E"], levels: null }] }))).toContain("points.0");
    expect(fields(note({ points: [{ text: "A point.", refs: [], levels: null }] }))).toContain("points.0.refs");
    expect(fields(note({ points: [{ text: "A point.", refs: ["Ahri.Q"], levels: null }] }))).toContain("points.0.refs");
    expect(fields(note({ scope: "opponent", championId: null, points: [{ text: "A point.", refs: ["Riven.Q"], levels: null }] }))).toContain("points.0.refs");
    expect(fields(note({ points: [{ text: "A point.", refs: ["Darius.X"], levels: null }] }))).toContain("points.0.refs");
  });

  it("needs a source with a kind, a title, a patch and an https address where one is given", () => {
    expect(fields(note({ sources: [] }))).toContain("sources");
    expect(fields(note({ sources: [{ kind: "wiki", title: "Darius", url: "http://wiki.example/Darius", patch: "26.23" }] }))).toContain("sources.0.url");
    expect(fields(note({ sources: [{ kind: "wiki", title: "Darius", url: "https://wiki.leagueoflegends.com/en-us/Darius", patch: "26.23" }] }))).toEqual([]);
    expect(fields(note({ sources: [{ kind: "nope" as never, title: "", url: "", patch: "soon" }] }))).toEqual(expect.arrayContaining(["sources.0.kind", "sources.0.title", "sources.0.patch"]));
  });

  it("checks the scope: a pair of two different champions on the roster, an opponent note naming only the opponent", () => {
    expect(fields(note({ championId: "Darius" }))).toContain("championId");
    expect(fields(note({ opponentId: "Nobody" }))).toContain("opponentId");
    expect(fields(note({ scope: "opponent", championId: "Riven" }))).toContain("championId");
    expect(fields(note({ opponentId: "Ahri", championId: "Riven", points: [{ text: "A point.", refs: ["Riven.Q"], levels: null }] }))).toContain("opponentId");
    expect(scopeChampions(note())).toEqual(["Riven", "Darius"]);
    expect(scopeChampions(note({ scope: "opponent", championId: null }))).toEqual(["Darius"]);
    expect(scopeName(note(), { champion: "Riven", opponent: "Darius" }, "Top")).toBe("Top: Riven vs Darius");
    expect(scopeName(note({ scope: "opponent" }), { champion: null, opponent: "Darius" }, "Top")).toBe("Top: against Darius");
    // Audit Logs' sentences carry no "key: value".
    expect(scopeSentence(note(), { champion: "Riven", opponent: "Darius" }, "Top")).toBe("Riven against Darius in Top");
    expect(scopeSentence(note({ scope: "opponent" }), { champion: null, opponent: "Darius" }, "Top")).toBe("any champion against Darius in Top");
    expect(scopeSentence(note(), { champion: "Riven", opponent: "Darius" }, "Top")).not.toMatch(/\w: /);
  });

  it("is stored trimmed, a repeated ref once, an opponent note without a champion", () => {
    const clean = cleanNoteInput(note({ scope: "opponent", points: [{ text: "  Two   spaces.  ", refs: ["Darius.E", "Darius.E"], levels: null }] }));
    expect(clean.championId).toBeNull();
    expect(clean.points[0]).toEqual({ text: "Two spaces.", refs: ["Darius.E"], levels: null });
  });
});

describe("a note's freshness", () => {
  const known = ["17.2", "17.1", "16.24", "16.23", "16.22", "16.21", "16.20"];
  const pub = (reviewedPatch: string, kit = { Riven: "r1", Darius: "d1" }) => ({ reviewedPatch, kitHashes: kit, scope: "pair" as const, opponentId: "Darius", championId: "Riven" });
  const now = (current: string, kitHashes: Record<string, string> = { Riven: "r1", Darius: "d1" }) => ({ current, knownDesc: known, kitHashes });

  it("is fresh on the review patch and the next, across a year's boundary (26.24 → 27.1 is one patch)", () => {
    expect(noteFreshness(pub("16.23"), now("16.23"))).toEqual({ state: "fresh", distance: 0 });
    expect(noteFreshness(pub("16.24"), now("17.1"))).toEqual({ state: "fresh", distance: 1 });
  });

  it("is not re-checked two and three patches on, and hidden from the fourth or with a review patch the list does not know", () => {
    expect(noteFreshness(pub("16.22"), now("16.24"))).toEqual({ state: "stale", distance: 2 });
    expect(noteFreshness(pub("16.22"), now("17.1"))).toEqual({ state: "stale", distance: 3 });
    expect(noteFreshness(pub("16.22"), now("17.2"))).toEqual({ state: "hidden-old", distance: 4 });
    expect(noteFreshness(pub("15.1"), now("16.23"))).toEqual({ state: "hidden-old", distance: null });
    expect(noteShown({ state: "stale", distance: 2 })).toBe(true);
    expect(noteShown({ state: "hidden-old", distance: 4 })).toBe(false);
  });

  it("is hidden at once when Riot's data for either champion changed since the review, whatever the patch", () => {
    expect(noteFreshness(pub("16.23"), now("16.23", { Riven: "r1", Darius: "d2" }))).toEqual({ state: "hidden-changed", changed: ["Darius"] });
    expect(noteFreshness(pub("16.23"), now("16.23", { Riven: "r1" }))).toEqual({ state: "hidden-changed", changed: ["Darius"] });
    // An opponent note looks at the opponent alone.
    expect(noteFreshness({ ...pub("16.23", { Darius: "d1" } as never), scope: "opponent", championId: null }, now("16.23", { Riven: "changed", Darius: "d1" }))).toEqual({ state: "fresh", distance: 0 });
  });

  it("lists the patches since a review for the re-review's links to Riot's notes, oldest first, public names", () => {
    expect(patchesSince("16.23", known)).toEqual(["26.24", "27.1", "27.2"]);
  });
});
