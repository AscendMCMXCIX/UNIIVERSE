import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bookmark } from "lucide-react";
import type { LeaderboardGame } from "@/domain/leaderboards";
import { rankRecentBoard, recentEntry } from "@/domain/leaderboard-recent";
import { DataGroup, DataList, DataRow, FigureCell, MemberCell, Place, ROW_STATES, RowLink, densityClasses, tieRuns } from "./data-list";
import { EmptyState } from "./empty-state";

/*
  The DataList pieces as markup (node, no browser): the tie runs and the place's words, the row's
  reading order and states, figures' and members' words for screen readers, and EmptyState's
  variants (the default block unchanged for its existing callers).
*/

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("tieRuns", () => {
  it("marks each run of shared places start, mid…, end, and nothing else", () => {
    expect(tieRuns([1, 2, 2, 4, 4, 4, 7])).toEqual([null, "start", "end", "start", "mid", "end", null]);
    expect(tieRuns([1, 1])).toEqual(["start", "end"]);
    expect(tieRuns([null, null])).toEqual([null, null]);
    expect(tieRuns([2, 3, 2])).toEqual([null, null, null]);
    expect(tieRuns([])).toEqual([]);
  });

  it("agrees with the ranking's own ties: a run exactly where rankRecentBoard says a place is shared", () => {
    const NOW = new Date(Date.UTC(2026, 10, 2, 12));
    let seq = 0;
    const game = (playerId: string, i: number, win: boolean): LeaderboardGame => ({ matchId: `M_${++seq}`, playerId, championId: "Ahri", role: "MID", queueId: 420, patch: "16.21", win, gameCreation: NOW.getTime() - i * 86_400_000 - seq, durationS: 1800, kills: 5, deaths: 5, assists: 5, cs: 210, damage: 21_000, vision: 30, gold: 12_000, wardsPlaced: 10, teamKills: 20, teamDamage: 84_000, extra: null });
    const windowOf = (id: string, games: number, wins: number) => recentEntry(id, Array.from({ length: games }, (_, i) => game(id, i, i < wins)), { board: "overall", mode: "all", now: NOW });
    const entries = [windowOf("a", 20, 14), windowOf("b", 20, 14), windowOf("c", 20, 13), windowOf("d", 20, 10), windowOf("e", 20, 10), windowOf("f", 20, 10), windowOf("g", 20, 6), windowOf("h", 12, 9)];
    const rows = rankRecentBoard(entries, "overall", "winRate").rows;
    const runs = tieRuns(rows.map((r) => r.rank));
    expect(runs).toEqual(["start", "end", null, "start", "mid", "end", null, null]);
    expect(rows.map((r) => r.tied)).toEqual(runs.map((t) => t !== null));
  });
});

describe("Place", () => {
  it("writes a shared place 4=, said and titled Tied for 4th, with its bracket on the first column", () => {
    const out = html(h("ol", null, h("li", null, h(Place, { place: 4, tie: "mid", testId: "place" }))));
    expect(out).toContain('<span aria-hidden="true">4=</span><span class="sr-only">Tied for 4th</span>');
    expect(out).toMatch(/data-testid="place" data-tie="mid" title="Tied for 4th"/);
    expect(out).toMatch(/<span aria-hidden="true" class="pointer-events-none absolute col-\[1\/2\] -right-1 w-1\.5 [^"]*border-r-2/);
  });

  it("writes an untied place as its number, no bracket and no title; a row without a place as – (Provisional)", () => {
    const plain = html(h(Place, { place: 7 }));
    expect(plain).not.toMatch(/title=|data-tie|absolute/);
    expect(plain).toMatch(/>7<\/span>$/);
    const none = html(h(Place, { place: null, tie: "start" }));
    expect(none).toContain('title="Provisional"');
    expect(none).toContain('<span aria-hidden="true">–</span><span class="sr-only">Provisional</span>');
    expect(none).not.toContain("absolute");
  });

  it("crowns first place, also when it is shared, and stacks a shared 1='s crown on a narrow board", () => {
    expect(html(h(Place, { place: 1, crown: true }))).toMatch(/role="img" aria-label="First place"|aria-label="First place" role="img"/);
    const shared = html(h(Place, { place: 1, tie: "start", crown: true }));
    expect(shared).toContain("First place");
    expect(shared).toContain("@max-[36rem]/list:flex-col");
    expect(shared).toContain("Tied for 1st");
  });
});

describe("DataRow", () => {
  const row = (props: Parameters<typeof DataRow>[0]) => html(h("ol", null, h(DataRow, props)));

  it("takes its states only when it is a link, and keeps the reading order: lead, link, the member, figures", () => {
    const linked = row({ lead: h("span", null, "LEAD"), link: h(RowLink, { href: "/players/p1", children: "Ash" }), children: h("span", null, "MEMBER"), figures: h("span", null, "FIGURES"), testId: "r" });
    expect(linked).toContain(ROW_STATES);
    const at = (s: string) => linked.indexOf(s);
    expect(at("LEAD")).toBeLessThan(at('data-row-link=""'));
    expect(at('data-row-link=""')).toBeLessThan(at("MEMBER"));
    expect(at("MEMBER")).toBeLessThan(at("FIGURES"));
    expect(linked).toContain('<a class="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-row-link="" href="/players/p1"><span class="sr-only">Ash</span></a>');
    const plain = row({ children: h("span", null, "MEMBER") });
    expect(plain).not.toContain("hover:");
    expect(plain).not.toContain("<a ");
  });

  it("marks your own row with the accent wash and its bar, and passes the row's data, never a title", () => {
    const own = row({ own: true, children: "x", "data-place": 4, "data-you": true });
    expect(own).toContain("bg-accent/5");
    expect(own).toContain('<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent"></span>');
    expect(own).toMatch(/data-place="4" data-you="true"/);
    // A title on the li would become the list item's accessible name.
    expect(own).not.toMatch(/<li[^>]* title=/);
    expect(row({ children: "x" })).not.toContain("bg-accent");
  });

  it("shows the row's hint from an aria-hidden layer inside its link: not the link's name or description, not the li's name", () => {
    const hinted = row({ link: h(RowLink, { href: "/players/p1", hint: "Tied for 4th. 1 win behind Ash", children: "Ash" }), children: "x" });
    expect(hinted).toContain('<span class="sr-only">Ash</span><span aria-hidden="true" title="Tied for 4th. 1 win behind Ash" class="absolute inset-0 rounded-[inherit]"></span></a>');
    expect(hinted).not.toMatch(/<a [^>]*title=/);
    expect(hinted).not.toMatch(/<li[^>]* title=/);
  });

  it("sets its height per tier of the board's width, as literal classes Tailwind can see", () => {
    const classes = densityClasses({ narrow: "two-line", medium: "regular", wide: "dense" });
    expect(classes).toBe("min-h-16 py-2 @min-[36rem]/list:min-h-13 @min-[36rem]/list:py-1.5 @min-[58rem]/list:min-h-11 @min-[58rem]/list:py-1");
    expect(densityClasses("dense")).toBe("min-h-11 py-1");
    expect(row({ children: "x", density: { narrow: "two-line", medium: "regular", wide: "dense" } })).toContain(classes);
  });
});

describe("the board", () => {
  it("draws the headings and every group on the board's columns, a caption as a paragraph of phrasing content", () => {
    const rows = h(DataGroup, { label: "Ranking", caption: "Provisional", captionTestId: "cap", testId: "rows", children: h("li", null, "row") });
    const out = html(h(DataList, { columns: "[--dl-cols:2rem_1fr]", heads: "#", headsTestId: "heads", surface: "lead", testId: "board", children: rows }));
    expect(out).toMatch(/^<div class="@container\/list min-w-0 overflow-clip rounded-card border border-border bg-surface surface-lead" data-testid="board"><div class="divide-y divide-border\/70 \[--dl-cols:2rem_1fr\]">/);
    expect(out).toContain('<div aria-hidden="true" data-testid="heads" class="grid grid-cols-(--dl-cols) items-end py-2 label-caps');
    expect(out).toContain('<p class="bg-surface-2/40 py-2 text-xs text-fg-muted px-3 @min-[58rem]/list:px-4" data-testid="cap">Provisional</p><ol aria-label="Ranking" data-testid="rows" class="divide-y divide-border/60"><li>row</li></ol>');
  });
});

describe("FigureCell and MemberCell", () => {
  it("a figure is tabular and says its own words: 13W 7L is read 13 wins, 7 losses", () => {
    const out = html(h(FigureCell, { spoken: "13 wins, 7 losses", testId: "rec", children: "13W 7L" }));
    expect(out).toContain('data-figure=""');
    expect(out).toContain('<span aria-hidden="true">13W 7L</span><span class="sr-only">13 wins, 7 losses</span>');
    expect(html(h(FigureCell, { label: " win rate", children: "65%" }))).toContain('65%<span class="sr-only"> win rate</span>');
    // A figure in a row's second line takes that line's size.
    expect(html(h(FigureCell, { size: null, children: "1" }))).not.toMatch(/text-(sm|base|lg)/);
  });

  it("a member's name is read once: hidden under a row link that already says it, one card-name either way", () => {
    const linked = html(h(MemberCell, { look: null, name: "Ash", avatar: false, readName: false, you: true }));
    expect(linked).toContain('<span class="min-w-0 text-fg" aria-hidden="true">');
    expect(linked.match(/data-testid="card-name"/g)).toHaveLength(1);
    expect(linked).toContain('data-testid="card-you"');
    const read = html(h(MemberCell, { look: null, name: "Ash" }));
    expect(read).not.toContain('aria-hidden="true"><span class="flex min-w-0 items-start');
    expect(read.match(/data-testid="card-name"/g)).toHaveLength(1);
    expect(read).not.toContain("card-you");
  });
});

describe("EmptyState", () => {
  it("inline is one paragraph of phrasing content", () => {
    const out = html(h(EmptyState, { variant: "inline", icon: Bookmark, title: "No bookmarks yet.", testId: "e" }, "Bookmark a game to keep it here."));
    expect(out).toMatch(/^<p class="text-sm text-fg-muted" data-testid="e"><svg [^>]*class="lucide lucide-bookmark mr-1\.5 inline-block/);
    expect(out).toContain('<span class="font-medium text-fg">No bookmarks yet.</span> Bookmark a game to keep it here.</p>');
    expect(out).not.toMatch(/<(div|p|ul|ol)[ >][\s\S]*<(div|p|ul|ol)[ >]/);
  });

  it("row sits in a board in place of a group, its words one paragraph with nothing nested in it", () => {
    const out = html(h(EmptyState, { variant: "row", title: "Nobody has 10 games in the last 60 days yet.", testId: "e" }, "Members appear here from their 10th recent game."));
    expect(out).toContain('<div class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-fg-muted px-3 @min-[58rem]/list:px-4" data-testid="e">');
    expect(out).toContain('<p class="min-w-0 flex-1"><span class="font-medium text-fg">Nobody has 10 games in the last 60 days yet.</span> Members appear here from their 10th recent game.</p>');
    expect(out).not.toMatch(/<p[ >](?:(?!<\/p>)[\s\S])*<(p|div|ul|ol)[ >]/);
  });

  it("block and compact render exactly as before for their existing callers", () => {
    expect(html(h(EmptyState, { title: "Nothing yet", testId: "e", className: "mt-2" }, "It fills in after the next sync."))).toBe(
      '<div class="flex flex-col items-center gap-2 rounded-panel border border-dashed border-border bg-surface/40 text-center px-6 py-10 mt-2" data-testid="e"><p class="text-sm font-medium text-fg">Nothing yet</p><div class="max-w-md text-sm text-fg-muted">It fills in after the next sync.</div></div>',
    );
    expect(html(h(EmptyState, { title: "No bookmarks", compact: true, icon: Bookmark, action: h("a", { href: "/x" }, "Go") }, "Bookmark a game."))).toBe(
      '<div class="flex flex-col items-center gap-2 rounded-panel border border-dashed border-border bg-surface/40 text-center px-4 py-5"><span class="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-fg-subtle"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark h-5 w-5" aria-hidden="true"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"></path></svg></span><p class="text-sm font-medium text-fg">No bookmarks</p><div class="max-w-md text-sm text-fg-muted">Bookmark a game.</div><div class="mt-1"><a href="/x">Go</a></div></div>',
    );
  });
});
