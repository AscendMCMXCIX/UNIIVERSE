import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WS_TIER_ROWS, wsTierClass as championsTier } from "@/components/players/all-champions";
import { WS_CARD_FILL, WS_CARD_SURFACE, WS_COLUMN, WS_FOOT, WorkspaceCard, WorkspaceFoot, WorkspaceSection, workspaceMarks, wsTierClass } from "./workspace";

/*
  The workspace's shared parts (ui/workspace.tsx; docs/RESPONSIVE.md, "One-screen desktop pages"):
  the marks a page reads from the gate, the section, card and footer as markup (node, no browser:
  the server's render, where the CSS gate decides and the section carries data-workspace), and the
  first paint's tiers, the same classes as All Champions' own.
*/

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("workspaceMarks", () => {
  it("marks the section while the gate may hold (the first paint, then a window that holds it) and pages only once known", () => {
    expect(workspaceMarks(null, null, null)).toMatchObject({ ws: null, workspace: true, paged: false, short: false, shortNarrow: false, attrs: { "data-workspace": "" } });
    expect(workspaceMarks(true, false, false)).toMatchObject({ workspace: true, paged: true, attrs: { "data-workspace": "" } });
    expect(workspaceMarks(false, false, false)).toMatchObject({ workspace: false, paged: false, attrs: {} });
  });

  it("adds the short form's marks only where the page asks for them and they apply", () => {
    // Asked for: marked where the page's own rem is short, in the workspace only.
    expect(workspaceMarks(true, true, true, { short: true, shortNarrow: true }).attrs).toEqual({ "data-workspace": "", "data-ws-short": "", "data-ws-short-narrow": "" });
    expect(workspaceMarks(null, null, null, { short: true, shortNarrow: true }).attrs).toEqual({ "data-workspace": "" });
    expect(workspaceMarks(false, true, true, { short: true, shortNarrow: true }).attrs).toEqual({});
    // Not asked for: never marked (a page that writes no ws-short: class is unaffected by the short form).
    expect(workspaceMarks(true, true, true).attrs).toEqual({ "data-workspace": "" });
    expect(workspaceMarks(true, true, true)).toMatchObject({ short: false, shortNarrow: false });
  });

  it("keeps a page in the flow where it is not enabled, whatever the window", () => {
    expect(workspaceMarks(true, true, true, { enabled: false, short: true })).toMatchObject({ ws: false, workspace: false, paged: false, short: false, attrs: {} });
    expect(workspaceMarks(null, null, null, { enabled: false })).toMatchObject({ workspace: false, attrs: {} });
  });
});

describe("WS_COLUMN", () => {
  it("is the profile column's own classes (every wrapper between the frame and a section takes them)", () => {
    expect(WS_COLUMN).toBe("ws-host:flex ws-host:w-full ws-host:flex-1 ws-host:flex-col");
    expect(read("src", "components", "players", "profile-sections.tsx")).toContain(WS_COLUMN);
  });
});

describe("WorkspaceSection", () => {
  it("is a container named ws (never All Champions' `section`), marked data-workspace on the server's render, its parts by a gap in the workspace", () => {
    const out = html(h(WorkspaceSection, { labelledBy: "t", testId: "s" }, h("h2", { id: "t" }, "Title")));
    expect(out).toMatch(/^<section class="@container\/ws space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0" aria-labelledby="t" data-testid="s" data-workspace="">/);
    expect(out).not.toContain("@container/section");
  });

  it("takes a page's own marks, its tag and its name", () => {
    const out = html(h(WorkspaceSection, { as: "div", label: "Settings", marks: workspaceMarks(false, null, null) }, "x"));
    expect(out).toBe('<div class="@container/ws space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0" aria-label="Settings">x</div>');
    expect(html(h(WorkspaceSection, { enabled: false }, "x"))).not.toContain("data-workspace");
  });
});

describe("WorkspaceCard and WorkspaceFoot", () => {
  it("a card fills the frame (data-ws-card), its surface unless bare, a paged list's region attributes passed through", () => {
    const out = html(h(WorkspaceCard, { testId: "c", "data-ws-region": "list", "data-per": 7 } as never, "rows"));
    expect(out).toBe(`<div class="relative min-w-0 ${WS_CARD_SURFACE} ${WS_CARD_FILL}" data-ws-card="" data-testid="c" data-ws-region="list" data-per="7">rows</div>`);
    expect(html(h(WorkspaceCard, { bare: true, as: "aside" }))).toBe(`<aside class="relative min-w-0 ${WS_CARD_FILL}" data-ws-card=""></aside>`);
  });

  it("a footer is drawn in the workspace only, at the card's foot (data-ws-foot)", () => {
    expect(WS_FOOT).toBe("mt-auto hidden min-h-11 items-center gap-3 border-t border-border/70 px-3 ws:flex");
    expect(html(h(WorkspaceFoot, { testId: "f", className: "@min-[76rem]:px-4" }, "pager"))).toBe(`<div class="${WS_FOOT} @min-[76rem]:px-4" data-ws-foot="" data-testid="f">pager</div>`);
  });
});

describe("wsTierClass", () => {
  it("draws the first paint's rows by the window's height tiers, the same classes as All Champions' own for its tiers", () => {
    for (let i = 0; i < 14; i++) expect(wsTierClass(i, WS_TIER_ROWS), `row ${i}`).toBe(championsTier(i));
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => wsTierClass(i, { gate: 2, mid: 4, tall: 6 }))).toEqual([undefined, undefined, "ws:board-below-mid:hidden", "ws:board-below-mid:hidden", "ws:board-below-tall:hidden", "ws:board-below-tall:hidden", "ws:hidden"]);
  });
});
