import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { offeredHref, useAddressSection } from "./address-section";
import { addressTarget } from "./sectioned-workspace";

/*
  A page's choice kept in its address (ui/address-section.ts: Admin Resources' filter, Admin Matchup
  notes' view, Admin Branding's section), by the sectioned workspace's address rules. What a browser
  does with it (Back, Forward, a soft navigation, a Back that leaves the page) is e2e/admin-branding's;
  here, the decisions it makes, and the first paint.
*/

const ids = ["all", "league", "removed"];

describe("the choice an address change shows (addressTarget, as the sectioned workspace's)", () => {
  const at = { pathname: "/admin/resources", rendered: "/admin/resources", ids, current: "league" };

  it("follows a soft navigation to the page's own path with another query: the choice it names, else the first", () => {
    // /admin/resources?section=league, then Admin Mode's Resources link (a Next <Link> to /admin/resources): All, not League.
    expect(addressTarget({ ...at, search: "" })).toBe("all");
    expect(addressTarget({ ...at, search: "?section=removed" })).toBe("removed");
    expect(addressTarget({ ...at, search: "?view=drafts", param: "view", ids: ["queue", "drafts"], current: "queue" })).toBe("drafts");
  });

  it("does nothing for a Back that leaves the page (another page's path), nor where the address names the choice shown", () => {
    expect(addressTarget({ ...at, pathname: "/admin", search: "" })).toBeNull();
    expect(addressTarget({ ...at, pathname: "/admin/branding", search: "?section=colours" })).toBeNull();
    expect(addressTarget({ ...at, search: "?section=league" })).toBeNull();
  });
});

describe("a choice no longer offered (offeredHref)", () => {
  const at = { pathname: "/admin/resources", rendered: "/admin/resources", href: "/admin/resources?section=removed&x=1", search: "?section=removed&x=1", ids: ["all", "league"], current: "all" };

  it("replaces the address of a choice whose rows are gone with the first's, keeping the rest of it", () => {
    expect(offeredHref(at)).toBe("/admin/resources?x=1");
    expect(offeredHref({ ...at, href: "/admin/matchup-notes?view=gone", search: "?view=gone", param: "view", pathname: "/admin/matchup-notes", rendered: "/admin/matchup-notes", ids: ["queue", "drafts"], current: "queue" })).toBe("/admin/matchup-notes");
  });

  it("leaves an address that is right as it stands, and never writes onto another page's address (Back leaving the page)", () => {
    expect(offeredHref({ ...at, href: "/admin/resources?section=league", search: "?section=league", current: "league" })).toBeNull();
    expect(offeredHref({ ...at, href: "/admin/resources", search: "" })).toBeNull();
    // A choice still offered, not yet shown (the address leads, the next render follows it): not this function's to undo.
    expect(offeredHref({ ...at, href: "/admin/resources?section=league", search: "?section=league" })).toBeNull();
    // Back went to /admin/settings?section=password while this page is still mounted: its address is not this page's.
    expect(offeredHref({ ...at, pathname: "/admin/settings", href: "/admin/settings?section=password", search: "?section=password" })).toBeNull();
  });
});

describe("the first paint", () => {
  function Probe({ initial, param }: { initial?: string | null; param?: string }) {
    const [current] = useAddressSection(ids, { initial, param });
    return h("p", null, current);
  }

  it("is `initial` where the address cannot be read (outside Next's router), else the first", () => {
    expect(renderToStaticMarkup(h(Probe, { initial: "league" }))).toBe("<p>league</p>");
    expect(renderToStaticMarkup(h(Probe, { initial: "nope" }))).toBe("<p>all</p>");
    expect(renderToStaticMarkup(h(Probe, {}))).toBe("<p>all</p>");
  });
});
