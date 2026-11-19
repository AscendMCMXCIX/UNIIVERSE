import { describe, expect, it } from "vitest";
import { metText, standoutText } from "./tip-words";

describe("tooltip templates read right on anyone's page", () => {
  it("the Met chip names the games without 'your' (H22)", () => {
    const t = metText({ games: 4, opponent: 3, ally: 1 });
    expect(t).toBe("Met in 4 recorded games, this one included (3 against, 1 on the same team). Opens those games.");
    expect(t).not.toMatch(/\byour?\b/i);
  });
  it("the Best chip says the player's figure without 'your' (H12)", () => {
    const t = standoutText({ label: "vision/min", games: 22, queue: "ranked", role: "Support", value: "1.9", top: "1.6" });
    expect(t).toBe("Best vision/min in the last 22 ranked games as Support: 1.9 (previous best 1.6)");
    expect(t).not.toMatch(/\byour?\b/i);
  });
});
