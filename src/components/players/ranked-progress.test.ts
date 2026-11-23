import { describe, expect, it, vi } from "vitest";

// The account select navigates with the app router; rendered here on the server, it needs none.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RankSnapshot } from "@/domain/rank-progress";
import type { RankHistoryAccount } from "@/server/accounts/rank-history";
import { RankedProgress } from "./ranked-progress";

const NOW = Date.UTC(2026, 10, 4, 12);
const D = (m: number, d: number, h = 12) => Date.UTC(2026, m - 1, d, h);
const snap = (at: number, tier: string | null, division: string | null, lp: number | null, wins: number | null, losses: number | null, confirmedAt: number | null = null): RankSnapshot => ({ queue: "solo", tier, division, leaguePoints: lp, wins, losses, capturedAt: at, confirmedAt });
const render = (snapshots: RankSnapshot[]) => {
  const account: RankHistoryAccount = { id: "a1", label: "main", riotId: "Name#TAG", snapshots };
  return renderToStaticMarkup(createElement(RankedProgress, { accounts: [account], queue: "solo", accountId: null, href: () => "#", now: NOW }));
};
const text = (html: string, testId: string) => {
  const m = new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html);
  return m?.[1] ?? null;
};

describe("RankedProgress", () => {
  it("writes the highest recorded rank whole, LP never cut off, with no title repeating it", () => {
    const html = render([snap(D(10, 15), "GRANDMASTER", null, 999, 300, 200), snap(D(11, 1), "GRANDMASTER", null, 950, 310, 205)]);
    expect(html).toContain("Grandmaster · 999 LP");
    // Behind the ⓘ beside the rank since the UX review of Release 13, whole, as one sentence.
    expect(text(html, "ranked-peak-stat")).toMatch(/^Highest recorded: Grandmaster · 999\u00a0LP, first checked 15 Oct\.$/);
    expect(html).not.toMatch(/title="[^"]*Grandmaster/);
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

  it("says in a line what was recorded when there are too few changes to draw, with no frame around it, and draws the chart from two changes", () => {
    // One reading, the same rank confirmed later: no change.
    const one = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90, D(11, 1))]);
    expect(one).not.toContain('data-testid="ranked-chart"');
    expect(text(one, "ranked-no-chart")).toBe("Gold II\u00a046\u00a0LP since 15 Oct: no change recorded.");
    // Two different readings: one change, both ranks written whole.
    const two = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 20), "GOLD", "I", 12, 104, 91)]);
    expect(text(two, "ranked-no-chart")).toBe("One change so far: Gold II 46 LP to Gold I 12 LP. A chart appears after the next.");
    // Unranked at every check.
    expect(text(render([snap(D(10, 15), null, null, null, null, null)]), "ranked-no-chart")).toBe("Unranked at every check so far.");
    // The line is quiet text: no dashed box, no border of its own inside the card.
    expect(two).toMatch(/<p class="text-xs leading-relaxed text-fg-muted" data-testid="ranked-no-chart"/);
    // Three different readings (two changes): the chart, in its fill mode.
    const three = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 20), "GOLD", "I", 12, 104, 91), snap(D(10, 25), "GOLD", "I", 40, 106, 92)]);
    expect(three).toContain('data-testid="ranked-chart"');
    expect(three).not.toContain('data-testid="ranked-no-chart"');
    expect(three).toMatch(/data-testid="ranked-chart-box"/);
    // No rule between the rank and its movement: one surface.
    expect(three).not.toMatch(/id="ranked-movement" class="[^"]*border-t/);
  });

  it("leads with the rank and the 30-day change on one row, keeps the rest behind the ⓘ beside the rank, and draws a compact chart", () => {
    const html = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 20), "GOLD", "I", 12, 104, 91), snap(D(10, 25), "GOLD", "I", 40, 106, 92)]);
    // The rank and the change share the row before the chart's part (never folded on a phone).
    const row = html.slice(0, html.indexOf('id="ranked-chart-fold"'));
    expect(row).toContain('data-testid="ranked-current"');
    expect(row).toMatch(/<dl id="ranked-movement" class="max-w-full shrink-0">/);
    // The account line, the highest rank and the change's path: only in the tip beside the rank.
    expect(html).toMatch(/aria-label="About this rank"/);
    for (const id of ["ranked-tracking", "ranked-peak-stat", "ranked-change-path"]) expect(html.match(new RegExp(`data-testid="${id}"`, "g")), id).toHaveLength(1);
    expect(html).not.toMatch(/<p[^>]*id="ranked-tracking"/);
    // A compact chart, 7.5rem tall, never stretched to the card (the review: small moves looked large).
    expect(html).toMatch(/data-testid="ranked-chart-box"/);
    expect(html).toMatch(/class="block h-30 /);
  });

  it("a history whose rank and LP never changed is a sentence, however many checks it has, never a flat chart", () => {
    // Four checks of the same rank and LP (Riot's record changed: a remade game), and an account read again later.
    const html = render([snap(D(10, 3), "GOLD", "II", 46, 100, 90), snap(D(10, 9), "GOLD", "II", 46, 101, 90), snap(D(10, 20), "GOLD", "II", 46, 101, 91), snap(D(11, 1), "GOLD", "II", 46, 102, 91)]);
    expect(html).not.toContain('data-testid="ranked-chart"');
    expect(text(html, "ranked-no-chart")).toBe("Gold II\u00a046\u00a0LP since 3 Oct: no change recorded.");
    // Never a movement it did not see: the 30 days say no change too.
    expect(text(html, "ranked-change")).toBe("No change");
  });

  it("draws a long history as the compact chart, the queue switch and the chart one part under the rank", () => {
    const lps = [10, 34, 18, 41, 66, 49, 73, 95, 20, 44, 28, 52];
    const html = render(lps.map((lp, i) => snap(D(10, 2 + i * 2), "GOLD", i < 8 ? "II" : "I", lp, 100 + i, 90 + (i % 3))));
    expect(html).toContain('data-testid="ranked-chart"');
    const fold = html.slice(html.indexOf('id="ranked-chart-fold"'));
    expect(fold.indexOf('data-testid="ranked-controls"')).toBeLessThan(fold.indexOf('data-testid="ranked-chart"'));
    // The header holds the title and a phone's chevron only.
    const header = html.slice(0, html.indexOf('data-testid="ranked-current"'));
    expect(header).not.toContain("ranked-queue-solo");
  });

  it("with several accounts, one compact account select beside the queue switch, in the player's order", () => {
    const accounts: RankHistoryAccount[] = [
      { id: "a1", label: "main", riotId: "Name#TAG", snapshots: [snap(D(10, 15), "GOLD", "II", 46, 100, 90)] },
      { id: "a2", label: "", riotId: "Other#EUW", snapshots: [] },
    ];
    const html = renderToStaticMarkup(createElement(RankedProgress, { accounts, queue: "solo", accountId: null, href: () => "#", now: NOW }));
    const controls = html.slice(html.indexOf('data-testid="ranked-controls"'));
    expect(controls).toMatch(/aria-label="Queue"[\s\S]*data-testid="ranked-account-select"/);
    expect(html.match(/data-testid="ranked-account-select"/g)).toHaveLength(1);
    expect(html).not.toContain('data-testid="ranked-account"');
  });

  it("an unranked account says so with no rank bar, and Master and above show their LP alone, with no division bar", () => {
    const unranked = render([snap(D(10, 15), null, null, null, null, null), snap(D(11, 1), null, null, null, null, null)]);
    expect(text(unranked, "ranked-no-chart")).toBe("Unranked at every check so far.");
    expect(unranked).not.toContain('data-testid="ranked-lp-bar"');
    const master = render([snap(D(10, 15), "MASTER", null, 120, 200, 150), snap(D(10, 20), "MASTER", null, 180, 205, 151), snap(D(11, 1), "MASTER", null, 251, 212, 154)]);
    expect(text(master, "ranked-current")).toBe("Master · 251 LP");
    expect(master).not.toContain('data-testid="ranked-lp-bar"');
    expect(master).toContain('data-testid="ranked-chart"');
    // The record and win rate always shown; its scope ("2026 (Riot)") from a 21rem card, read out on a phone's.
    expect(text(master, "ranked-record")).toBe("212W 154L · 58%");
    expect(master).toMatch(/data-testid="ranked-record">212W 154L · 58%[\s\S]*?<span class="@max-\[21rem\]\/rank:sr-only"> · 2026 \(Riot\)<\/span>/);
  });

  it("ends with the chart: no History and coverage disclosure, no year strip, rank changes or readings table", () => {
    // The days the rank is known (5 of 301 here) are still worked out by rankedYearCoverage, and
    // tested there (domain/rank-timeline.test.ts); the card no longer shows them.
    const html = render([snap(D(10, 15), "GOLD", "II", 46, 100, 90, D(10, 15, 20)), snap(D(10, 16), "GOLD", "II", 70, 101, 90), snap(D(10, 18), "GOLD", "I", 12, 104, 91, D(10, 18, 18)), snap(D(10, 20), "GOLD", "II", 75, 104, 92)]);
    for (const gone of ["<details", "<summary", "History and coverage", "ranked-details", "ranked-coverage", "ranked-events", "ranked-key", "ranked-table", "Every reading", "Rank changes recorded"]) expect(html, gone).not.toContain(gone);
    // What the card keeps: the season and the first reading, the current rank and LP, Riot's record,
    // the change and the highest recorded rank, and the chart, which ends the card.
    expect(text(html, "ranked-tracking")).toBe("Name#TAG · 2026 Season 3 · rank recorded since 15 Oct 2026");
    expect(text(html, "ranked-current")).toBe("Gold II · 75\u00a0LP");
    expect(html).toContain("104W 92L · 53%<span class=\"@max-[21rem]/rank:sr-only\"> · 2026 (Riot)</span>");
    expect(html).toContain('data-testid="ranked-peak-stat"');
    expect(html).toMatch(/data-testid="ranked-chart"[\s\S]*<\/section>$/);
  });
});
