import { describe, expect, it } from "vitest";
import { LIST_PER_COOKIES, LIST_PER_MAX, listPerCookie, readListPer } from "./list-per";

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
