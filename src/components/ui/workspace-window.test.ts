import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceFlowFold, WorkspaceOpenFold, WorkspaceWindow } from "./workspace-window";

/*
  What a fold opens in the flow, in the one-screen workspace (ui/workspace-window.tsx; docs/RESPONSIVE.md,
  "One-screen desktop pages"), as the server draws it (node, no browser: the posture not known yet, so
  the CSS gate decides the first paint): the flow's own markup, hidden in the workspace, and the
  workspace's row, hidden outside it; no window until the workspace is known; the folds closed.
*/

describe("WorkspaceWindow as the server draws it", () => {
  const out = renderToStaticMarkup(h(WorkspaceWindow, { testId: "speed", label: "Technical details", description: "By device and by page.", title: "Page speed", flow: h("details", { "data-testid": "flow-fold" }, h("summary", null, "Technical details"), h("table", null)) }, h("p", null, "notes")));

  it("draws the flow's own markup, after the row, hidden by the CSS gate in the workspace", () => {
    expect(out).toContain('<div class="ws:hidden"><details data-testid="flow-fold">');
    expect(out.indexOf('data-testid="speed-open"')).toBeLessThan(out.indexOf('data-testid="flow-fold"'));
  });

  it("draws the workspace's row hidden outside it, a button that says it opens a window", () => {
    expect(out).toMatch(/<button type="button" class="[^"]*hidden ws:flex[^"]*" aria-haspopup="dialog" data-testid="speed-open">/);
    expect(out).toContain("Technical details");
    expect(out).toContain("By device and by page.");
  });

  it("draws no window, and none of the window's content, until the workspace is known", () => {
    expect(out).not.toContain("<dialog");
    expect(out).not.toContain("notes");
  });
});

describe("the workspace's folds as the server draws them", () => {
  it("a section's fold is closed until the workspace is known (a fold's state is the browser's)", () => {
    const out = renderToStaticMarkup(h(WorkspaceOpenFold, { title: "Riot Games compliance", testId: "compliance", id: "compliance", children: h("p", null, "notice") }));
    expect(out).toMatch(/^<details class="[^"]*" id="compliance" data-testid="compliance" data-fold="panel">/);
    expect(out).not.toContain(" open");
  });

  it("a fold round several sections hides its title row in the workspace's first paint, and its box", () => {
    const out = renderToStaticMarkup(h(WorkspaceFlowFold, { title: "Technical details", testId: "details", children: h("p", null, "panels") }));
    expect(out).toMatch(/<details class="[^"]*ws:border-0 ws:bg-transparent"/);
    expect(out).toMatch(/<summary class="[^"]*ws:hidden"/);
    expect(out).toContain("<p>panels</p>");
  });
});
