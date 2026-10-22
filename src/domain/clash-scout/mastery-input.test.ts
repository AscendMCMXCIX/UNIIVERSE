import { describe, expect, it } from "vitest";
import { formatMastery, inferPrecision, parseMasteryText, roundMastery } from "./mastery-input";

const parsed = (text: string) => {
  const r = parseMasteryText(text);
  if (!r.ok) throw new Error(r.error);
  return [r.value.points, r.value.precision] as const;
};

describe("mastery points as people write them", () => {
  it("reads exact figures, with or without grouping", () => {
    expect(parsed("150000")).toEqual([150_000, 0]);
    expect(parsed("150,000")).toEqual([150_000, 0]);
    expect(parsed("150 000")).toEqual([150_000, 0]);
    expect(parsed("150.000")).toEqual([150_000, 0]);
    expect(parsed("1,234,567")).toEqual([1_234_567, 0]);
    expect(parsed(" 42000 pts ")).toEqual([42_000, 0]);
  });

  it("reads the client's short forms and keeps how precise they are", () => {
    expect(parsed("150k")).toEqual([150_000, 500]);
    expect(parsed("150K")).toEqual([150_000, 500]);
    expect(parsed("150.4k")).toEqual([150_400, 50]);
    expect(parsed("150,4k")).toEqual([150_400, 50]);
    expect(parsed("150.45k")).toEqual([150_450, 5]);
    expect(parsed("1.2m")).toEqual([1_200_000, 50_000]);
    expect(parsed("1.25M")).toEqual([1_250_000, 5_000]);
    expect(parsed("1m")).toEqual([1_000_000, 500_000]);
    expect(parsed("175.4 K")).toEqual([175_400, 50]);
  });

  it("refuses what is not a number of points, with a hint", () => {
    for (const bad of ["", "abc", "150.4", "1.2.3k", "k", "-5000", "0", "1,200k", "12,34,567", "150,000.5"]) {
      const r = parseMasteryText(bad);
      expect(r.ok, bad).toBe(false);
    }
    const r = parseMasteryText("lots");
    expect(!r.ok && r.error).toMatch(/150000, 150,000, 150k, 150.4k or 1.2m/);
    expect(parseMasteryText("99999999").ok).toBe(false);
  });

  it("writes a figure back as precisely as it was given", () => {
    expect(formatMastery(150_000, 0)).toBe("150,000");
    expect(formatMastery(150_000, 500)).toBe("150k");
    expect(formatMastery(150_400, 50)).toBe("150.4k");
    expect(formatMastery(150_450, 5)).toBe("150.45k");
    expect(formatMastery(1_200_000, 50_000)).toBe("1.2m");
    expect(formatMastery(1_250_000, 5_000)).toBe("1.25m");
  });

  it("rounds like the client, or to thousands, for test inputs", () => {
    expect(roundMastery(175_449, "client")).toEqual({ points: 175_400, precision: 50, text: "175.4k" });
    expect(roundMastery(1_234_567, "client")).toEqual({ points: 1_200_000, precision: 50_000, text: "1.2m" });
    expect(roundMastery(175_449, "thousands")).toEqual({ points: 175_000, precision: 500, text: "175k" });
    expect(roundMastery(1_234_567, "thousands")).toEqual({ points: 1_235_000, precision: 500, text: "1235k" });
    expect(roundMastery(175_449, "exact")).toEqual({ points: 175_449, precision: 0, text: "175,449" });
  });

  it("guesses a screenshot figure's precision from its digits", () => {
    expect(inferPrecision(175_400)).toBe(50);
    expect(inferPrecision(175_000)).toBe(500);
    expect(inferPrecision(1_200_000)).toBe(50_000);
    expect(inferPrecision(175_449)).toBe(0);
  });
});
