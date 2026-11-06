import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rankTimeline } from "@/domain/rank-timeline";
import type { RankSnapshot } from "@/domain/rank-progress";
import { RankTimelineChart } from "./rank-timeline-chart";

const NOW = Date.UTC(2026, 10, 4, 12);
const snap = (at: number, lp: number, wins: number): RankSnapshot => ({ queue: "solo", tier: "GOLD", division: "II", leaguePoints: lp, wins, losses: 10, capturedAt: at, confirmedAt: null });
const render = (snapshots: RankSnapshot[]) => renderToStaticMarkup(createElement(RankTimelineChart, { t: rankTimeline(snapshots, NOW), label: "Ranked Solo/Duo rank" }));

describe("RankTimelineChart", () => {
  it("hatches the days before a first reading under three days old: nothing was read there", () => {
    const html = render([snap(NOW - 3_600_000, 40, 10)]);
    expect(html).toContain('data-testid="ranked-untracked"');
    expect(html).toContain('data-testid="ranked-line"');
  });

  it("draws no hatched stretch when the readings span more than the shortest chart", () => {
    const html = render([snap(Date.UTC(2026, 9, 15), 40, 10), snap(Date.UTC(2026, 9, 16), 60, 11)]);
    expect(html).not.toContain('data-testid="ranked-untracked"');
    expect(html).toContain("Rank recorded from 15 Oct 2026; Riot reports no earlier ranks.");
  });
});

describe("RankTimelineChart's time axis", () => {
  it("puts each day's tick on the installation's midnight, the day its label names", () => {
    const t = rankTimeline([snap(Date.UTC(2026, 9, 15), 40, 10), snap(Date.UTC(2026, 9, 16), 60, 11)], NOW);
    const html = renderToStaticMarkup(createElement(RankTimelineChart, { t, label: "Ranked Solo/Duo rank" }));
    // Drawn 480 wide before it measures: plot from x 64 to 472. 17 Oct begins at 16 Oct 13:00 UTC in Sydney.
    const x = 64 + ((Date.UTC(2026, 9, 16, 13) - t.from) / (t.to - t.from)) * 408;
    const tick = new RegExp(`<text x="([\\d.]+)"[^>]*>17 Oct</text>`).exec(html);
    expect(Number(tick?.[1])).toBeCloseTo(x, 3);
  });
});
