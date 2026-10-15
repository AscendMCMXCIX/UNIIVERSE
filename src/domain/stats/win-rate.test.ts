import { describe, expect, it } from "vitest";
import { WIN_RATE_MIN_GAMES, winRateSampleNote, winRateTone } from "./win-rate";

describe("winRateTone", () => {
  it("never colours a figure resting on too few games", () => {
    expect(winRateTone(1, 1, WIN_RATE_MIN_GAMES.champion)).toBe("muted");
    expect(winRateTone(0.8, 4, WIN_RATE_MIN_GAMES.champion)).toBe("muted");
    expect(winRateTone(0.9, 9, WIN_RATE_MIN_GAMES.season)).toBe("muted");
  });

  it("highlights 50% or better once the sample is large enough", () => {
    expect(winRateTone(0.5, 5, WIN_RATE_MIN_GAMES.champion)).toBe("good");
    expect(winRateTone(0.83, 12, WIN_RATE_MIN_GAMES.champion)).toBe("good");
    expect(winRateTone(0.49, 40, WIN_RATE_MIN_GAMES.season)).toBe("plain");
  });

  it("treats a missing figure as muted", () => {
    expect(winRateTone(null, 20, 5)).toBe("muted");
    expect(winRateTone(undefined, 20, 5)).toBe("muted");
    expect(winRateTone(Number.NaN, 20, 5)).toBe("muted");
  });
});

describe("winRateSampleNote", () => {
  it("explains a small sample and stays silent otherwise", () => {
    expect(winRateSampleNote(1, 1, 5)).toMatch(/Only 1 game:/);
    expect(winRateSampleNote(0.6, 5, 5)).toBeNull();
    expect(winRateSampleNote(null, 1, 5)).toBeNull();
  });
});
