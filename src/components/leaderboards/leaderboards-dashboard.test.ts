import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import { teamDataStatus } from "@/domain/data-status";
import type { BoardPlayer, LeaderboardsView } from "@/server/leaderboards/recent-view";
import { LeaderboardsDashboard } from "./leaderboards-dashboard";

// The season's choice (a client component) asks for the router, which a markup test has none of.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

/*
  Leaderboards as one page (#72: no views, no tabs): the header, the index of the sections on a long
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
      records: [{ id: "kills", label: "Most kills in a game", definition: "", qualifier: null, holder: { playerId: "ash", value: "18", unit: "kills", championId: "Zed", role: "MID", kda: "18/2/7", when: "2 Sep 2026", href: "/players/ash/matches?match=OC1_001" }, yours: null }],
      multikills: [{ playerId: "ash", penta: 0, quadra: 1, triple: 2 }],
      multikillNote: null,
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
    expect(html).not.toContain("page-toolbar");
  });

  it("reads in one order: its title and who is on it, then Recent form, the season records, the multikills, the milestones", () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="[^"]*">Leaderboards<\/h1>/);
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

  it("places the four boards on one grid by the page's own width: across the page, then beside each other", () => {
    expect(html).toContain("@container/dash");
    const grid = /<div class="([^"]*)" data-testid="leaderboards-grid">/.exec(html)![1]!;
    expect(grid).toContain("@min-[59rem]/dash:grid-cols-[minmax(36rem,1fr)_minmax(21rem,24rem)]");
    expect(grid).toContain("@min-[86rem]/dash:grid-cols-[minmax(22rem,24rem)_minmax(34.5rem,1fr)_minmax(26.5rem,38.5rem)]");
    // From 86rem the season records stand beside Recent form, in its first row.
    expect(html).toMatch(/<section id="season-records" aria-labelledby="season-records-title" class="min-w-0 @min-\[86rem\]\/dash:col-start-3 @min-\[86rem\]\/dash:row-start-1" data-testid="records">/);
    expect(html).toMatch(/<section id="recent-form" aria-labelledby="form-board-title" class="[^"]*@min-\[59rem\]\/dash:col-span-2" data-testid="form">/);
    expect(html).toMatch(/<section id="milestones" aria-labelledby="milestones-title" class="min-w-0 @min-\[59rem\]\/dash:col-span-2">/);
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
