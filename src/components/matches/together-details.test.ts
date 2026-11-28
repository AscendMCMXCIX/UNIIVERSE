import { describe, expect, it } from "vitest";
import { flowLimitFor } from "./together-details";

/*
  Team Matches' flow (a phone, a tablet, a short window) opening a link copied in the one-screen workspace
  (`?per=6&page=2&match=…`): the address's page size is dropped there, and the flow's `limit` reaches the end of the
  page that held the game open, so the game stays open (TogetherWorkspace).
*/
describe("the flow's limit for a workspace link to a game (flowLimitFor)", () => {
  const page = { per: 6, offset: 18 };
  const ids = ["g19", "g20", "g21", "g22", "g23", "g24"];

  it("lists the games up to the page's end where the game open is past the flow's first 20", () => {
    expect(flowLimitFor(page, ids, "g22")).toBe(24);
    expect(flowLimitFor({ per: 25, offset: 475 }, ids, "g19")).toBe(500);
    expect(flowLimitFor({ per: 25, offset: 500 }, ids, "g19")).toBe(500);
  });

  it("is null where the first 20 already list it, no game of the page is open, or the list is the flow's", () => {
    expect(flowLimitFor({ per: 6, offset: 6 }, ids, "g19")).toBeNull();
    expect(flowLimitFor(page, ids, null)).toBeNull();
    expect(flowLimitFor(page, ids, "elsewhere")).toBeNull();
    expect(flowLimitFor({ per: null, offset: 0 }, ids, "g19")).toBeNull();
  });
});
