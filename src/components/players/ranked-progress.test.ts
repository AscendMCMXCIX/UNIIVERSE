import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RankSnapshot } from "@/domain/rank-progress";
import type { RankHistoryAccount } from "@/server/accounts/rank-history";
import { RankedProgress } from "./ranked-progress";

const NOW = Date.UTC(2026, 10, 4, 12);
const D = (m: number, d: number, h = 12) => Date.UTC(2026, m - 1, d, h);
const snap = (at: number, tier: string | null, division: string | null, lp: number | null, wins: number | null, losses: number | null, confirmedAt: number | null = null): RankSnapshot => ({ queue: "solo", tier, division, leaguePoints: lp, wins, losses, capturedAt: at, confirmedAt });
const render = (snapshots: RankSnapshot[]) => {
  const account: RankHistoryAccount = { id: "a1", label: "main", riotId: "Name#TAG", snapshots, weeks: { solo: [], flex: [] } };
  return renderToStaticMarkup(createElement(RankedProgress, { accounts: [account], queue: "solo", accountId: null, href: () => "#", now: NOW }));
};
const text = (html: string, testId: string) => {
  const m = new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html);
  return m?.[1] ?? null;
};

describe("RankedProgress", () => {
  it("writes the highest recorded rank whole, LP never cut off, with the rank in a tooltip", () => {
    const html = render([snap(D(10, 15), "GRANDMASTER", null, 999, 300, 200), snap(D(11, 1), "GRANDMASTER", null, 950, 310, 205)]);
    expect(html).toContain("Grandmaster · 999 LP");
    expect(html).toMatch(/<span class="block text-sm font-semibold text-fg" title="Grandmaster 999 LP">/);
  });

  it("never credits the 30 days with unseen games that straddle their start", () => {
    // 20 Sep seen only that day, fifteen games unseen to 10 Oct, then 1 Nov: since 10 Oct, +24 LP.
    const html = render([snap(D(9, 20), "GOLD", "II", 10, 50, 50), snap(D(10, 10), "GOLD", "II", 40, 60, 55), snap(D(11, 1), "GOLD", "II", 64, 70, 58)]);
    expect(text(html, "ranked-change")).toBe("+24 LP");
    expect(html).toContain("Since 10 Oct");
    expect(html).not.toContain("Last 30 days");
  });

  it("says no change for a rank read before the 30 days and confirmed inside them", () => {
    const html = render([snap(D(9, 1), "GOLD", "I", 70, 40, 40), snap(D(10, 1), "GOLD", "II", 40, 50, 50, D(11, 3))]);
    expect(text(html, "ranked-change")).toBe("No change");
    expect(html).toContain("Gold II 40 LP since 1 Oct");
  });

  it("says an unranked account has nothing to compare, not that readings are missing", () => {
    const html = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 20), "GOLD", "II", 60, 101, 90), snap(D(11, 1), null, null, null, null, null)]);
    expect(text(html, "ranked-change-none")).toBe("Unranked now: nothing to compare");
  });

  it("ends with the chart: no History and coverage disclosure, no year strip, rank changes or readings table", () => {
    // The days the rank is known (5 of 301 here) are still worked out by rankedYearCoverage, and
    // tested there (domain/rank-timeline.test.ts); the card no longer shows them.
    const html = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90, D(10, 15, 20)), snap(D(10, 16), "GOLD", "II", 70, 101, 90), snap(D(10, 18), "GOLD", "I", 12, 104, 91, D(10, 18, 18)), snap(D(10, 20), "GOLD", "II", 75, 104, 92)]);
    for (const gone of ["<details", "<summary", "History and coverage", "ranked-details", "ranked-coverage", "ranked-events", "ranked-key", "ranked-table", "Every reading", "Rank changes recorded"]) expect(html, gone).not.toContain(gone);
    // What the card keeps: the season and the first reading, the current rank and LP, Riot's record,
    // the change and the highest recorded rank, and the chart, which ends the card.
    expect(text(html, "ranked-tracking")).toBe("Name#TAG · 2026 Season 3 · rank recorded since 15 Oct 2026");
    expect(text(html, "ranked-current")).toBe("Gold II · 75 LP");
    expect(html).toContain("104W 92L · 53% · 2026 (Riot)");
    expect(html).toContain('data-testid="ranked-peak-stat"');
    expect(html).toMatch(/data-testid="ranked-chart"[\s\S]*<\/section>$/);
  });
});
