import { describe, expect, it } from "vitest";
import { fitPagesNext } from "./post-game";

/*
  The post-game view's pages by measure (the workspace's game window, a fixed height with nothing scrolling
  inside: PostGame's fitPages): whole while it fits the window's room, its three pages where it does not, and
  whole again only once the room grows past the height it had then or changes width (never flipping back and
  forth on the same room).
*/
describe("the game window's pages by measure", () => {
  it("draws the view whole while it fits its room, and pages it where it does not", () => {
    expect(fitPagesNext(false, { view: 527, room: 653, roomWidth: 1176, at: null })).toBe(false);
    expect(fitPagesNext(false, { view: 542, room: 542, roomWidth: 1176, at: null })).toBe(false);
    expect(fitPagesNext(false, { view: 555, room: 542, roomWidth: 1176, at: null })).toBe(true);
  });

  it("stays paged on the same room, however short the paged view is", () => {
    const at = { room: 542, width: 1176 };
    expect(fitPagesNext(true, { view: 470, room: 542, roomWidth: 1176, at })).toBe(true);
    expect(fitPagesNext(true, { view: 470, room: 530, roomWidth: 1176, at })).toBe(true);
  });

  it("measures the whole view again once the room grows or changes width", () => {
    const at = { room: 542, width: 1176 };
    expect(fitPagesNext(true, { view: 470, room: 653, roomWidth: 1176, at })).toBe(false);
    expect(fitPagesNext(true, { view: 470, room: 542, roomWidth: 1100, at })).toBe(false);
  });
});
