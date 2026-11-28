import { describe, expect, it } from "vitest";
import { READER_IDLE_MS, READER_NAV_MS, followsLink, onDrawnAddress, readerBusy } from "./reader-idle";

describe("a list's own address write waits while the reader acts", () => {
  it("is busy within READER_IDLE_MS of the last press, click or key, and idle after", () => {
    expect(readerBusy(1000, -Infinity)).toBe(false);
    expect(readerBusy(1000, 900)).toBe(true);
    expect(readerBusy(1000 + READER_IDLE_MS, 1000)).toBe(false);
    expect(readerBusy(1000 + READER_IDLE_MS - 1, 1000)).toBe(true);
  });

  it("is busy from a navigation the reader started until the list's data next arrives, however long its page takes (up to READER_NAV_MS)", () => {
    // Encounters followed at 1000; the server takes 4 s: still busy at 3000 and 4900, long after READER_IDLE_MS.
    expect(readerBusy(3000, 1000, { at: 1000, arrived: 500 })).toBe(true);
    expect(readerBusy(4900, 1000, { at: 1000, arrived: 500 })).toBe(true);
    // Its page arrived at 5000 (the data changed): the write is worked out again from it, and goes ahead.
    expect(readerBusy(5100 + READER_IDLE_MS, 1000, { at: 1000, arrived: 5000 })).toBe(false);
    // A navigation that never lands holds the write READER_NAV_MS at the most.
    expect(readerBusy(1000 + READER_NAV_MS - 1, 1000, { at: 1000, arrived: 500 })).toBe(true);
    expect(readerBusy(1000 + READER_NAV_MS, 1000, { at: 1000, arrived: 500 })).toBe(false);
    // One started before the data last arrived is over.
    expect(readerBusy(3000, 400, { at: 400, arrived: 500 })).toBe(false);
  });

  it("holds the write READER_IDLE_MS only after a press that starts no navigation (a game opened)", () => {
    expect(readerBusy(1000 + READER_IDLE_MS, 1000, { at: -Infinity, arrived: 500 })).toBe(false);
  });
});

describe("a click follows a link to another address of the site in this window (followsLink)", () => {
  const here = "https://example.test/players/p1/matches?per=4";
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const link = (href: string, o: { target?: string; download?: boolean } = {}) => ({ href, target: o.target ?? "", download: o.download ?? false });

  it("is a navigation: another view, another order, another page of the site", () => {
    expect(followsLink(link("https://example.test/players/p1/matches?view=encounters"), here, plain)).toBe(true);
    expect(followsLink(link("/players/p1/matches?view=encounters&sort=games"), here, plain)).toBe(true);
    expect(followsLink(link("https://example.test/team"), here, plain)).toBe(true);
    expect(followsLink(link("/team", { target: "_self" }), here, plain)).toBe(true);
  });

  it("is not one: the address shown, a place on the page, another site, a new tab or window, a download, another button", () => {
    expect(followsLink(null, here, plain)).toBe(false);
    expect(followsLink(link(here), here, plain)).toBe(false);
    expect(followsLink(link(`${here}#games`), here, plain)).toBe(false);
    expect(followsLink(link("https://op.gg/"), here, plain)).toBe(false);
    expect(followsLink(link("/team", { target: "_blank" }), here, plain)).toBe(false);
    expect(followsLink(link("/team", { download: true }), here, plain)).toBe(false);
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(followsLink(link("/team"), here, { ...plain, [k]: true }), k).toBe(false);
    expect(followsLink(link("/team"), here, { ...plain, button: 1 })).toBe(false);
  });
});

describe("a list's own address write waits while a Back or a Forward is on its way (onDrawnAddress)", () => {
  const drawn = { pathname: "/players/p1/matches", search: "?season=s1&per=4&page=2" };
  const own = ["per", "page", "match"];

  it("goes ahead on the address the page drew, whatever the list's own keys say and in whatever order", () => {
    expect(onDrawnAddress(drawn, drawn, own)).toBe(true);
    // A game just opened (?match=, written by the page itself) and another page size: still this page's address.
    expect(onDrawnAddress(drawn, { pathname: drawn.pathname, search: "?match=m9&page=1&season=s1" }, own)).toBe(true);
  });

  it("waits where Back has left the page, or is on its way to another view of it: never written onto that address", () => {
    // Back to Team Overview while Match History is still drawn.
    expect(onDrawnAddress(drawn, { pathname: "/team", search: "" }, own)).toBe(false);
    // Back from Encounters to the games (the same path, another view).
    expect(onDrawnAddress({ pathname: drawn.pathname, search: "?view=encounters&eper=6" }, { pathname: drawn.pathname, search: "" }, ["eper", "epage"])).toBe(false);
    // Another season followed meanwhile.
    expect(onDrawnAddress(drawn, { pathname: drawn.pathname, search: "?season=s2" }, own)).toBe(false);
  });
});
