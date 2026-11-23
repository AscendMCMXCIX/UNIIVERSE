import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  The Production check's wide-screen frame facts (scripts/live-check.mjs, wideChecks) follow the
  shared frame's rule (app-shell.tsx, FRAME; docs/STANDARDS.md → Page layout): since the owner's
  review of 23 Nov 2026 every page's column is centred in the room beside the sidebar, and pages of
  one width share one x. Until then every page started at one x (S2c), and the fact that held that
  failed against the centred frame (found on Release 13). e2e/desktop-frame.spec.ts asserts the same
  rule in CI; docs/LIVE_VALIDATION.md says what the check asserts, so the three must agree.
*/

const ROOT = path.resolve(__dirname, "../../..");
const script = readFileSync(path.join(ROOT, "scripts/live-check.mjs"), "utf8");
const doc = readFileSync(path.join(ROOT, "docs/LIVE_VALIDATION.md"), "utf8");

describe("the Production check's wide-screen frame facts", () => {
  it("assert each page centred beside the sidebar and pages of one width at one x, never one x for every page", () => {
    expect(script).toContain('"2560: every page loaded is centred in the room beside the sidebar (the shared frame)"');
    expect(script).toContain('"2560: pages of one width start at one x"');
    expect(script).not.toContain("every page loaded starts at one x");
    // Both margins within 1px of each other, measured against main inside its padding.
    expect(script).toMatch(/Math\.abs\(c\.margins\[0\] - c\.margins\[1\]\) <= 1/);
  });

  it("are described as such in docs/LIVE_VALIDATION.md", () => {
    expect(doc).toContain("Every page loaded is centred in the room beside the sidebar, its two margins equal within 1px, and pages of one width start at one x within 1px");
    expect(doc).not.toContain("Every page loaded starts at one x, within 1px");
  });
});
