import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nextEnabled, runsOf, typeAhead, type SelectOption } from "./select";

const OPTIONS: SelectOption[] = [
  { value: "all", label: "All supported games" },
  { value: "solo", label: "Ranked Solo/Duo" },
  { value: "flex", label: "Ranked Flex" },
  { value: "x", label: "Retired", disabled: true },
  { value: "normal", label: "Normal Draft" },
];

describe("Select's keyboard", () => {
  it("type-ahead finds the next option starting with what was typed, and a repeated letter cycles", () => {
    expect(typeAhead(OPTIONS, "r", 0)).toBe(1);
    expect(typeAhead(OPTIONS, "r", 1)).toBe(2);
    // The disabled "Retired" is skipped, and the search wraps round.
    expect(typeAhead(OPTIONS, "r", 2)).toBe(1);
    expect(typeAhead(OPTIONS, "rr", 1)).toBe(2);
    // A word: from the current option, which may already match.
    expect(typeAhead(OPTIONS, "ranked f", 1)).toBe(2);
    expect(typeAhead(OPTIONS, "ranked", 1)).toBe(1);
    expect(typeAhead(OPTIONS, "z", 0)).toBe(-1);
    expect(typeAhead(OPTIONS, "", 0)).toBe(-1);
  });

  it("the arrows, Home and End skip disabled options and stop at the ends", () => {
    expect(nextEnabled(OPTIONS, 2, 1)).toBe(4);
    expect(nextEnabled(OPTIONS, 4, -1)).toBe(2);
    expect(nextEnabled(OPTIONS, 4, 1)).toBe(4);
    expect(nextEnabled(OPTIONS, 0, -1)).toBe(0);
    expect(nextEnabled(OPTIONS, -1, 1)).toBe(0);
    expect(nextEnabled(OPTIONS, OPTIONS.length, -1)).toBe(4);
  });

  it("groups consecutive options under one heading, as an optgroup", () => {
    const runs = runsOf([
      { value: "", label: "With or without them" },
      { value: "with:a", label: "With A", group: "A" },
      { value: "against:a", label: "Against A", group: "A" },
      { value: "with:b", label: "With B", group: "B" },
    ]);
    expect(runs.map((r) => [r.group, r.items.map((i) => i.index)])).toEqual([
      [undefined, [0]],
      ["A", [1, 2]],
      ["B", [3]],
    ]);
  });
});

/** Every .tsx file under src. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

describe("one Select (UD.X7, M1)", () => {
  it("no page or component draws the browser's own select: only ui/select.tsx does, in the phone posture", () => {
    const src = path.resolve(__dirname, "../..");
    const allowed = new Set(["components/ui/input.tsx", "components/ui/select.tsx"].map((f) => path.join(src, f)));
    const offenders = sources(src)
      .filter((f) => !allowed.has(f))
      .filter((f) => /<select[\s>]|NativeSelect|selectClass\(/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(src, f));
    expect(offenders).toEqual([]);
  });
});
