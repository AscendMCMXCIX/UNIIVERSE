import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  The Production check's signed-out boundary (scripts/live-check.mjs, healthAndSecurity): the
  member and Admin Mode pages it proves are turned away to sign-in, signed out and with a forged
  session cookie. docs/LIVE_VALIDATION.md ("What it checks") lists the same pages, and what is
  called production-verified rests on that list (CLAUDE.md §5), so the two must agree. Champion
  Intel is among them: a page for signed-in accounts only (docs/CHAMPION_INTEL.md, "Compliance").
  Several branches edit the script, so a merge that drops a page fails here rather than going
  unnoticed.
*/

const ROOT = path.resolve(__dirname, "../../..");

/** The fixed pages the live check requests signed out (its `paths` list; a member's own pages are added as it runs). */
function boundaryPaths(): string[] {
  const script = readFileSync(path.join(ROOT, "scripts/live-check.mjs"), "utf8");
  const list = /function healthAndSecurity[\s\S]*?const paths = \[([^\]]*)\]/.exec(script)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].flatMap((m) => (m[1] ? [m[1]] : []));
}

/** The pages LIVE_VALIDATION.md says the check turns away: the addresses in its signed-out line, before a member's own pages. */
function documentedPaths(): string[] {
  const doc = readFileSync(path.join(ROOT, "docs/LIVE_VALIDATION.md"), "utf8");
  const line = doc.split("\n").find((l) => l.includes("Signed out and with a forged session cookie")) ?? "";
  const pages = line.split("a real member's")[0] ?? "";
  return [...pages.matchAll(/`(\/[^`]*)`/g)].flatMap((m) => (m[1] ? [m[1]] : []));
}

describe("the live check's signed-out boundary", () => {
  it("turns Champion Intel away signed out, with the other member pages", () => {
    const paths = boundaryPaths();
    expect(paths).toContain("/lookup");
    expect(paths).toContain("/team");
  });

  it("is the list docs/LIVE_VALIDATION.md gives", () => {
    const paths = boundaryPaths();
    expect(paths.length).toBeGreaterThan(10);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...documentedPaths()].sort()).toEqual([...paths].sort());
  });
});
