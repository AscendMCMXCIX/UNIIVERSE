import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESOURCES,
  RESOURCE_LIMITS,
  RESOURCE_SECTIONS,
  RETIRED_DEFAULTS,
  addResource,
  checkResourceUrl,
  cleanResourceInput,
  faviconUrl,
  libraryFrom,
  moveResource,
  plainText,
  removeResource,
  removedDefaults,
  resourceHost,
  restoreDefaults,
  searchResources,
  setResourceHidden,
  updateResource,
  visibleResources,
  type ResourceLibrary,
} from "./resources";

/*
  The Resources library (domain/resources.ts): its defaults, what an address may be, and above all
  that a library an administrator changed is never undone by the defaults: removed stays removed,
  hidden stays hidden, edited stays edited, and only a default never seen before joins by itself.
  Defaults a later release stops shipping leave a stored library only while unchanged.
*/

const ids = (lib: ResourceLibrary) => lib.entries.map((e) => e.id);
const field = { title: "U.GG", url: "https://u.gg/", description: "Builds and tier lists.", section: "sr" as const, icon: "favicon" as const };

describe("the default library", () => {
  it("has a permanent id, a unique https address and short texts for every entry, and something in every section offered", () => {
    const all = [...DEFAULT_RESOURCES, ...RETIRED_DEFAULTS];
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    expect(new Set(all.map((d) => d.url)).size).toBe(all.length);
    for (const d of all) {
      expect(d.id).toMatch(/^d-[a-z0-9-]+$/);
      expect(checkResourceUrl(d.url)).toEqual({ ok: true, url: d.url });
      expect(d.title.length).toBeLessThanOrEqual(RESOURCE_LIMITS.title);
      expect(d.description.length).toBeLessThanOrEqual(RESOURCE_LIMITS.description);
    }
    for (const s of RESOURCE_SECTIONS) expect(DEFAULT_RESOURCES.some((d) => d.section === s.key), s.key).toBe(s.offered);
  });

  it("keeps the League sites and leaves out pros.lol, rotating modes, League Classic, Teamfight Tactics and learning (21 Oct 2026)", () => {
    const urls = DEFAULT_RESOURCES.map((d) => d.url);
    for (const u of ["https://www.leagueoflegends.com/en-us/news/tags/patch-notes/", "https://wiki.leagueoflegends.com/en-us/", "https://op.gg/", "https://lolalytics.com/", "https://op.gg/lol/modes/aram", "https://lolalytics.com/lol/tierlist/aram/", "https://op.gg/lol/modes/arena", "https://lolalytics.com/lol/tierlist/arena/", "https://lolesports.com/", "https://www.leagueoflegends.com/en-us/news/esports/"]) {
      expect(urls).toContain(u);
    }
    for (const u of ["https://pros.lol/", "https://tactics.tools/", "https://www.metatft.com/", "https://teamfighttactics.leagueoflegends.com/en-us/news/", "https://op.gg/lol/modes/aram-mayhem", "https://wiki.leagueoflegends.com/en-us/League_Classic", "https://www.leagueoflegends.com/en-us/how-to-play/", "https://www.leagueoflegends.com/en-us/champions/"]) {
      expect(urls).not.toContain(u);
    }
    expect(RESOURCE_SECTIONS.filter((s) => !s.offered).map((s) => s.label)).toEqual(["Rotating modes", "League Classic", "Teamfight Tactics", "Learning"]);
  });

  it("is the whole library while nothing is stored", () => {
    const lib = libraryFrom(null);
    expect(ids(lib)).toEqual(DEFAULT_RESOURCES.map((d) => d.id));
    expect(lib.seen).toEqual(DEFAULT_RESOURCES.map((d) => d.id));
    expect(lib.entries.every((e) => !e.hidden && e.icon === "favicon")).toBe(true);
  });
});

describe("addresses", () => {
  it("accepts public https addresses, normalised", () => {
    expect(checkResourceUrl("https://op.gg/")).toEqual({ ok: true, url: "https://op.gg/" });
    expect(checkResourceUrl("  HTTPS://OP.GG/lol/modes/aram ")).toEqual({ ok: true, url: "https://op.gg/lol/modes/aram" });
    expect(checkResourceUrl("lolalytics.com/lol/tierlist/")).toEqual({ ok: true, url: "https://lolalytics.com/lol/tierlist/" });
    expect(checkResourceUrl("https://wiki.leagueoflegends.com/en-us/Summoner's_Rift")).toMatchObject({ ok: true });
  });

  it("refuses anything that could run code, leave https, reach a local machine or hide credentials", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox", "file:///etc/passwd", "http://op.gg/", "ftp://op.gg/", "https://user:pw@op.gg/", "https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://printer.local/", "https://intranet/", "https://op.gg:8443/", "https://op .gg/", "", `https://op.gg/${"a".repeat(RESOURCE_LIMITS.url)}`]) {
      expect(checkResourceUrl(bad).ok, bad).toBe(false);
    }
  });

  it("names the host and the favicon a link has", () => {
    expect(resourceHost("https://www.metatft.com/")).toBe("metatft.com");
    expect(resourceHost("https://wiki.leagueoflegends.com/en-us/")).toBe("wiki.leagueoflegends.com");
    expect(faviconUrl("https://op.gg/lol/modes/aram")).toBe("https://op.gg/favicon.ico");
    expect(faviconUrl("http://op.gg/")).toBeNull();
  });
});

describe("what an administrator types", () => {
  it("is kept as plain text: no control or direction-changing characters, single spaces, bounded", () => {
    expect(plainText("  OP.GG\u0000 \u202eevil\u202c  tier\n\tlists ", 60)).toBe("OP.GG evil tier lists");
    expect(plainText("<b>bold</b>", 60)).toBe("<b>bold</b>");
  });

  it("is checked field by field, with a message that says what to fix", () => {
    expect(cleanResourceInput({ ...field, title: "  U.GG  " })).toEqual({ ...field, title: "U.GG" });
    expect(() => cleanResourceInput({ ...field, title: " " })).toThrow("Give it a title.");
    expect(() => cleanResourceInput({ ...field, title: "x".repeat(61) })).toThrow(/60 characters/);
    expect(() => cleanResourceInput({ ...field, description: "x".repeat(161) })).toThrow(/160 characters/);
    expect(() => cleanResourceInput({ ...field, url: "javascript:alert(1)" })).toThrow(/https/);
    expect(() => cleanResourceInput({ ...field, section: "nowhere" })).toThrow(/not valid/);
    expect(() => cleanResourceInput({ ...field, icon: "<svg>" })).toThrow(/not valid/);
  });
});

describe("a stored library is never undone by the defaults", () => {
  const all = libraryFrom(null);
  // An administrator removed OP.GG, hid the patch notes and retitled the wiki.
  const changed = updateResource(setResourceHidden(removeResource(all, "d-opgg"), "d-patch-notes", true), "d-lol-wiki", { ...all.entries.find((e) => e.id === "d-lol-wiki")!, title: "The wiki" });

  it("keeps a removed default removed, a hidden one hidden and an edited one edited, read back from storage", () => {
    const again = libraryFrom(JSON.parse(JSON.stringify(changed)));
    expect(ids(again)).not.toContain("d-opgg");
    expect(again.entries.find((e) => e.id === "d-patch-notes")!.hidden).toBe(true);
    expect(again.entries.find((e) => e.id === "d-lol-wiki")!.title).toBe("The wiki");
    expect(ids(again)).toEqual(ids(changed));
  });

  it("adds a default a later release introduces, once, at the end of its section; removed, it stays removed", () => {
    const later = [...DEFAULT_RESOURCES, { id: "d-new-aram", section: "aram" as const, title: "New ARAM site", url: "https://aram.example.com/", description: "" }];
    const withNew = libraryFrom(changed, later);
    const aram = withNew.entries.filter((e) => e.section === "aram").map((e) => e.id);
    expect(aram).toEqual(["d-opgg-aram", "d-lolalytics-aram", "d-new-aram"]);
    expect(ids(withNew)).not.toContain("d-opgg");
    const removedAgain = removeResource(withNew, "d-new-aram");
    expect(ids(libraryFrom(removedAgain, later))).not.toContain("d-new-aram");
  });

  it("leaves out stored entries that no longer read, without putting a default in their place", () => {
    const broken = { entries: [...changed.entries, { ...changed.entries[0]!, id: "c-bad", url: "javascript:alert(1)" }, { ...changed.entries[0]!, id: "c-gone", section: "nowhere" }, "junk"], seen: changed.seen };
    expect(ids(libraryFrom(broken))).toEqual(ids(changed));
  });

  it("restores removed defaults only on request, as first published", () => {
    expect(removedDefaults(changed).map((d) => d.id)).toEqual(["d-opgg"]);
    const restored = restoreDefaults(changed);
    const sr = restored.entries.filter((e) => e.section === "sr");
    expect(sr.map((e) => e.id)).toEqual(["d-lolalytics", "d-opgg"]);
    expect(sr.at(-1)).toMatchObject({ title: "OP.GG", url: "https://op.gg/", hidden: false });
    expect(removedDefaults(restored)).toEqual([]);
    // Restoring one leaves the others removed.
    const two = removeResource(removeResource(all, "d-opgg"), "d-esports-news");
    expect(removedDefaults(restoreDefaults(two, ["d-esports-news"])).map((d) => d.id)).toEqual(["d-opgg"]);
  });

  it("never restores over an address added again, and never drops an entry to make room", () => {
    // OP.GG removed, then added again by hand: restoring the default would make a duplicate.
    const again = addResource(removeResource(all, "d-opgg"), { ...field, title: "OP.GG again", url: "https://op.gg/" }, "c-opgg");
    expect(() => restoreDefaults(again, ["d-opgg"])).toThrow(/OP.GG: its address is already in the library/);
    // Restoring all of them puts back the others and leaves that one removed.
    const both = removeResource(again, "d-esports-news");
    const restored = restoreDefaults(both);
    expect(ids(restored)).toContain("d-esports-news");
    expect(ids(restored)).not.toContain("d-opgg");
    expect(removedDefaults(restored).map((d) => d.id)).toEqual(["d-opgg"]);
    // A full library refuses, keeping every entry it has.
    let full = removeResource(all, "d-esports-news");
    for (let i = 0; full.entries.length < RESOURCE_LIMITS.entries; i++) full = addResource(full, { ...field, url: `https://site${i}.example.com/` }, `c-site${i}`);
    expect(() => restoreDefaults(full)).toThrow(/at most 200 resources/);
  });
});

describe("defaults no longer shipped (21 Oct 2026)", () => {
  // A library stored before: every default of the time, pros.lol hidden, MetaTFT retitled, How to play moved to League, and an entry an administrator added under Teamfight Tactics.
  const asShipped = (d: (typeof RETIRED_DEFAULTS)[number]) => ({ ...d, icon: "favicon" as const, hidden: false });
  const before = {
    entries: [
      ...DEFAULT_RESOURCES.map((d) => ({ ...d, icon: "favicon" as const, hidden: false })),
      ...RETIRED_DEFAULTS.map((d) => (d.id === "d-pros-lol" ? { ...asShipped(d), hidden: true } : d.id === "d-metatft" ? { ...asShipped(d), title: "MetaTFT comps" } : d.id === "d-how-to-play" ? { ...asShipped(d), section: "league" as const } : asShipped(d))),
      { id: "c-lolchess", section: "tft" as const, title: "lolchess.gg", url: "https://lolchess.gg/", description: "", icon: "favicon" as const, hidden: false },
    ],
    seen: [...DEFAULT_RESOURCES, ...RETIRED_DEFAULTS].map((d) => d.id),
  };
  const lib = libraryFrom(JSON.parse(JSON.stringify(before)));

  it("leave a stored library while exactly as shipped, hidden or not", () => {
    for (const id of ["d-pros-lol", "d-opgg-aram-mayhem", "d-featured-modes", "d-classic-dev", "d-classic-wiki", "d-tactics-tools", "d-tft-news", "d-champions"]) expect(ids(lib), id).not.toContain(id);
    for (const d of DEFAULT_RESOURCES) expect(ids(lib)).toContain(d.id);
  });

  it("stay where an administrator edited them, and an administrator's own entries stay too", () => {
    expect(lib.entries.find((e) => e.id === "d-metatft")).toMatchObject({ title: "MetaTFT comps", section: "tft" });
    expect(lib.entries.find((e) => e.id === "d-how-to-play")).toMatchObject({ section: "league" });
    expect(lib.entries.find((e) => e.id === "c-lolchess")).toMatchObject({ section: "tft" });
    expect(visibleResources(lib).filter((e) => e.section === "tft").map((e) => e.id)).toEqual(["d-metatft", "c-lolchess"]);
  });

  it("are never offered for restoring, and never come back by themselves", () => {
    expect(removedDefaults(lib)).toEqual([]);
    for (const r of RETIRED_DEFAULTS) expect(lib.seen).toContain(r.id);
    expect(ids(libraryFrom(JSON.parse(JSON.stringify(lib))))).toEqual(ids(lib));
  });

  it("leave a section no longer offered open only to the entries already in it", () => {
    expect(() => addResource(lib, { ...field, url: "https://tft.example.com/", section: "tft" }, "c-tft")).toThrow("Choose one of the sections offered.");
    expect(() => updateResource(lib, "d-opgg", { ...lib.entries.find((e) => e.id === "d-opgg")!, section: "learning" })).toThrow("Choose one of the sections offered.");
    // An entry already there may be edited in place, or moved to a section offered.
    const kept = updateResource(lib, "c-lolchess", { ...lib.entries.find((e) => e.id === "c-lolchess")!, title: "LoLCHESS" });
    expect(kept.entries.find((e) => e.id === "c-lolchess")).toMatchObject({ title: "LoLCHESS", section: "tft" });
    const moved = updateResource(lib, "c-lolchess", { ...lib.entries.find((e) => e.id === "c-lolchess")!, section: "league" });
    expect(moved.entries.find((e) => e.id === "c-lolchess")!.section).toBe("league");
  });
});

describe("changing the library", () => {
  const all = libraryFrom(null);

  it("adds an entry at the end of its section and refuses an address already there", () => {
    const added = addResource(all, field, "c-ugg");
    expect(added.entries.filter((e) => e.section === "sr").map((e) => e.id)).toEqual(["d-opgg", "d-lolalytics", "c-ugg"]);
    expect(() => addResource(added, { ...field, title: "Again" }, "c-ugg2")).toThrow(/already in the library/);
  });

  it("moves an entry within its section only, and to another section's end when recategorised", () => {
    const up = moveResource(all, "d-lolalytics", "up");
    expect(up.entries.filter((e) => e.section === "sr").map((e) => e.id)).toEqual(["d-lolalytics", "d-opgg"]);
    // The first of a section stays first; it never jumps into the section before.
    expect(moveResource(up, "d-lolalytics", "up")).toBe(up);
    const moved = updateResource(all, "d-lolalytics", { ...all.entries.find((e) => e.id === "d-lolalytics")!, section: "esports" });
    expect(moved.entries.filter((e) => e.section === "esports").map((e) => e.id)).toEqual(["d-lolesports", "d-esports-news", "d-lolalytics"]);
  });

  it("hides from members without removing, and refuses a change to an entry that is gone", () => {
    const hidden = setResourceHidden(all, "d-opgg-arena", true);
    expect(visibleResources(hidden).map((e) => e.id)).not.toContain("d-opgg-arena");
    expect(ids(hidden)).toContain("d-opgg-arena");
    expect(() => setResourceHidden(removeResource(all, "d-opgg-arena"), "d-opgg-arena", false)).toThrow(/no longer in the library/);
  });

  it("shows members the visible entries section by section", () => {
    const added = addResource(all, { ...field, section: "league" }, "c-league");
    const shown = visibleResources(added);
    expect(shown.slice(0, 4).map((e) => e.id)).toEqual(["d-lol-news", "d-patch-notes", "d-lol-wiki", "c-league"]);
  });
});

describe("search", () => {
  const shown = visibleResources(libraryFrom(null));
  it("matches every word in the title, description, host or section, accents and case aside", () => {
    expect(searchResources(shown, "aram").map((e) => e.id)).toEqual(["d-opgg-aram", "d-lolalytics-aram"]);
    expect(searchResources(shown, "TIER list arena").map((e) => e.id)).toEqual(["d-opgg-arena", "d-lolalytics-arena"]);
    expect(searchResources(shown, "lolesports.com").map((e) => e.id)).toEqual(["d-lolesports"]);
    expect(searchResources(shown, "légends wiki").length).toBeGreaterThan(0);
    expect(searchResources(shown, "  ")).toHaveLength(shown.length);
  });
});
