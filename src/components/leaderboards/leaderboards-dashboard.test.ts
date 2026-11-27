import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import { teamDataStatus } from "@/domain/data-status";
import type { BoardPlayer, LeaderboardsView, MultikillBreakdown, MultikillRole } from "@/server/leaderboards/recent-view";
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
  Leaderboards as one page (since 19 Nov 2026: no views, no tabs; since 25 Nov 2026 one dashboard, no
  folds): the header (the active players, the rule behind its ⓘ, the season), the index of the
  sections on a long page, then Recent form, the multikills, the season records and the milestones,
  in that order on one 2 × 2 grid placed by the page's own width. The boards' own markup is in
  recent-leaderboards.test.ts and records.test.ts; the browser tests check the layout at each width
  (e2e/leaderboards-recent.spec.ts).
*/

const NAMES: Record<string, string> = { ash: "Ash", bo: "Bo" };
const player = (id: string): BoardPlayer => ({ id, name: NAMES[id]!, profileHref: `/players/${id}`, avatarUrl: null, look: cardLookFor({ id }) });
const role: MultikillRole = { kind: "role", roles: ["MID"], label: "Most played: Mid, 90% of 41 games", rows: [{ role: "MID", label: "Mid", share: "90%", games: "37 games", text: "Mid — 90% (37 games)" }, { role: "TOP", label: "Top", share: "10%", games: "4 games", text: "Top — 10% (4 games)" }] };
const breakdown: MultikillBreakdown = {
  score: "112",
  place: "1st of 1",
  games: "41 games with multikill counts",
  coverage: null,
  role,
  champions: [{ championId: "Zed", role: "MID", games: "30 games" }],
  kinds: [
    { key: "double", label: "Double kills", made: "9", weight: "2", points: "18" },
    { key: "triple", label: "Triple kills", made: "2", weight: "3", points: "6" },
    { key: "quadra", label: "Quadra kills", made: "1", weight: "4", points: "4" },
    { key: "penta", label: "Pentakills", made: "0", weight: "5", points: "0" },
  ],
  calculation: { earned: "28", expected: "19.3", cushion: "40", score: "115" },
  comparison: [{ basis: "champion-role", label: "By champion and role", games: "41 games" }],
  notAdjusted: false,
  chance: "±13",
};

function view(o: Partial<LeaderboardsView> = {}): LeaderboardsView {
  return {
    form: {
      rows: [{ playerId: "ash", place: 1, tied: false, status: "established", games: 20, wins: 13, losses: 7, winRate: 65, dates: "7 Oct – 6 Nov", role: { role: "TOP", games: 15 }, note: null, gap: null, you: false }],
      window: { games: 20, days: 60 },
    },
    records: {
      season: 16,
      seasonLabel: "Season 2026",
      seasons: [{ value: 16, label: "Season 2026", href: "/leaderboards" }],
      games: 41,
      records: [{ id: "kills", label: "Most kills in a game", short: "Most kills", definition: "", qualifier: null, holder: { playerId: "ash", value: "18", unit: "kills", championId: "Zed", role: "MID", kda: "18/2/7", when: "2 Sep 2026", href: "/leaderboards?match=OC1_001", game: { matchId: "OC1_001", historyHref: "/players/ash/matches?match=OC1_001" } }, yours: null }],
      multikills: {
        rows: [{ playerId: "ash", place: 1, tied: false, status: "ranked", score: "112", counts: { double: 9, triple: 2, quadra: 1, penta: 0 }, riot: { double: 12, triple: 3, quadra: 1, penta: 0 }, gamesText: "41", gamesSpoken: "41 games with multikill counts", counted: 41, games: 41, role, breakdown, you: false }],
        basis: "Ranked by multikill performance relative to the champions and roles played.",
        explain: "Multikills earn 2–5 points. The score compares a player's points with typical results for their champions and roles, accounting for games played.",
        source: "same-games",
        sourceText: "Typical results come from 2,400 games of other players in the team's stored season matches, excluding team members — not every League player.",
        rule: "nested",
        ruleShown: true,
        ruleText: "Each multikill counts once, at its largest: a pentakill is not also counted as a double, triple and quadra.",
        rankedFrom: 20,
      },
      multikillNote: null,
      multikillShort: null,
      milestones: { items: [{ playerId: "bo", kind: "mastery", championId: "Thresh", short: "512K", unit: "mastery", value: "512K mastery points", milestone: "500K+", tier: 2 }], more: 0 },
    },
    players: { ash: player("ash"), bo: player("bo") },
    playerCount: 2,
    memberCount: 3,
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

  it("reads in one order: its title and who is on it, then Recent form, the multikills, the season records, the milestones", () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="[^"]*">Leaderboards<\/h1>/);
    // A long word that may break only where it cannot fit (200% text on a 320px phone).
    expect(html).toMatch(/<h1 class="[^"]*\[overflow-wrap:anywhere\][^"]*">/);
    const at = (s: string) => html.indexOf(s);
    const order = ['data-testid="scope-label"', '<section id="recent-form"', '<section id="multikills"', '<section id="season-records"', '<section id="milestones"'].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Every board's title is a section heading, the page's only h2s.
    expect([...html.matchAll(/<h2 id="([\w-]+)"/g)].map((m) => m[1])).toEqual(["form-board-title", "multikills-title", "season-records-title", "milestones-title"]);
    // One lead card: Recent form's board.
    expect(html.match(/surface-lead/g)).toHaveLength(1);
    expect(html).toMatch(/class="[^"]*surface-lead[^"]*" data-testid="form-board"/);
  });

  it("counts the active players, with the rule behind one ⓘ, then the season and the data status, on one line", () => {
    expect(html).toMatch(/data-testid="scope-count" data-count="2">2 active players<\/span>/);
    expect(html).toContain('data-testid="scope-tip"');
    expect(html).toContain("Players with a game and a data update in the last 30 days.");
    expect(html).toMatch(/data-testid="records-season-label">Season 2026</);
    const scope = html.slice(html.indexOf('data-testid="scope-label"'));
    expect(scope.indexOf("scope-count")).toBeLessThan(scope.indexOf("records-season-label"));
    expect(scope.indexOf("records-season-label")).toBeLessThan(scope.indexOf("leaderboards-status"));
    // The season and the data status one unit: they take the next line together, the status never on a line of its own.
    const unit = scope.slice(scope.indexOf('data-testid="scope-season-status"'));
    expect(unit.indexOf("records-season-label")).toBeGreaterThan(0);
    expect(unit.indexOf("leaderboards-status")).toBeGreaterThan(unit.indexOf("records-season-label"));
    expect(scope.indexOf("scope-count")).toBeLessThan(scope.indexOf("scope-season-status"));
    expect(html).not.toContain('data-testid="last-updated"');
    // No paragraph of explanation on the page: the boards say what they count in their titles, the rest behind each ⓘ.
    expect(html).not.toContain("records-volume-note");
  });

  it("places the four boards on one 2 × 2 grid by the page's own width: one column, from 59rem the rankings side by side, then the achievements", () => {
    expect(html).toContain("@container/dash");
    const grid = /<div class="([^"]*)" style="--rank-row:2.5rem" data-testid="leaderboards-grid" data-rank-rows="\d+">/.exec(html)![1]!;
    // Recent form's column from 36.25rem (its board's medium tier inside its 1px border), the multikills' from 21.75rem (both fit from 59rem).
    expect(grid).toContain("@min-[59rem]/dash:grid-cols-[minmax(36.25rem,1.25fr)_minmax(21.75rem,1fr)]");
    // The rows stretch (the grid's default): the boards in a row share its height. Nothing spans, nothing is placed out of order.
    expect(grid).not.toContain("items-start");
    expect(grid).not.toMatch(/col-span|row-span|grid-rows/);
    expect(html).not.toContain("leaderboards-side");
    // Each board fills its cell (a flex column), so a row's two boards end together.
    for (const id of ["recent-form", "multikills", "season-records", "milestones"]) expect(html).toMatch(new RegExp(`<section id="${id}"[^>]*class="[^"]*flex[^"]*flex-col`));
    // No fold anywhere: no Show all, no closed overview.
    expect(html).not.toContain("data-fold");
    expect(html).not.toMatch(/Show all|show-all/);
    // No index at the header's end: every board is on the first screen from 59rem.
    expect(html).not.toContain("header-section-index");
  });

  it("indexes the sections below Recent form for a one-column page, each link to a section on the page", () => {
    const links = [...html.matchAll(/<a href="#([\w-]+)"[^>]*data-testid="section-index-link"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["multikills", "Multikills"],
      ["season-records", "Season records"],
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
  it("with nobody active: one line saying so (and when they return), no boards and no index", () => {
    const html = render(view({ playerCount: 0, players: {}, form: { rows: [], window: { games: 20, days: 60 } } }));
    expect(html).toContain('data-testid="leaderboards-empty"');
    expect(html).toContain("No player has a game and a data update in the last 30 days.");
    expect(html).not.toContain("<section");
    expect(html).not.toContain("section-index");
    expect(html).toMatch(/data-testid="scope-count" data-count="0">0 active players</);
  });

  it("with no member at all: says nobody has joined yet", () => {
    const html = render(view({ playerCount: 0, memberCount: 0, players: {}, form: { rows: [], window: { games: 20, days: 60 } } }));
    expect(html).toContain("No team members to compare yet.");
  });

  it("offers the season's choice in the header where two seasons are offered", () => {
    const v = view();
    const html = render({ ...v, records: { ...v.records, seasons: [...v.records.seasons, { value: 15, label: "Season 2025", href: "/leaderboards?season=15" }] } });
    expect(html).toContain('data-testid="records-season"');
    expect(html).not.toContain('data-testid="records-season-label"');
    expect(html.indexOf('data-testid="records-season"')).toBeLessThan(html.indexOf('<section id="recent-form"'));
  });

  it("on the public board, when the boards were last read, and no status", () => {
    const html = render(view(), false);
    expect(html).not.toContain("leaderboards-status");
    expect(html).toMatch(/data-testid="last-updated">Updated from the last account sync: /);
  });
});
