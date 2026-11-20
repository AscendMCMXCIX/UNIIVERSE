import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/*
  An IntersectionObserver's callback may carry several entries for one element: every change since
  the last call, oldest first, when the call comes late (a busy machine, a page still loading). A
  state that follows one element reads the newest entry. `([entry]) =>` reads the oldest: on
  Release 5 a profile's pinned tabs, brought back to the top by Back and scrolled straight to the end
  of Match History, stayed marked at rest while pinned, and the pinned row never offered Filters
  (issue #323). This test refuses a callback that takes only the first entry.
*/

const SRC = path.join(__dirname, "../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const FIRST_ONLY = /new IntersectionObserver\(\s*(?:async\s*)?\(\s*\[\s*\w+\s*\]/;

describe("an IntersectionObserver's callback reads the newest entry", () => {
  it("the check fires", () => {
    expect(FIRST_ONLY.test("new IntersectionObserver(([entry]) => mark(entry))")).toBe(true);
    expect(FIRST_ONLY.test("new IntersectionObserver(\n  ([ e ]) => {")).toBe(true);
    expect(FIRST_ONLY.test("new IntersectionObserver((entries) => { const e = entries[entries.length - 1]; })")).toBe(false);
  });

  it("no callback takes only the first entry", () => {
    const found = files(SRC)
      .filter((f) => FIRST_ONLY.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(path.join(SRC, ".."), f));
    expect(found).toEqual([]);
  });
});
