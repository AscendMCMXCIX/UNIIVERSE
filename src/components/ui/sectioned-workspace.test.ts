import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionPanels, SectionRail, SectionedWorkspace, addressTarget, initialSection, mergedMarker, sectionFromSearch, sectionHref, type WorkspaceSectionItem } from "./sectioned-workspace";
import { workspaceMarks } from "./workspace";

/*
  The sectioned workspace (ui/sectioned-workspace.tsx; docs/RESPONSIVE.md, "One-screen desktop
  pages", pattern b): the section in the address (?section=, the first section's address the page's
  own, an unknown value the first section), and the markup the server draws: every section mounted,
  the ones not current hidden in the workspace only, the rail and the actions drawn in the workspace
  only, the flow's index outside it.
*/

const ids = ["name", "links", "password", "device"];

describe("the section in the address", () => {
  it("is the one ?section= names, else the first (missing, empty or unknown)", () => {
    expect(sectionFromSearch("?section=password", ids)).toBe("password");
    expect(sectionFromSearch("?view=admin&section=links", ids)).toBe("links");
    expect(sectionFromSearch("", ids)).toBe("name");
    expect(sectionFromSearch("?section=", ids)).toBe("name");
    expect(sectionFromSearch("?section=billing", ids)).toBe("name");
    expect(sectionFromSearch("?tab=links", ids, "tab")).toBe("links");
    expect(sectionFromSearch("?section=links", [])).toBe("");
  });

  it("writes the section into the address, keeping the rest of it; the first section's address is the page's own", () => {
    expect(sectionHref("/settings", "password", ids)).toBe("/settings?section=password");
    expect(sectionHref("/settings?section=password", "name", ids)).toBe("/settings");
    expect(sectionHref("/admin/system?view=admin#top", "links", ids)).toBe("/admin/system?view=admin&section=links#top");
    expect(sectionHref("/admin/system?section=links&view=admin", "name", ids)).toBe("/admin/system?view=admin");
    expect(sectionHref("/settings?section=links", "billing", ids)).toBe("/settings");
  });

  it("shows the server's section first where it is one of them", () => {
    expect(initialSection("device", ids)).toBe("device");
    expect(initialSection("nope", ids)).toBe("name");
    expect(initialSection(null, ids)).toBe("name");
  });
});

describe("an address change (Back, Forward, a soft navigation)", () => {
  const at = { pathname: "/settings", rendered: "/settings", ids, current: "links" };

  it("shows the section the address names, the first where it names none (a soft navigation to the page's own address keeps it mounted)", () => {
    // /settings?section=links, then the account menu's Settings link (a Next <Link> to /settings): the first section, not links.
    expect(addressTarget({ ...at, search: "" })).toBe("name");
    expect(addressTarget({ ...at, search: "?section=password" })).toBe("password");
    expect(addressTarget({ ...at, search: "?view=admin&section=device" })).toBe("device");
    expect(addressTarget({ ...at, search: "?section=nope" })).toBe("name");
  });

  it("does nothing where it names the section shown", () => {
    expect(addressTarget({ ...at, search: "?section=links" })).toBeNull();
    expect(addressTarget({ ...at, current: "name", search: "" })).toBeNull();
  });

  it("maps an old deep link's hash to the section holding its element (/settings#password), the query's section first", () => {
    expect(addressTarget({ ...at, current: "name", search: "", hashSection: "password" })).toBe("password");
    expect(addressTarget({ ...at, current: "name", search: "?section=device", hashSection: "password" })).toBe("device");
    // A hash outside every section (the notice's #compliance) leaves the query's section.
    expect(addressTarget({ ...at, current: "links", search: "?section=links", hashSection: null })).toBeNull();
    expect(addressTarget({ ...at, current: "name", search: "", hashSection: "billing" })).toBeNull();
  });

  it("leaves a Back that leaves the page alone: another page's address is not a section's to decide (no beforeLeave asked, no ?section= pushed onto it)", () => {
    // /admin/branding?section=colours opened from /admin by a soft navigation, then Back: popstate fires while Branding is still mounted.
    expect(addressTarget({ pathname: "/admin", rendered: "/admin/branding", search: "", ids: ["name", "colours"], current: "colours" })).toBeNull();
    expect(addressTarget({ pathname: "/admin/settings", rendered: "/settings", search: "?section=password", ids, current: "name" })).toBeNull();
  });
});

describe("a section's marker", () => {
  it("is the page's own, with what its fields report: unsaved or in error where any of them is", () => {
    expect(mergedMarker(undefined, [])).toBeUndefined();
    expect(mergedMarker({ count: 3 }, [])).toEqual({ count: 3 });
    expect(mergedMarker(undefined, [{ unsaved: true, error: false }, { unsaved: false, error: false }])).toEqual({ unsaved: true, error: false });
    expect(mergedMarker({ count: 2 }, [{ unsaved: false, error: true }])).toEqual({ count: 2, unsaved: false, error: true });
  });
});

describe("SectionedWorkspace as the server draws it", () => {
  const sections: WorkspaceSectionItem[] = [
    { id: "name", title: "Name", content: h("p", null, "name panel") },
    { id: "links", title: "Links", content: h("p", null, "links panel"), marker: { unsaved: true } },
    { id: "password", title: "Password", content: h("p", null, "password panel"), marker: { error: true, count: 3 } },
  ];
  const draw = (props: Partial<Parameters<typeof SectionedWorkspace>[0]> = {}) => renderToStaticMarkup(h(SectionedWorkspace, { sections, label: "Settings sections", testId: "settings-ws", index: h("nav", null, "flow index"), actions: h("button", null, "Save"), ...props }));

  it("mounts every section, the current one shown in the workspace and the others hidden there only", () => {
    const out = draw({ initial: "links" });
    expect(out).toContain('data-workspace=""');
    expect(out).toContain('data-section="links"');
    expect(out).toContain('<div class="ws:flex-1 ws:flex-col ws:hidden" data-ws-section="name"><p>name panel</p></div>');
    expect(out).toContain('<div class="ws:flex-1 ws:flex-col ws:flex" data-ws-section="links" data-current="true"><p>links panel</p></div>');
    expect(out).toContain('<div class="ws:flex-1 ws:flex-col ws:hidden" data-ws-section="password"><p>password panel</p></div>');
  });

  it("draws the rail and the actions in the workspace only, the flow's index outside it", () => {
    const out = draw();
    expect(out).toMatch(/<div class="ws:hidden"><nav>flow index<\/nav><\/div><nav aria-label="Settings sections" class="hidden ws:flex [^"]*" data-testid="settings-ws-rail">/);
    expect(out).toContain('data-testid="settings-ws-actions"><button>Save</button></div>');
  });

  it("links each section by its address (the first the page's own), the current one marked, the markers read out", () => {
    const out = draw({ initial: "password" });
    expect(out).toContain('href="/" ');
    expect(out).toContain('href="/?section=links"');
    expect(out).toMatch(/<a href="\/\?section=password" aria-current="page" class="[^"]*font-semibold[^"]*" data-testid="settings-ws-link" data-target="password">/);
    expect(out).toContain('<span class="sr-only">, unsaved changes</span>');
    expect(out).toContain('<span class="sr-only">, has an error</span>');
    expect(out).toContain('data-testid="settings-ws-count">3</span>');
    expect(out.match(/aria-current/g)).toHaveLength(1);
  });

  it("lets a page lay out the rail and the sections itself (children): the rail inside its own card, server markup between them", () => {
    const out = renderToStaticMarkup(h(SectionedWorkspace, { sections, label: "Settings sections", testId: "settings-ws", initial: "links", className: "grid gap-3" }, h("section", { "aria-label": "Your account" }, h("p", null, "who you are"), h(SectionRail, { className: "ws:mt-2" })), h("div", null, h(SectionPanels, {}), h("p", { id: "compliance" }, "notice"))));
    expect(out).toMatch(/^<div class="@container\/ws grid gap-3" data-testid="settings-ws" data-section="links" data-workspace="">/);
    expect(out).toMatch(/<section aria-label="Your account"><p>who you are<\/p><nav aria-label="Settings sections" class="hidden ws:flex ws:flex-col ws:gap-4 ws:mt-2" data-testid="settings-ws-rail">/);
    expect(out).toContain('data-ws-section="links" data-current="true"><p>links panel</p></div>');
    expect(out).toContain('data-ws-section="password"><p>password panel</p></div></div><p id="compliance">notice</p>');
    expect(() => renderToStaticMarkup(h(SectionRail, {}))).toThrow(/inside a SectionedWorkspace/);
  });

  it("draws some sections where a page's flow puts others between them (SectionPanels' `only`), each section once", () => {
    const out = renderToStaticMarkup(h(SectionedWorkspace, { sections, label: "System Health sections", testId: "sys", initial: "password" }, h(SectionPanels, { only: ["password", "name"] }), h("details", null, h(SectionPanels, { only: ["links"] }))));
    expect(out.indexOf('data-ws-section="password"')).toBeLessThan(out.indexOf('data-ws-section="name"'));
    expect(out).toContain('<details><div class="min-w-0 ws:flex ws:min-w-0 ws:flex-1 ws:flex-col"><div class="ws:flex-1 ws:flex-col ws:hidden" data-ws-section="links">');
    for (const id of ["name", "links", "password"]) expect(out.split(`data-ws-section="${id}"`)).toHaveLength(2);
  });

  it("an unknown section shows the first; outside the workspace nothing is marked", () => {
    expect(draw({ initial: "billing" })).toContain('data-section="name"');
    const flow = draw({ marks: workspaceMarks(false, false, false) });
    expect(flow).not.toContain("data-workspace");
    expect(flow).not.toContain("data-section=");
  });
});
