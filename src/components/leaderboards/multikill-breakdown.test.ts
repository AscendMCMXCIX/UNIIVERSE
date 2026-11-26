import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MultikillBreakdown, MultikillsView } from "@/server/leaderboards/recent-view";
import { MultikillBreakdownBody } from "./multikill-breakdown";

/*
  The Score breakdown's words as markup, for the comparison the demo never shows: the team-wide
  fallback (fewer than 1,000 other players' games stored, a new team or a season's start). There the
  score is not champion- or role-adjusted, and the breakdown says so; no line of it may then claim
  the score is relative to the champions and roles played (the requirements' §5; the review of
  25 Nov 2026 found the placements example still did). The comparison against other players keeps
  its champion-and-role words.
*/

const CHAMPIONS = { Ahri: { id: "Ahri", name: "Ahri", portraitUrl: "" } };
const breakdown = (o: Partial<MultikillBreakdown> = {}): MultikillBreakdown => ({
  score: "112",
  place: "1st of 2",
  games: "30 games with multikill counts",
  coverage: null,
  role: { kind: "role", roles: ["MID"], label: "Most played: Mid, 100% of 30 games", rows: [{ role: "MID", label: "Mid", share: "100%", games: "30 games", text: "Mid — 100% (30 games)" }] },
  champions: [{ championId: "Ahri", role: "MID", games: "30 games" }],
  kinds: [
    { key: "double", label: "Double kills", made: "20", weight: "2", points: "40" },
    { key: "triple", label: "Triple kills", made: "2", weight: "3", points: "6" },
    { key: "quadra", label: "Quadra kills", made: "0", weight: "4", points: "0" },
    { key: "penta", label: "Pentakills", made: "0", weight: "5", points: "0" },
  ],
  calculation: { earned: "46", expected: "36.8", cushion: "40", score: "112" },
  comparison: [{ basis: "champion-role", label: "By champion and role", games: "30 games" }],
  notAdjusted: false,
  chance: "±12",
  ...o,
});
const SAME_GAMES: Pick<MultikillsView, "source" | "sourceText" | "ruleText"> = {
  source: "same-games",
  sourceText: "Typical results come from 2,400 games of other players in the team's stored season matches, excluding team members — not every League player.",
  ruleText: "Each multikill counts once, at its largest: a pentakill is not also counted as a double, triple and quadra.",
};
const TEAM: Pick<MultikillsView, "source" | "sourceText" | "ruleText"> = {
  source: "team",
  sourceText: "Typical results come from the team's own 412 games with multikill counts, every position together: too few other players' games are stored for a champion and role comparison.",
  ruleText: SAME_GAMES.ruleText,
};
/** The breakdown's visible words: tags gone, entities decoded. */
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const render = (board: typeof TEAM, o: Partial<MultikillBreakdown> = {}) => renderToStaticMarkup(createElement(MultikillBreakdownBody, { breakdown: breakdown(o), board, champions: CHAMPIONS }));

describe("the Score breakdown", () => {
  it("compared with other players, says what counts is how far each is above typical for their champions and roles", () => {
    const html = render(SAME_GAMES);
    expect(html).toContain('data-source="same-games"');
    expect(words(html)).toContain("what counts is how far each is above typical for their champions and roles.");
    expect(words(html)).toContain("Typical for these champions and roles");
    expect(html).not.toContain('data-testid="breakdown-not-adjusted"');
  });

  it("on the team-wide fallback, says plainly the score is not champion- or role-adjusted, and never claims it is", () => {
    const html = render(TEAM, { notAdjusted: true, comparison: [{ basis: "team", label: "The team's own games", games: "30 games" }] });
    const text = words(html);
    expect(html).toContain('data-source="team"');
    expect(text).toContain("This score is not champion- or role-adjusted.");
    expect(text).toContain("Typical at the team's rate");
    // The placements example, like every other line, compares with the team's typical results, not by champion and role.
    expect(text).toContain("what counts is how far each is above the team's typical results.");
    expect(text).not.toMatch(/champions and roles/i);
    expect(text).not.toMatch(/for their champions/i);
  });

  it("works nothing out: the final line is the breakdown's own figures", () => {
    const html = render(TEAM, { notAdjusted: true });
    expect(html).toContain('data-earned="46" data-expected="36.8" data-cushion="40" data-score="112"');
    expect(words(html)).toContain("100 × (46 + 40) ÷ (36.8 + 40) = 112");
  });
});
