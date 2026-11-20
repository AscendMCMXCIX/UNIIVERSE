import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import { teamDataStatus } from "@/domain/data-status";
import type { BoardPlayer, LeaderboardsView } from "@/server/leaderboards/recent-view";
import { PageToolbar } from "@/components/ui/page-toolbar";
import { LeaderboardsDashboard } from "./leaderboards-dashboard";

// The season's choice (a client component) asks for the router, which a markup test has none of.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }), usePathname: () => "/leaderboards", useSearchParams: () => new URLSearchParams() }));
// The pinned row's copy of a page's controls (PageToolbar) draws nothing on the server, where there is
// no row to draw into, so markup alone could not show that the page puts nothing there: here it draws
// a mark of its own wherever a page renders one.
vi.mock(import("@/components/ui/page-toolbar"), async (original) => {
  const { createElement: h } = await import("react");
  const toolbar = await original();
  const mark = ({ label }: { label?: string }) => h("div", { "data-pinned-copy": label ?? "" });
  return { ...toolbar, PageToolbar: mark as unknown as typeof toolbar.PageToolbar };
});

/*
  Leaderboards as one page (since 19 Nov 2026: no views, no tabs): the header, the index of the sections on a long
  page, then Recent form, the season records, the multikills and the milestones, in that order and
  in one grid placed by the page's own width. The boards' own markup is in
  recent-leaderboards.test.ts and records.test.ts; the browser tests check the layout at each width
  (e2e/leaderboards-recent.spec.ts).
*/

const NAMES: Record<string, string> = { ash: "Ash", bo: "Bo" };
const player = (id: string): BoardPlayer => ({ id, name: NAMES[id]!, profileHref: `/players/${id}`, avatarUrl: null, look: cardLookFor({ id }) });

function view(o: Partial<LeaderboardsView> = {}): LeaderboardsView {
  return {
    form: {
      rows: [{ playerId: "ash", place: 1, tied: false, status: "established", games: 20, wins: 13, losses: 7, winRate: 65, dates: "7 Oct – 6 Nov", role: { role: "TOP", games: 15 }, note: null, gap: null, you: false }],
      notEnough: [{ playerId: "bo", games: 4, needed: 6, lastGame: "1 Nov 2026" }],
      window: { games: 20, provisionalFrom: 10, days: 60 },
    },
    records: {
      season: 16,
      seasonLabel: "Season 2026",
      seasons: [{ value: 16, label: "Season 2026", href: "/leaderboards" }],
      games: 41,
      records: [{ id: "kills", label: "Most kills in a game", definition: "", qualifier: null, holder: { playerId: "ash", value: "18", unit: "kills", championId: "Zed", role: "MID", kda: "18/2/7", when: "2 Sep 2026", href: "/leaderboards?match=OC1_001", game: { matchId: "OC1_001", historyHref: "/players/ash/matches?match=OC1_001" } }, yours: null }],
      multikills: [{ playerId: "ash", penta: 0, quadra: 1, triple: 2 }],
      multikillNote: null,
      multikillShort: null,
      championGames: [],
      mastery: [{ playerId: "bo", items: [{ championId: "Thresh", value: "512K points", short: "512K", milestone: "500K+", tier: 2 }], more: 0 }],
    },
    players: { ash: player("ash"), bo: player("bo") },
    playerCount: 2,
    viewer: null,
    lastUpdated: "2026-11-18T20:00:00.000Z",
    ...o,
  };
}
const champions = { Zed: { id: "Zed", name: "Zed", portraitUrl: "" }, Thresh: { id: "Thresh", name: "Thresh", portraitUrl: "" } };
const status = teamDataStatus({ accounts: [], checkedAt: null, attemptedAt: null, newestGameAt: null });
const render = (v: LeaderboardsView = view(), withStatus = true) => renderToStaticMarkup(createElement(LeaderboardsDashboard, { view: v, champions, status: withStatus ? status : undefined }));

describe("Leaderboards, one page", () => {
  const html = render();

  it("has no views to switch between: no tabs, no link to Records & achievements, nothing in the pinned row", () => {
    expect(html).not.toContain("Leaderboards views");
    expect(html).not.toContain("leaderboards-tab-");
    expect(html).not.toContain("view=records");
    expect(html).not.toContain("Records &amp; achievements");
    // No copy for the pinned row anywhere on the page (the mark shows where one is rendered, as for any page that has one).
    const mark = PageToolbar as unknown as (props: { label: string }) => ReturnType<typeof createElement>;
    expect(renderToStaticMarkup(createElement(mark, { label: "Some page's controls" }))).toContain('data-pinned-copy="Some page&#x27;s controls"');
    expect(html).not.toContain("data-pinned-copy");
  });

  it("reads in one order: its title and who is on it, then Recent form, the season records, the multikills, the milestones", () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="[^"]*">Leaderboards<\/h1>/);
    // A long word that may break only where it cannot fit (200% text on a 320px phone).
    expect(html).toMatch(/<h1 class="[^"]*\[overflow-wrap:anywhere\][^"]*">/);
    const at = (s: string) => html.indexOf(s);
    const order = ['data-testid="scope-label"', '<section id="recent-form"', '<section id="season-records"', '<section id="multikills"', '<section id="milestones"'].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Every board's title is a section heading, the page's only h2s.
    expect([...html.matchAll(/<h2 id="([\w-]+)"/g)].map((m) => m[1])).toEqual(["form-board-title", "season-records-title", "multikills-title", "milestones-title"]);
    // One lead card: Recent form's board.
    expect(html.match(/surface-lead/g)).toHaveLength(1);
    expect(html).toMatch(/class="[^"]*surface-lead[^"]*" data-testid="form-board"/);
  });

  it("says who is on the boards and how current they are on one line under no other text: the count, then the data status", () => {
    expect(html).toMatch(/<p class="[^"]*" data-testid="scope-label"><span class="inline-flex[^"]*"><span data-testid="scope-count">2 members<\/span>/);
    expect(html.slice(html.indexOf('data-testid="scope-label"'))).toMatch(/^[^]*?data-testid="leaderboards-status/);
    expect(html).not.toContain('data-testid="last-updated"');
    // No paragraph of explanation on the page: the boards say what they count in their titles, the rest behind each ⓘ.
    expect(html).not.toContain("form-footnote\"><");
    expect(html).not.toContain("records-volume-note");
  });

  it("places the four boards on one grid by the page's own width: across the page, then in two columns, each board under the one before it in its own", () => {
    expect(html).toContain("@container/dash");
    const grid = /<div class="([^"]*)" data-testid="leaderboards-grid">/.exec(html)![1]!;
    expect(grid).toContain("@min-[59rem]/dash:grid-cols-[minmax(36rem,1fr)_minmax(21rem,24rem)]");
    // From 86rem: Recent form's column at least 58rem of board inside its 1px border (its one-line rows) with room to spare, the
    // records' column from 26.25rem, so the two and the gap come to 86rem exactly; the second row takes what the records' column has beyond Recent form.
    expect(grid).toContain("@min-[86rem]/dash:grid-cols-[minmax(58.25rem,1fr)_minmax(26.25rem,38.5rem)]");
    expect(grid).toContain("@min-[86rem]/dash:grid-rows-[auto_1fr]");
    // Recent form across the page from 59rem; from 86rem the first column's first row, the milestones under it.
    expect(html).toMatch(/<section id="recent-form" aria-labelledby="form-board-title" class="[^"]*@min-\[59rem\]\/dash:col-span-2 @min-\[86rem\]\/dash:col-\[1\/2\] @min-\[86rem\]\/dash:row-\[1\/2\]" data-testid="form">/);
    // From 59rem to 86rem the records in the first column across the rows after Recent form's, the multikills then the
    // milestones in the second (the last row flexible, so the records' extra height never opens a gap between those two).
    expect(grid).toContain("@min-[59rem]/dash:grid-rows-[auto_auto_auto_1fr]");
    expect(html).toMatch(/<section id="season-records" aria-labelledby="season-records-title" class="min-w-0 @min-\[59rem\]\/dash:@max-\[86rem\]\/dash:col-\[1\/2\] @min-\[59rem\]\/dash:@max-\[86rem\]\/dash:row-\[2\/5\]"/);
    expect(html).toMatch(/<section id="multikills" aria-labelledby="multikills-title" class="min-w-0 @min-\[59rem\]\/dash:@max-\[86rem\]\/dash:col-\[2\/3\] @min-\[59rem\]\/dash:@max-\[86rem\]\/dash:row-\[2\/3\]"/);
    expect(html).toMatch(/<section id="milestones" aria-labelledby="milestones-title" class="min-w-0 @min-\[59rem\]\/dash:col-\[2\/3\] @min-\[59rem\]\/dash:row-\[3\/4\] @min-\[86rem\]\/dash:col-\[1\/2\] @min-\[86rem\]\/dash:row-\[2\/3\]">/);
    // The season records and the multikills: two of the grid's boards under 86rem (the wrapper draws no box), from 86rem
    // one column beside the other across both rows, the records first.
    const side = /<div class="([^"]*)" data-testid="leaderboards-side">([\s\S]*?)<section id="milestones"/.exec(html)!;
    expect(side[1]!.split(" ")).toEqual(["contents", "@min-[86rem]/dash:col-[2/3]", "@min-[86rem]/dash:row-[1/span_2]", "@min-[86rem]/dash:flex", "@min-[86rem]/dash:min-w-0", "@min-[86rem]/dash:flex-col", "@min-[86rem]/dash:gap-6"]);
    expect(side[2]!.indexOf('<section id="season-records"')).toBeGreaterThanOrEqual(0);
    expect(side[2]!.indexOf('<section id="season-records"')).toBeLessThan(side[2]!.indexOf('<section id="multikills"'));
    expect(html).toMatch(/<section id="season-records" aria-labelledby="season-records-title" class="min-w-0 [^"]*" data-testid="records">/);
  });

  it("indexes the sections below Recent form for a one-column page, each link to a section on the page", () => {
    const links = [...html.matchAll(/<a href="#([\w-]+)"[^>]*data-testid="section-index-link"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["season-records", "Season records"],
      ["multikills", "Multikills"],
      ["milestones", "Milestones"],
    ]);
    for (const [id] of links) expect(html).toContain(`<section id="${id}"`);
    expect(html).toMatch(/<nav aria-label="On this page" class="min-w-0 @min-\[59rem\]\/dash:hidden" data-testid="section-index">/);
    // Under 18rem (a phone from 125% text) the links wrap: no dots, which would start lines.
    expect(html).toContain("@max-[18rem]/dash:hidden");
    // Before Recent form, after the header.
    expect(html.indexOf('data-testid="section-index"')).toBeLessThan(html.indexOf('<section id="recent-form"'));
  });

  it("nests nothing a browser would rearrange: no block inside a paragraph, only li in a list, no link in a link", () => {
    expect(html).not.toMatch(/<p[ >](?:(?!<\/p>)[\s\S])*<(div|ul|ol|p|h\d|section)[ >]/);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /);
    for (const list of html.match(/<(ol|ul)[^>]*>(?:(?!<(?:ol|ul)[ >])[\s\S])*?<\/\1>/g) ?? []) expect(list.replace(/^<(ol|ul)[^>]*>|<\/(ol|ul)>$/g, "")).toMatch(/^(<li[\s\S]*?<\/li>)*$/);
  });
});

describe("Leaderboards' other states", () => {
  it("with nobody to compare: one line saying so, no boards and no index", () => {
    const html = render(view({ playerCount: 0, players: {}, form: { rows: [], notEnough: [], window: { games: 20, provisionalFrom: 10, days: 60 } } }));
    expect(html).toContain('data-testid="leaderboards-empty"');
    expect(html).not.toContain("<section");
    expect(html).not.toContain("section-index");
    expect(html).toContain('data-testid="scope-count">0 members<');
  });

  it("on the public board, when the boards were last read, and no status", () => {
    const html = render(view(), false);
    expect(html).not.toContain("leaderboards-status");
    expect(html).toMatch(/data-testid="last-updated">Updated from the last account sync: /);
  });
});
