import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PLACEMENT_TONE, PlacementBadge, placementKind, placementWord, placementWords, type Placement } from "./placement-badge";
import { ScoreMark, ScoreMarkEmpty, scoreWords } from "../match-history/score-mark";
import { SCORE_METHOD, SCORE_METHOD_NEUTRAL } from "../match-history/performance-panel";

/*
  The one place badge (the owner's requirements of 25 Nov 2026, §1): MVP gold, ACE violet, any other
  place restrained, one shape at every size, MVP and ACE in place of the ordinal (the ordinal kept in
  the words), and the score mark that pairs it with the score on a collapsed game.
*/

const place = (rank: number, over: Partial<Placement> = {}): Placement => ({ rank, of: 10, mvp: false, ace: false, ...over });
const render = (props: Parameters<typeof PlacementBadge>[0]) => renderToStaticMarkup(createElement(PlacementBadge, props));
const classOf = (html: string) => html.match(/class="([^"]*)"/)![1]!.split(" ");

describe("PlacementBadge", () => {
  it("says MVP or ACE in place of the ordinal, and the ordinal for any other place", () => {
    expect(placementWord(place(1, { mvp: true }))).toBe("MVP");
    expect(placementWord(place(1, { ace: true }))).toBe("ACE");
    expect(placementWord(place(3))).toBe("3rd");
    expect(placementWord(place(10))).toBe("10th");
    expect(placementKind(place(2, { mvp: true }))).toBe("mvp");
    expect(placementKind(place(2))).toBe("place");
  });

  it("names what MVP and ACE mean, with the place among the scored players", () => {
    expect(placementWords(place(1, { mvp: true }))).toBe("MVP: highest score on the winning team, 1st of 10");
    expect(placementWords(place(2, { ace: true, of: 9 }))).toBe("ACE: highest score on the losing team, 2nd of 9");
    expect(placementWords(place(7))).toBe("7th of 10");
  });

  it("draws MVP in the fixed gold, ACE in the fixed violet and other places restrained, never Branding's colours", () => {
    const mvp = classOf(render({ placement: place(1, { mvp: true }) }));
    const ace = classOf(render({ placement: place(2, { ace: true }) }));
    const third = classOf(render({ placement: place(3) }));
    expect(mvp).toEqual(expect.arrayContaining(["text-gold", "bg-gold/15", "ring-gold/45", "font-bold"]));
    expect(ace).toEqual(expect.arrayContaining(["text-violet", "bg-violet/15", "ring-violet/45", "font-bold"]));
    expect(third).toEqual(expect.arrayContaining(["text-fg-muted", "font-semibold"]));
    expect(third.some((c) => c.startsWith("ring"))).toBe(false);
    for (const tone of Object.values(PLACEMENT_TONE)) expect(tone).not.toMatch(/accent/);
  });

  it("keeps one shape at each size whatever it says, and its place in data for the checks", () => {
    for (const size of ["row", "card", "header"] as const) {
      const shapes = [place(1, { mvp: true }), place(1, { ace: true }), place(10)].map((p) => classOf(render({ placement: p, size })).filter((c) => /^(h-|min-w-|px-|text-(2xs|xs)$|rounded-full$)/.test(c)).sort().join(" "));
      expect(new Set(shapes).size, size).toBe(1);
    }
    expect(render({ placement: place(1, { mvp: true }), testId: "participant-mvp" })).toMatch(/data-testid="participant-mvp" data-placement="mvp" data-rank="1" data-of="10"/);
  });

  it("speaks for itself, or stays silent where the words around it already say the place", () => {
    const spoken = render({ placement: place(1, { mvp: true }) });
    expect(spoken).toContain('<span aria-hidden="true">MVP</span><span class="sr-only">MVP: highest score on the winning team, 1st of 10</span>');
    const silent = render({ placement: place(4), spoken: false });
    expect(silent).toMatch(/^<span[^>]*aria-hidden="true"[^>]*>4th<\/span>$/);
  });

  it("is server-safe: no hooks and nothing from the server, so the server-rendered Team Matches list can draw it", () => {
    for (const file of ["placement-badge.tsx", "../match-history/score-mark.tsx"]) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source, file).not.toMatch(/"use client"|\buse[A-Z]\w*\(|@\/server\//);
    }
  });
});

describe("ScoreMark", () => {
  const score = { score: 7.4, rank: 1, of: 10, mvp: true, ace: false };
  it("shows the score in the primary colour and bold with the badge, and says both in one sentence", () => {
    const html = renderToStaticMarkup(createElement(ScoreMark, { score, layout: "stack", testId: "match-score", badgeTestId: "match-placement" }));
    expect(html).toContain('data-testid="match-score" data-score="7.4" data-rank="1" data-of="10" data-mvp="true"');
    expect(html).toMatch(/class="[^"]*font-bold[^"]*text-fg[^"]*text-xl[^"]*"[^>]*data-testid="score-value">7\.4</);
    expect(html).toContain('data-testid="match-placement" data-placement="mvp"');
    expect(html).toContain(`<span class="sr-only">${scoreWords(score)}</span>`);
    expect(scoreWords(score)).toBe("Performance score 7.4, 1st of 10, MVP");
    expect(scoreWords({ ...score, mvp: false, ace: true, rank: 2 })).toBe("Performance score 7.4, 2nd of 10, ACE");
  });

  it("keeps the score's place without one: a quiet dash, hidden from screen readers, never counted as a score", () => {
    const html = renderToStaticMarkup(createElement(ScoreMarkEmpty, { testId: "match-score-empty" }));
    expect(html).toContain('aria-hidden="true" data-testid="match-score-empty"');
    expect(html).toContain("text-fg-subtle");
    expect(html).not.toContain("match-score\"");
  });
});

describe("the score's (i) in the opened game", () => {
  it("says one concept in at most two short sentences: UNIIVERSE's own score (not OP.GG's), how it is compared, and its scale; MVP and ACE are the badge's words", () => {
    for (const text of [SCORE_METHOD, SCORE_METHOD_NEUTRAL]) {
      expect(text).toMatch(/^UNIIVERSE's own score, not OP\.GG's: /);
      expect(text).toMatch(/ 5 is average\.$/);
      expect(text.split(/(?<=\.)\s+/).length, text).toBeLessThanOrEqual(2);
      expect(text.split(/\s+/).length, text).toBeLessThanOrEqual(25);
      expect(text, text).not.toMatch(/\b(MVP|ACE|OP Score)\b/);
    }
  });
});
