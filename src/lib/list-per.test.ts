import { describe, expect, it } from "vitest";
import { LIST_PER_COOKIES, LIST_PER_MAX, budgetPageOf, listPerCookie, pageHolding, readListPer } from "./list-per";

describe("a server-paged list's kept page size (the one-screen workspace's last row budget)", () => {
  it("reads a whole number from 1 to 25, and nothing else", () => {
    expect(readListPer("4")).toBe(4);
    expect(readListPer("1")).toBe(1);
    expect(readListPer(String(LIST_PER_MAX))).toBe(LIST_PER_MAX);
    for (const v of [undefined, null, "", "0", "26", "-3", "4.5", "4px", "100", " 4"]) expect(readListPer(v), String(v)).toBeNull();
  });

  it("writes a cookie of the list's own, clamped, for the whole site, a year, sent to the site only", () => {
    expect(listPerCookie("games", 4)).toBe(`${LIST_PER_COOKIES.games}=4; path=/; max-age=31536000; samesite=lax`);
    expect(listPerCookie("together", 40)).toContain(`${LIST_PER_COOKIES.together}=25;`);
    expect(listPerCookie("encounters", 0)).toContain(`${LIST_PER_COOKIES.encounters}=1;`);
    // One cookie per list: each list's room differs.
    expect(new Set(Object.values(LIST_PER_COOKIES)).size).toBe(Object.keys(LIST_PER_COOKIES).length);
  });
});

describe("a link to a row opens on its page (pageHolding)", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `g${i + 1}`);

  it("is the page of `per` rows holding the row: the 7th game at 3 a page is on page 3, the 12th at 2 on page 6", () => {
    expect(pageHolding(ids, "g7", 3)).toBe(3);
    expect(pageHolding(ids, "g12", 2)).toBe(6);
    expect(pageHolding(ids, "g1", 5)).toBe(1);
    expect(pageHolding(ids, "g6", 6)).toBe(1);
  });

  it("keeps a page asked for that holds the row, and replaces one that does not", () => {
    expect(pageHolding(ids, "g7", 3, 3)).toBe(3);
    expect(pageHolding(ids, "g7", 3, 1)).toBe(3);
    // A game listed once per side (Team Matches): the page a step across a page's end asked for holds its second place.
    const twice = ["a", "b", "c", "c", "d"];
    expect(pageHolding(twice, "c", 3, 2)).toBe(2);
    expect(pageHolding(twice, "c", 3)).toBe(1);
  });

  it("is null for no row, a row not listed, or no page size", () => {
    expect(pageHolding(ids, null, 3)).toBeNull();
    expect(pageHolding(ids, "", 3)).toBeNull();
    expect(pageHolding(ids, "elsewhere", 3, 2)).toBeNull();
    expect(pageHolding(ids, "g3", 0)).toBeNull();
  });
});

describe("the page a new page size shows (budgetPageOf)", () => {
  const shown = { offset: 6, ids: ["g7", "g8", "g9", "g10", "g11", "g12"] };

  it("holds the row open: a link copied at 6 a page (page 2, the 12th game open) read at 2 a page is page 6, not page 4", () => {
    expect(budgetPageOf(shown, "g12", 2)).toBe(6);
    expect(budgetPageOf(shown, "g7", 4)).toBe(2);
  });

  it("holds the page's first row where no row is open", () => {
    expect(budgetPageOf(shown, null, 2)).toBe(4);
    expect(budgetPageOf({ offset: 0, ids: shown.ids }, null, 4)).toBe(1);
  });

  it("is null while the row open is not on the page shown: the server finds its page", () => {
    expect(budgetPageOf(shown, "g2", 2)).toBeNull();
  });
});
