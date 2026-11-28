import { describe, expect, it } from "vitest";
import { READER_IDLE_MS, onDrawnAddress, readerBusy } from "./reader-idle";

describe("a list's own address write waits while the reader acts", () => {
  it("is busy within READER_IDLE_MS of the last press, click or key, and idle after", () => {
    expect(readerBusy(1000, -Infinity)).toBe(false);
    expect(readerBusy(1000, 900)).toBe(true);
    expect(readerBusy(1000 + READER_IDLE_MS, 1000)).toBe(false);
    expect(readerBusy(1000 + READER_IDLE_MS - 1, 1000)).toBe(true);
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
