import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamInsights } from "./team-insights";
import type { TeamInsightsPageView } from "@/server/matches/team-insights-view";

/*
  The page's markup for the states the demo cannot reach (it has too few shared games to test
  anything): findings with and without a mirror, checked rows with each status, and the comparisons
  not checked, grouped by why. The browser test covers the demo's state at three widths with axe.
*/

const view: TeamInsightsPageView = {
  title: "Team insights",
  scope: "Season 2026 · 1,400 games of 7 members, 600 played together · 8 Jan 2026 – 3 Nov 2026",
  findings: [
    { key: "with-team:a", headline: "Ace has won more often with teammates than alone.", detail: "61% of 300 games with teammates, 49% of 500 games alone. Within the same game mode and role: +12 points, likely between +4 and +20.", mirror: null, span: "8 Jan 2026 – 3 Nov 2026", direction: "more" },
    { key: "with-teammate:a:b", headline: "Ace has won less often with Bea on the team.", detail: "40% of 80 games with Bea, 55% of 720 games without.", mirror: "Bea has won less often with Ace on the team. 40% of 80 games with Ace, 54% of 400 games without.", span: "1 Feb 2026 – 2 Nov 2026", direction: "less" },
  ],
  nothing: null,
  method: ["One.", "Two."],
  rows: [
    { key: "with-team:a", label: "Ace with teammates, against alone", records: "With teammates: 61% of 300 games · Alone: 49% of 500 games", result: "+12 points (+4 to +20)", status: "finding", reason: null },
    { key: "with-team:c", label: "Cy with teammates, against alone", records: "With teammates: 52% of 3,000 games · Alone: 48% of 3,000 games", result: "+4 points (+2 to +6)", status: "small", reason: null },
    { key: "with-team:d", label: "Dee with teammates, against alone", records: "With teammates: 50% of 60 games · Alone: 51% of 90 games", result: "-1 points (-17 to +15)", status: "chance", reason: null },
    { key: "with-teammate:a:e", label: "Ace with Eve, against without", records: "With Eve: 60% of 5 games · Without Eve: 50% of 795 games", result: "Needs 20 comparable games on each side (has 5)", status: "untested", reason: "too-few-games" },
    { key: "with-teammate:a:f", label: "Ace with Fin, against without", records: "With Fin: 55% of 90 games · Without Fin: 50% of 710 games", result: "Not tested: in these games this teammate cannot be told apart from other teammates (they play together, or in a fixed pattern)", status: "untested", reason: "inseparable" },
  ],
  excluded: "Left out: 3 games whose side could not be read.",
};

const html = (v: TeamInsightsPageView, preview = true) => renderToStaticMarkup(createElement(TeamInsights, { view: v, preview }));

describe("TeamInsights markup", () => {
  it("lists findings with their detail, mirror and dates, and an arrow that is decoration only", () => {
    const out = html(view);
    expect(out.match(/data-testid="insight-finding"/g)).toHaveLength(2);
    expect(out).toContain("Bea has won less often with Ace on the team.");
    expect(out).toContain("1 Feb 2026 – 2 Nov 2026");
    // Icons never carry meaning on their own.
    expect(out.match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).not.toContain('data-testid="insights-nothing"');
  });

  it("gives every checked comparison its words, not only a colour", () => {
    const out = html(view);
    expect(out.match(/data-testid="insight-row"/g)).toHaveLength(3);
    for (const label of ["Stands out", "Under 5 points", "Within chance"]) expect(out).toContain(label);
  });

  it("groups the comparisons not checked by why, under labels that are not headings", () => {
    const out = html(view);
    expect(out).toContain("3 checked");
    expect(out).toContain("1 waiting for more games");
    expect(out).toContain("1 not compared");
    expect(out).toMatch(/data-testid="insights-waiting"[\s\S]*Ace with Eve/);
    expect(out).toMatch(/data-testid="insights-blocked"[\s\S]*Ace with Fin/);
    // One h1 and one h2: nothing in the comparisons list joins the findings' outline.
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out.match(/<h2/g)).toHaveLength(1);
    expect(out).not.toMatch(/<h3/);
  });

  it("says plainly when nothing stands out, and marks the preview", () => {
    const out = html({ ...view, findings: [], nothing: "Nothing stands out. 12 comparisons were checked, and none differs by more than chance would explain." });
    expect(out).toContain('data-testid="insights-nothing"');
    expect(out).toContain("Nothing stands out. 12 comparisons were checked");
    expect(out).toContain("Preview for administrators");
    expect(html(view, false)).not.toContain("Preview for administrators");
    expect(out).toContain('href="/matches"');
  });
});
