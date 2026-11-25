import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_LINKS, MANIFEST_SHORTCUTS, NAV_LINKS, destinations } from "@/lib/nav";

/*
  Navigation parity (navigation N1, 19 Nov 2026; docs/MOBILE.md, "Navigation"): every bar holds the
  same destinations, with the same names, icons and order, in Player Mode and in Admin Mode, as the
  pages are drawn: the desktop's sidebar (NavLinks), a tablet's top bar, a phone's bottom bar
  upright and its compact bar held sideways (all three in MobileNav's markup, CSS showing one by
  posture), and the installed app's shortcuts (the manifest). The bars are rendered as the server
  renders them; the browser tests check what each posture shows (e2e/mobile-nav.spec.ts).
*/

let pathname = "/team";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ back: () => undefined, push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
// The manifest reads the team's branding from the database; here there is none, and it falls back to the defaults.
vi.mock("@/server/bootstrap", () => ({ getAppDb: () => Promise.reject(new Error("no database in a unit test")) }));

const { NavLinks } = await import("./nav-links");
const { MobileNav } = await import("./mobile-nav");
const { default: manifest } = await import("@/app/manifest");

interface Shown {
  href: string;
  /** The whole name, as shown where it fits. */
  name: string;
  /** The short name, where the bar has one for it. */
  short: string | null;
  /** The lucide icon drawn (its class), or "avatar" where the account's picture stands in for My Profile's. */
  icon: string;
}

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const iconOf = (html: string) => /class="lucide lucide-([a-z0-9-]+)/.exec(html)?.[1] ?? (/<img|data-testid="avatar/.test(html) ? "avatar" : "none");

/** The links of the nav marked `marker` (its test id, or its label), with what each shows. */
function linksIn(html: string, marker: RegExp): Shown[] {
  const nav = new RegExp(`<nav[^>]*${marker.source}[^>]*>([\\s\\S]*?)</nav>`).exec(html);
  if (!nav) throw new Error(`no nav ${marker}`);
  return [...nav[1]!.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => {
    // The name is written once: its whole text; its short form is that text less the part that
    // gives way (data-name="rest"), read out only where the bar is narrow.
    const text = inner!.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<span class="sr-only">, back<\/span>/g, "");
    const rest = /<span[^>]*data-name="rest"[^>]*>[^<]*<\/span>/.exec(text);
    return { href: /href="([^"]*)"/.exec(attrs!)![1]!, name: strip(text), short: rest ? strip(text.replace(rest[0], "")) : null, icon: iconOf(inner!) };
  });
}

/** What the destinations themselves say each bar should show (the sidebar has no short names). */
function expected(allowed: readonly string[], admin: boolean, { shorts = true } = {}): Shown[] {
  return destinations(allowed, admin).map((d) => ({ href: d.href, name: d.label, short: shorts ? (d.short ?? null) : null, icon: iconOf(renderToStaticMarkup(createElement(d.icon))) }));
}

function render(path: string, allowed: string[], admin: boolean) {
  pathname = path;
  const sidebar = renderToStaticMarkup(createElement(NavLinks, { allowed, admin }));
  const frame = renderToStaticMarkup(
    createElement(MobileNav, {
      logoSrc: null,
      shortName: "Team",
      tagline: "",
      home: admin ? "/admin" : "/team",
      // No picture: My Profile's icon is drawn, as for an account without one.
      user: { name: "Member", username: "member", avatarUrl: null, roleLabel: "Player" },
      status: null,
      legal: { title: "notice", href: "/settings#compliance" },
      showSignOut: true,
      allowed,
      adminMode: admin,
      hasPlayer: true,
      modeSwitch: "player",
    }),
  );
  return {
    sidebar: linksIn(sidebar, /aria-label="Main"/),
    tablet: linksIn(frame, /data-testid="topbar-destinations"/),
    phone: linksIn(frame, /data-testid="phone-tabbar"/),
    sideways: linksIn(frame, /data-testid="topbar-tabs"/),
  };
}

const PLAYER = NAV_LINKS.map((l) => l.href);
const ADMIN = ADMIN_LINKS.map((l) => l.href);

describe("navigation parity: one set of destinations on every screen", () => {
  it.each([
    ["Player Mode, a team member", PLAYER, false, "/team"],
    ["Player Mode, an account outside the team", ["/overview", "/lookup", "/resources", "/settings"], false, "/resources"],
    ["Player Mode, without Leaderboards (Restricted Player)", PLAYER.filter((h) => h !== "/leaderboards"), false, "/players"],
    ["Admin Mode, every permission", ADMIN, true, "/admin"],
    ["Admin Mode, branding only", ["/admin", "/admin/branding", "/admin/previews", "/admin/resources", "/admin/audit"], true, "/admin/audit"],
  ] as const)("%s: the sidebar, a tablet's bar, a phone's bar and its sideways bar hold the same entries, names, icons and order", (_, allowed, admin, path) => {
    const bars = render(path, [...allowed], admin);
    expect(bars.sidebar, "the sidebar").toEqual(expected(allowed, admin, { shorts: false }));
    expect(bars.tablet, "a tablet's top bar").toEqual(expected(allowed, admin));
    expect(bars.phone, "a phone's bottom bar").toEqual(expected(allowed, admin));
    expect(bars.sideways, "a phone's bar held sideways").toEqual(expected(allowed, admin));
    // Four at most, never the account's own pages.
    expect(bars.phone.length).toBeLessThanOrEqual(4);
    for (const bar of Object.values(bars)) expect(bar.map((l) => l.name)).not.toContain("Settings");
  });

  it("Player Mode is My Profile, Team, Champion Intel and Resources; Admin Mode Dashboard, Users & Permissions, Platform Settings and System", () => {
    expect(render("/team", PLAYER, false).phone.map((l) => [l.name, l.short, l.icon])).toEqual([
      ["My Profile", "Profile", "circle-user-round"],
      ["Team", null, "users"],
      ["Champion Intel", "Intel", "scan-search"],
      ["Resources", null, "book-bookmark"],
    ]);
    expect(render("/admin", ADMIN, true).phone.map((l) => [l.name, l.short, l.icon])).toEqual([
      ["Dashboard", null, "layout-dashboard"],
      ["Users & Permissions", "Users", "user-cog"],
      ["Platform Settings", "Platform", "sliders-horizontal"],
      ["System", null, "server-cog"],
    ]);
  });

  it("the installed app's shortcuts are the same four, in the same order, under the same names, each to the entry's first page", async () => {
    const m = await manifest();
    expect(m.shortcuts!.map((s) => ({ name: s.name, url: s.url, icon: s.icons![0]!.src }))).toEqual(MANIFEST_SHORTCUTS);
    expect(m.shortcuts!.map((s) => s.name)).toEqual(render("/team", PLAYER, false).sidebar.map((l) => l.name));
    expect(m.shortcuts!.map((s) => s.url)).toEqual(expected(PLAYER, false).map((l) => l.href));
  });

  it("each shortcut carries its destination's own icon, the one the bars draw, as a 96×96 PNG that exists", async () => {
    const m = await manifest();
    // The bars draw the lucide icon whose class is lucide-<name>; the shortcut's PNG has that name.
    const drawn = expected(PLAYER, false).map((l) => `/icons/shortcuts/${l.icon}.png`);
    expect(m.shortcuts!.map((s) => s.icons![0]!.src)).toEqual(drawn);
    expect(new Set(drawn).size).toBe(drawn.length);
    for (const s of m.shortcuts!) {
      const icon = s.icons![0]!;
      expect(icon.sizes).toBe("96x96");
      const png = readFileSync(join(process.cwd(), "public", icon.src));
      // PNG signature, then the IHDR's width and height (scripts/shortcut-icons.mjs draws them).
      expect(png.subarray(1, 4).toString("ascii"), icon.src).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], icon.src).toEqual([96, 96]);
    }
  });
});
