import { describe, expect, it } from "vitest";
import { axisRange } from "./score-chart";

describe("the score chart's axis", () => {
  it("fits the data with 5 in view, at least 3 points apart, whole numbers within 0–10", () => {
    expect(axisRange([5.1, 5.3, 4.9])).toEqual([3, 7]);
    expect(axisRange([6.2, 7.4, 8.1])).toEqual([4, 9]);
    expect(axisRange([1.2, 3.4])).toEqual([0, 6]);
    expect(axisRange([9.6, 9.9])).toEqual([4, 10]);
    expect(axisRange([])).toEqual([3, 7]);
  });
});
