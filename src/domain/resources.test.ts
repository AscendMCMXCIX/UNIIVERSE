import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESOURCES,
  RESOURCE_LIMITS,
  RESOURCE_SECTIONS,
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
*/

const ids = (lib: ResourceLibrary) => lib.entries.map((e) => e.id);
const field = { title: "U.GG", url: "https://u.gg/", description: "Builds and tier lists.", section: "sr" as const, icon: "favicon" as const };

describe("the default library", () => {
  it("has a permanent id, a unique https address and short texts for every entry, and something in every section", () => {
    expect(new Set(DEFAULT_RESOURCES.map((d) => d.id)).size).toBe(DEFAULT_RESOURCES.length);
    expect(new Set(DEFAULT_RESOURCES.map((d) => d.url)).size).toBe(DEFAULT_RESOURCES.length);
    for (const d of DEFAULT_RESOURCES) {
      expect(d.id).toMatch(/^d-[a-z0-9-]+$/);
      expect(checkResourceUrl(d.url)).toEqual({ ok: true, url: d.url });
      expect(d.title.length).toBeLessThanOrEqual(RESOURCE_LIMITS.title);
      expect(d.description.length).toBeLessThanOrEqual(RESOURCE_LIMITS.description);
    }
    for (const s of RESOURCE_SECTIONS) expect(DEFAULT_RESOURCES.some((d) => d.section === s.key)).toBe(true);
  });

  it("includes the sites the brief named", () => {
    const urls = DEFAULT_RESOURCES.map((d) => d.url);
    for (const u of ["https://www.leagueoflegends.com/en-us/news/tags/patch-notes/", "https://wiki.leagueoflegends.com/en-us/", "https://op.gg/", "https://lolalytics.com/", "https://pros.lol/", "https://op.gg/lol/modes/aram", "https://lolalytics.com/lol/tierlist/aram/", "https://op.gg/lol/modes/arena", "https://lolalytics.com/lol/tierlist/arena/", "https://tactics.tools/", "https://www.metatft.com/", "https://teamfighttactics.leagueoflegends.com/en-us/news/", "https://www.leagueoflegends.com/en-us/news/esports/"]) {
      expect(urls).toContain(u);
    }
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
    expect(sr.map((e) => e.id)).toEqual(["d-lolalytics", "d-pros-lol", "d-opgg"]);
    expect(sr.at(-1)).toMatchObject({ title: "OP.GG", url: "https://op.gg/", hidden: false });
    expect(removedDefaults(restored)).toEqual([]);
    // Restoring one leaves the others removed.
    const two = removeResource(removeResource(all, "d-opgg"), "d-metatft");
    expect(removedDefaults(restoreDefaults(two, ["d-metatft"])).map((d) => d.id)).toEqual(["d-opgg"]);
  });

  it("never restores over an address added again, and never drops an entry to make room", () => {
    // OP.GG removed, then added again by hand: restoring the default would make a duplicate.
    const again = addResource(removeResource(all, "d-opgg"), { ...field, title: "OP.GG again", url: "https://op.gg/" }, "c-opgg");
    expect(() => restoreDefaults(again, ["d-opgg"])).toThrow(/OP.GG: its address is already in the library/);
    // Restoring all of them puts back the others and leaves that one removed.
    const both = removeResource(again, "d-metatft");
    const restored = restoreDefaults(both);
    expect(ids(restored)).toContain("d-metatft");
    expect(ids(restored)).not.toContain("d-opgg");
    expect(removedDefaults(restored).map((d) => d.id)).toEqual(["d-opgg"]);
    // A full library refuses, keeping every entry it has.
    let full = removeResource(all, "d-metatft");
    for (let i = 0; full.entries.length < RESOURCE_LIMITS.entries; i++) full = addResource(full, { ...field, url: `https://site${i}.example.com/` }, `c-site${i}`);
    expect(() => restoreDefaults(full)).toThrow(/at most 200 resources/);
  });
});

describe("changing the library", () => {
  const all = libraryFrom(null);

  it("adds an entry at the end of its section and refuses an address already there", () => {
    const added = addResource(all, field, "c-ugg");
    expect(added.entries.filter((e) => e.section === "sr").map((e) => e.id)).toEqual(["d-opgg", "d-lolalytics", "d-pros-lol", "c-ugg"]);
    expect(() => addResource(added, { ...field, title: "Again" }, "c-ugg2")).toThrow(/already in the library/);
  });

  it("moves an entry within its section only, and to another section's end when recategorised", () => {
    const up = moveResource(all, "d-lolalytics", "up");
    expect(up.entries.filter((e) => e.section === "sr").map((e) => e.id)).toEqual(["d-lolalytics", "d-opgg", "d-pros-lol"]);
    // The first of a section stays first; it never jumps into the section before.
    expect(moveResource(up, "d-lolalytics", "up")).toBe(up);
    const moved = updateResource(all, "d-pros-lol", { ...all.entries.find((e) => e.id === "d-pros-lol")!, section: "esports" });
    expect(moved.entries.filter((e) => e.section === "esports").map((e) => e.id)).toEqual(["d-lolesports", "d-esports-news", "d-pros-lol"]);
  });

  it("hides from members without removing, and refuses a change to an entry that is gone", () => {
    const hidden = setResourceHidden(all, "d-metatft", true);
    expect(visibleResources(hidden).map((e) => e.id)).not.toContain("d-metatft");
    expect(ids(hidden)).toContain("d-metatft");
    expect(() => setResourceHidden(removeResource(all, "d-metatft"), "d-metatft", false)).toThrow(/no longer in the library/);
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
    expect(searchResources(shown, "aram").map((e) => e.id)).toEqual(["d-opgg-aram", "d-lolalytics-aram", "d-opgg-aram-mayhem"]);
    expect(searchResources(shown, "TIER list arena").map((e) => e.id)).toEqual(["d-opgg-arena", "d-lolalytics-arena"]);
    expect(searchResources(shown, "metatft.com").map((e) => e.id)).toEqual(["d-metatft"]);
    expect(searchResources(shown, "légends wiki").length).toBeGreaterThan(0);
    expect(searchResources(shown, "  ")).toHaveLength(shown.length);
  });
});
