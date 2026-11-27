import { describe, expect, it } from "vitest";
import { BAND_POINT_LINES, MAX_POINT_WORDS, VISIBLE_POINTS, bandNotes, cleanNoteInput, noteFreshness, noteShown, patchesSince, rescope, scopeChampions, scopeName, scopeSentence, textProblems, validateNote, type NoteInput } from "./notes";

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

  // 27 Nov 2026: a point or a title the save accepted could fail the Production check's verdict words (one list now).
  it("refuses in the points and in the sources' titles every word the band may not hold", () => {
    const say = (text: string) => validateNote(note({ points: [{ text, refs: ["Darius.E"], levels: null }] }), ctx).map((p) => p.message).join(" | ");
    expect(say("Darius's E travels faster than Riven's Q.")).toMatch(/"faster" is a verdict on the matchup/);
    expect(say("Darius's E has a better reach at level 1.")).toMatch(/"better"/);
    expect(say("Riven is often outplayed before level 6.")).toMatch(/"outplayed" is a verdict/);
    expect(say("Darius's E recommends caution.")).toMatch(/"recommends"/);
    const title = (t: string) => validateNote(note({ sources: [{ kind: "wiki", title: t, url: "", patch: "26.23" }] }), ctx).filter((p) => p.field === "sources.0.title").map((p) => p.message).join(" | ");
    expect(title("How to counter Darius")).toMatch(/"counter" is a verdict on the matchup/);
    expect(title("Best Darius guide")).toMatch(/"best"/);
    expect(title("Darius's E: slower than it looks")).toMatch(/"slower"/);
    expect(title("Darius on the League of Legends Wiki")).toBe("");
  });

  // 27 Nov 2026: a source's address was checked for https only, so a member's profile on a statistics site passed.
  it("refuses a source's address that names a player: a profile, a Riot ID's tag, an account's or player's name", () => {
    const url = (u: string, names = ctx.names) => validateNote(note({ sources: [{ kind: "games", title: "The team's games", url: u, patch: "26.23" }] }), { ...ctx, names }).filter((p) => p.field === "sources.0.url").map((p) => p.message);
    expect(url("https://www.op.gg/summoners/euw/Dana-EUW").join(" ")).toMatch(/player's profile/);
    expect(url("https://u.gg/lol/profile/euw1/dana-euw/overview").join(" ")).toMatch(/player's profile/);
    expect(url("https://tracker.gg/lol/profile/riot/Dana%23EUW/overview").join(" ")).toMatch(/Riot ID's tag/);
    expect(url("https://stats.example/Dana-EUW", ["Dana"]).join(" ")).toMatch(/names a member or player/);
    expect(url("https://stats.example/match?player=Demo+Mid").join(" ")).toMatch(/names a member or player/);
    expect(url("https://stats.example/match#SomeRiotName").join(" ")).toMatch(/names a member or player/);
    // A champion's page, Riot's notes and a wiki section are fine.
    expect(url("https://wiki.leagueoflegends.com/en-us/Darius#Abilities")).toEqual([]);
    expect(url("https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-23-notes/")).toEqual([]);
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

  // 27 Nov 2026: a ref to a champion that left the scope had no toggle, and its error could not be cleared from the form.
  it("keeps only the refs of champions still in the scope when the scope changes", () => {
    const pair = note({ points: [{ text: "A point.", refs: ["Riven.Q", "Darius.E"], levels: null }, { text: "Another.", refs: ["Riven.W"], levels: "6" }] });
    const opponent = rescope(pair, { scope: "opponent", championId: null });
    expect(opponent.points.map((p) => p.refs)).toEqual([["Darius.E"], []]);
    expect(opponent.points[1]!.levels).toBe("6");
    expect(rescope(pair, { opponentId: "Ahri" }).points.map((p) => p.refs)).toEqual([["Riven.Q"], ["Riven.W"]]);
    expect(rescope(pair, { championId: "Ahri" }).points.map((p) => p.refs)).toEqual([["Darius.E"], []]);
    expect(rescope(pair, { role: "MID" }).points).toEqual(pair.points);
    // What is left is what the editor can show, and saves.
    expect(fields(rescope(note({ points: [{ text: "A point.", refs: ["Riven.Q", "Darius.E"], levels: null }] }), { scope: "opponent", championId: null }))).toEqual([]);
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

  // 27 Nov 2026: another instance's patch list, cached longer than the current patch, lacked a new patch and hid every note.
  it("counts a current patch newer than the stored list as its newest, never as a patch the list does not know", () => {
    const old = ["16.23", "16.22", "16.21"];
    expect(noteFreshness(pub("16.23"), { current: "16.24", knownDesc: old, kitHashes: { Riven: "r1", Darius: "d1" } })).toEqual({ state: "fresh", distance: 1 });
    expect(noteFreshness(pub("16.21"), { current: "16.24", knownDesc: old, kitHashes: { Riven: "r1", Darius: "d1" } })).toEqual({ state: "stale", distance: 3 });
    // Reviewed on the new patch, read with the old list: fresh.
    expect(noteFreshness(pub("16.24"), { current: "16.24", knownDesc: old, kitHashes: { Riven: "r1", Darius: "d1" } })).toEqual({ state: "fresh", distance: 0 });
    // The reverse (an old current patch, a new list) stays fresh too; a current patch older than the list and missing from it is not known.
    expect(noteFreshness(pub("16.24"), { current: "16.23", knownDesc: ["16.24", ...old], kitHashes: { Riven: "r1", Darius: "d1" } })).toEqual({ state: "fresh", distance: 0 });
    expect(noteFreshness(pub("16.23"), { current: "16.20", knownDesc: old, kitHashes: { Riven: "r1", Darius: "d1" } })).toEqual({ state: "hidden-old", distance: null });
  });

  it("lists the patches since a review for the re-review's links to Riot's notes, oldest first, public names", () => {
    expect(patchesSince("16.23", known)).toEqual(["26.24", "27.1", "27.2"]);
  });
});

describe("the band's notes block", () => {
  const shown = (scope: "pair" | "opponent", texts: string[], state: "fresh" | "stale" = "fresh") => ({
    note: { id: scope, scope, role: "TOP" as const, opponentId: "Darius", championId: scope === "pair" ? "Riven" : null, status: "published" as const, points: texts.map((text) => ({ text, refs: ["Darius.E"], levels: null })), sources: [], reviewedPatch: "16.23", reviewedVersion: null, reviewedAt: null, kitHashes: null, abilityHashes: null, updatedAt: "" },
    freshness: state === "fresh" ? { state, distance: 0 } : { state, distance: 2 },
  });
  const long = Array.from({ length: MAX_POINT_WORDS }, () => "Wordy").join(" ");

  it("shows the first two points, pair notes first, the rest behind the fold", () => {
    const b = bandNotes([shown("pair", ["A.", "B.", "C."]), shown("opponent", ["D."])], { hiddenLine: false, blocks: 3 });
    expect(VISIBLE_POINTS).toBe(2);
    expect(b.first.flatMap((n) => n.note.points.map((p) => p.text))).toEqual(["A.", "B."]);
    expect(b.rest.flatMap((n) => n.note.points.map((p) => p.text))).toEqual(["C.", "D."]);
    expect(b.more).toBe(2);
  });

  // 27 Nov 2026: two valid points of 35 words pushed both champions' R rows below 900px at 1440 × 900.
  it("holds the shown points to BAND_POINT_LINES lines side by side, fewer beside a long heading line or a hidden note's line", () => {
    expect(BAND_POINT_LINES).toBe(5);
    expect(bandNotes([shown("opponent", [long, long])], { hiddenLine: false, blocks: 3 }).lines).toBe(5);
    expect(bandNotes([shown("opponent", [long, long], "stale")], { hiddenLine: false, blocks: 3 }).lines).toBe(4);
    expect(bandNotes([shown("opponent", [long, long])], { hiddenLine: true, blocks: 3 }).lines).toBe(3);
    expect(bandNotes([shown("opponent", [long], "stale")], { hiddenLine: true, blocks: 3 }).lines).toBe(2);
    // A fresh note beside a stale one: the heading says "Patch …", short.
    expect(bandNotes([shown("pair", ["A."]), shown("opponent", ["B."], "stale")], { hiddenLine: false, blocks: 3 }).lines).toBe(5);
  });

  it("shows the first point alone where it likely fills the lines by itself, so 'N more' counts every hidden point", () => {
    const b = bandNotes([shown("opponent", [long, "B.", "C."])], { hiddenLine: false, blocks: 3 });
    expect(b.first.flatMap((n) => n.note.points)).toHaveLength(1);
    expect(b.more).toBe(2);
    // The demo's typical first point (3 lines at 1440 × 900) keeps its neighbour.
    const demo = bandNotes([shown("opponent", ["Zed's W leaves a shadow that repeats his Q and E, so those skillshots can come from two places at once.", "Zed's abilities cost energy.", "Zed's R marks."])], { hiddenLine: false, blocks: 3 });
    expect(demo.first.flatMap((n) => n.note.points)).toHaveLength(2);
    expect(demo.more).toBe(1);
  });

  it("says the fold holds the full text where the shown points are likely longer than their lines", () => {
    expect(bandNotes([shown("opponent", [long])], { hiddenLine: false, blocks: 3 }).long).toBe(true);
    expect(bandNotes([shown("opponent", ["Darius's passive applies a bleed that stacks with his attacks and abilities.", "Darius's E pulls champions in front of him and slows them."])], { hiddenLine: false, blocks: 3 }).long).toBe(false);
    expect(bandNotes([shown("opponent", [long])], { hiddenLine: false, blocks: 2 }).long).toBe(false);
  });
});
