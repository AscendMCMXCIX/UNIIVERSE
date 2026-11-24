import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  The Production check's phone fact for Team Overview (scripts/live-check.mjs, teamFacts) follows the
  lineup's phone layout: since the owner's request of 23 Nov 2026 the cards are a carousel with no
  lineup pager over them, one card on screen centred in the page's gutter and five position dots
  under it. Until then the fact asserted the pager's five players' pictures, which would fail against
  the carousel. e2e/team-carousel.spec.ts asserts the carousel in CI; docs/LIVE_VALIDATION.md says what
  the check asserts, so the three must agree.
*/

const ROOT = path.resolve(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "scripts/live-check.mjs"), "utf8");
const doc = readFileSync(path.join(ROOT, "docs/LIVE_VALIDATION.md"), "utf8");

describe("the Production check's phone Team fact", () => {
  it("asserts the carousel (no pager, one card centred in the gutter, five dots under it), never the pager's pictures", () => {
    expect(script).toContain('"390x844: the lineup is a carousel: no pager, one card on screen centred in the gutter, five position dots under it"');
    expect(script).toMatch(/c\.pager === 0 && c\.onScreen === 1 && !!c\.margins && Math\.abs\(c\.margins\[0\] - c\.margins\[1\]\) <= 1 && c\.dots === 5 && c\.dotsUnder/);
    expect(script).toContain("[data-testid=lineup-indicator-dot]");
    expect(script).not.toContain("the lineup pager holds the five players' pictures");
    expect(script).not.toContain("lineup-dot-picture");
  });

  it("asserts the active card takes the height above the tab bar (Release 16)", () => {
    expect(script).toContain('"390x844: the active card takes the height above the tab bar (its dots within 24px of it), the five cards one height"');
    expect(script).toMatch(/c\.dotsBottom \+ f\.scrollY <= f\.tabBarTop && f\.tabBarTop - \(c\.dotsBottom \+ f\.scrollY\) <= 24 && c\.heights === 1/);
    expect(doc).toContain("the active card takes the height above the tab bar: its position dots end within 24px of the tab bar, and the five cards share one height (Release 16)");
  });

  it("is described as such in docs/LIVE_VALIDATION.md", () => {
    expect(doc).toContain("the lineup is the carousel (23 Nov 2026): no lineup pager over it, one card on screen with its two margins within 1px of each other (the page's gutter), and five position dots shown under it");
    expect(doc).not.toMatch(/and the lineup pager holds the five players' pictures \(S3a, 20 Nov 2026: the role names alone before\);/);
  });
});
