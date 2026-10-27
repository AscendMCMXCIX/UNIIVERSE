import { expect, test, type Page } from "./test";
import { AxeBuilder } from "@axe-core/playwright";

/*
  Phase 3 quality gates, run once (desktop project) with explicit viewports:
    - no page is wider than the screen from 320 px phones to 1920 px desktops, including short
      landscape heights, and every page keeps its heading;
    - automated accessibility (axe, WCAG 2.1 A/AA): no critical or serious violations.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const PLAYER_ROUTES = ["/team", "/players", "/leaderboards", "/matches", "/overview", "/overview/champions", "/overview/development", "/overview/matches", "/resources", "/settings"];
const ADMIN_ROUTES = ["/admin", "/admin/people", "/admin/people/access", "/admin/people/privacy", "/admin/branding", "/admin/previews", "/admin/resources", "/admin/data", "/admin/system", "/admin/audit", "/admin/settings"];
const SIZES: Array<[number, number]> = [
  [320, 640],
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440], // ultrawide
  [3840, 2160],
  [844, 390], // phone in landscape
  [1366, 600], // short laptop window
];

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("layout across screen sizes", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once with explicit viewports"));

  test("player pages fit every width", async ({ page }) => {
    test.setTimeout(240_000);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      for (const route of PLAYER_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${route} at ${width}x${height}`).toBeLessThanOrEqual(1);
        await expect(page.locator("main h1, main h2").first(), `${route} heading at ${width}x${height}`).toBeVisible();
      }
    }
  });

  test("admin pages fit phone and desktop widths", async ({ page }) => {
    test.setTimeout(180_000);
    for (const [width, height] of [[320, 640], [390, 844], [1024, 768], [1366, 768], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      for (const route of ADMIN_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${route} at ${width}x${height}`).toBeLessThanOrEqual(1);
        await expect(page.locator("main h1, main h2").first(), `${route} heading at ${width}x${height}`).toBeVisible();
      }
    }
  });
});

test.describe("accessibility", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  async function audit(page: Page, label: string) {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), label).toEqual([]);
  }

  test("player pages have no critical or serious violations", async ({ page }) => {
    test.setTimeout(120_000);
    for (const route of PLAYER_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await audit(page, route);
    }
  });

  test("every control the keyboard reaches shows the same focus ring", async ({ page }) => {
    // The accent outline of the shared controls (globals.css), on links and hand-made buttons too:
    // never the browser's own ring, which differs between browsers, and never none. A text field
    // marks its focus with its accent border instead.
    for (const route of ["/team", "/players", "/resources", "/admin/people"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const accent = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-accent)";
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      });
      const reached: string[] = [];
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          // A control that fades its colours (transition-colors) fades the ring in too: read its end.
          for (const animation of el.getAnimations()) animation.finish();
          const s = getComputedStyle(el);
          const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
          return { what: `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""} "${label}"`, field: el.matches("input:not([type=checkbox]):not([type=radio]), textarea, select"), ring: [s.outlineStyle, s.outlineWidth, s.outlineColor], border: s.borderTopColor };
        });
        if (!focus) continue;
        reached.push(focus.what);
        if (focus.field) expect(focus.border === accent || focus.ring.join(" ") === `solid 2px ${accent}`, `${route}: ${focus.what}`).toBe(true);
        else expect(focus.ring, `${route}: ${focus.what}`).toEqual(["solid", "2px", accent]);
      }
      expect(reached.length, `${route}: the keyboard reaches its controls`).toBeGreaterThan(8);
    }
  });

  test("admin pages have no critical or serious violations", async ({ page }) => {
    test.setTimeout(120_000);
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await audit(page, route);
    }
  });
});

test.describe("shell, motion and notifications", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("the sidebar stays in view while a long page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    // Games played together: a page that is always several screens long (Team fits about one).
    await page.goto("/matches");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toBeVisible();
    const before = (await sidebar.boundingBox())!;
    // Wheel over the page content: at the default pointer position (0, 0) the wheel lands on the
    // sidebar, which scrolls itself instead of the page whenever its own content overflows.
    await expect(page.getByTestId("played-together")).toBeVisible();
    await page.mouse.move(900, 300);
    // Under load the first wheel can land before the page has its full height: retry until it scrolls.
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, 2000);
        return page.evaluate(() => window.scrollY);
      })
      .toBeGreaterThan(200);
    const after = (await sidebar.boundingBox())!;
    expect(after.y).toBe(before.y);
    expect(after.height).toBeLessThanOrEqual(600 + 1);
  });

  test("a collapsed sidebar opens while pointed at and folds back when the pointer leaves", async ({ page }) => {
    await page.goto("/team");
    const aside = page.locator("aside");
    await aside.getByTestId("sidebar-toggle").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    // Still under the pointer right after collapsing: no preview until the pointer leaves once.
    await page.waitForTimeout(400);
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await page.mouse.move(900, 400);
    // The rail holds one icon per entry (My Profile, Team); the current page's entry (Team) stays marked.
    const profileLink = aside.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Profile" });
    const profileLabel = profileLink.locator("span.truncate");
    await expect.poll(() => profileLabel.evaluate((e) => getComputedStyle(e).opacity)).toBe("0");
    await expect(aside.getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
    // The first icon of the rail: My Profile (a single link).
    const icon = profileLink.locator("svg").first();
    const iconBefore = (await icon.boundingBox())!;
    // Collapsed, the hidden labels are clipped away: the page next to the icons stays clickable.
    expect(await page.evaluate(() => document.elementFromPoint(160, 300)?.closest("aside") === null)).toBe(true);
    await page.mouse.move(30, 300);
    await expect(aside).toHaveAttribute("data-peek", "true");
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    // Pointing at the rail reveals the labels.
    await expect.poll(() => profileLabel.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
    await expect(profileLink).toBeInViewport();
    // The preview overlays the page: the content does not move, and neither does the first icon.
    const slot = (await page.getByTestId("sidebar-slot").boundingBox())!;
    expect(Math.round(slot.width)).toBe(72);
    const iconAfter = (await icon.boundingBox())!;
    expect(Math.abs(iconAfter.x - iconBefore.x) + Math.abs(iconAfter.y - iconBefore.y)).toBeLessThan(1);
    await page.mouse.move(900, 400);
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    // Hovering never changed the saved choice.
    await page.reload();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
    await page.locator("aside").getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
  });

  test("a page that does not exist says so, with a way back", async ({ page }) => {
    // A player who does not exist, and an address no page answers (which also answers 404).
    for (const address of ["/players/00000000-0000-4000-8000-000000000000", "/no-such-page"]) {
      const response = await page.goto(address);
      if (address === "/no-such-page") expect(response!.status()).toBe(404);
      const missing = page.getByTestId("not-found");
      await expect(missing.getByRole("heading", { level: 1 }), address).toHaveText("This page does not exist");
      await expect(missing.getByRole("link", { name: "Go to the start page" }), address).toHaveAttribute("href", "/");
    }
    await page.getByTestId("not-found").getByRole("link", { name: "Go to the start page" }).click();
    await expect(page.locator("main")).toBeVisible();
  });

  test("reduced motion switches animations and transitions off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/team");
    const durations = await page.evaluate(() => {
      const card = document.querySelector("[data-testid^=lineup-row-]");
      const style = card ? getComputedStyle(card) : null;
      return style ? [style.animationDuration, style.transitionDuration] : [];
    });
    expect(durations.length).toBe(2);
    for (const d of durations) expect(parseFloat(d)).toBeLessThanOrEqual(0.01);
  });

  test("saving shows a notification; an empty tagline shows nothing", async ({ page }) => {
    await page.goto("/admin/branding");
    await page.locator("#brand-tagline").fill("Climb together");
    await page.getByRole("button", { name: "Save branding" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
    // Admin Mode names itself under the brand instead of the tagline; Player Mode shows the tagline.
    await page.reload();
    await expect(page.getByTestId("sidebar").getByText("Admin mode", { exact: true })).toBeVisible();
    await expect(page.getByTestId("sidebar").getByText("Climb together")).toHaveCount(0);
    await page.goto("/team");
    await expect(page.getByTestId("sidebar").getByText("Climb together")).toBeVisible();
    // Back to no tagline: nothing is shown in its place.
    await page.goto("/admin/branding");
    await page.locator("#brand-tagline").fill("");
    await page.getByRole("button", { name: "Save branding" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
    await page.goto("/team");
    await expect(page.getByTestId("sidebar").getByText("Climb together")).toHaveCount(0);
  });
});

/** A teammate's profile Overview (the demo's local owner has no player profile of its own). */
async function openTeammateProfile(page: Page) {
  await page.goto("/players");
  await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").click();
  await page.waitForURL(/\/players\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("season-summary")).toBeVisible();
}

test.describe("tooltips", () => {
  test("open on hover and close when the pointer leaves; keyboard focus and Escape; never clipped", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "pointer hover is a desktop behaviour");
    await openTeammateProfile(page);
    const tip = page.locator("[data-testid=info-tip]:visible").first();
    await tip.scrollIntoViewIfNeeded();
    await tip.hover();
    const bubble = page.getByTestId("info-tip-bubble");
    await expect(bubble).toBeVisible();
    // Drawn in the layer above the page (not inside the card), and entirely on screen.
    expect(await bubble.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const box = (await bubble.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    // A click while hovering keeps it open.
    await tip.click();
    await expect(bubble).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(bubble).toHaveCount(0);
    // Keyboard: focus arriving (the click above left it focused, so move it away first).
    await tip.blur();
    await tip.focus();
    await expect(bubble).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  });

  test("a tap opens it, and a tap elsewhere closes it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch behaviour");
    await openTeammateProfile(page);
    const tip = page.locator("[data-testid=info-tip]:visible").first();
    await tip.scrollIntoViewIfNeeded();
    await tip.tap();
    const bubble = page.getByTestId("info-tip-bubble");
    await expect(bubble).toBeVisible();
    const box = (await bubble.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.locator("h1, h2").first().tap();
    await expect(bubble).toHaveCount(0);
    // Tapping the ⓘ again toggles it.
    await tip.tap();
    await expect(bubble).toBeVisible();
    await tip.tap();
    await expect(bubble).toHaveCount(0);
  });
});

test.describe("ranked development", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("the old Solo Queue Blocks addresses lead to Ranked Development, which needs a player profile", async ({ page }) => {
    // The journey itself runs on member accounts in e2e/ranked-development.spec.ts.
    for (const [from, to] of [
      ["/overview/blocks", /\/overview\/development\/sessions$/],
      ["/overview/blocks/history", /\/overview\/development\/sessions$/],
      ["/blocks", /\/overview\/development\/sessions$/],
      ["/ranked", /\/overview\/development$/],
    ] as const) {
      await page.goto(from);
      await expect(page, from).toHaveURL(to);
    }
    // The in-memory demo's local owner has no player profile: My Profile says where to make one.
    await page.goto("/overview/development");
    await expect(page.getByText("This account has no player profile yet.")).toBeVisible();
  });
});

test.describe("sidebar entries", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("Player Mode is three single entries, My Profile, Team and Resources, with no groups to fold", async ({ page }) => {
    await page.goto("/team");
    const aside = page.locator("aside");
    const order = await aside.locator("nav[aria-label='Main'] a").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual(["nav-overview", "nav-team", "nav-resources"]);
    await expect(aside.getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  });

  test("Admin Mode is six single entries; a section with several pages shows them as tabs and stays marked on each", async ({ page }) => {
    await page.goto("/admin/previews");
    const aside = page.locator("aside");
    const order = await aside.locator("nav[aria-label='Main'] a").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual(["nav-admin", "nav-admin-users", "nav-admin-settings", "nav-admin-data", "nav-admin-system", "nav-admin-audit"]);
    const settings = aside.getByTestId("nav-admin-settings");
    await expect(settings).toHaveAttribute("aria-current", "page");
    await expect(settings).toHaveAttribute("href", "/admin/branding");
    const tabs = page.getByTestId("admin-settings-tabs");
    await expect(tabs.getByRole("link")).toHaveText(["Branding", "Previews", "Resources"]);
    await tabs.getByRole("link", { name: "Branding" }).click();
    await expect(page).toHaveURL(/\/admin\/branding$/);
    await expect(settings).toHaveAttribute("aria-current", "page");
    // Users & Permissions: Accounts and Access levels, under one entry.
    await page.goto("/admin/people/access");
    await expect(aside.getByTestId("nav-admin-users")).toHaveAttribute("aria-current", "page");
    await expect(aside.getByTestId("nav-admin")).not.toHaveAttribute("aria-current", "page");
  });

  test("My Profile is one sidebar link; a profile's sections are the bar on the page, and every section address still works", async ({ page }) => {
    await page.goto("/overview/matches");
    const aside = page.locator("aside");
    const link = aside.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Profile" });
    // Marked on every section of your profile; the sections themselves are not repeated in the sidebar.
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(aside.getByRole("link", { name: "Match History" })).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(/\/overview$/);
    // The section bar under a profile card is the one list of sections (a teammate's profile here:
    // the demo's local owner has no player profile), and each section keeps its own address.
    await page.goto("/players");
    const card = page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']");
    const href = (await card.getAttribute("href"))!;
    await page.goto(`${href}/matches`);
    const tabs = page.getByTestId("profile-tabs");
    // The sections, in their deliberate order (Ranked Development, private, sits between Match
    // History and Riot Accounts on your own profile only; Matchups live in a champion's window).
    await expect(tabs.getByRole("link")).toHaveText(["Overview", "All Champions", "Match History", "Riot Accounts"]);
    await expect(tabs.getByRole("link", { name: "Match History" })).toHaveAttribute("aria-current", "page");
    await expect(aside.getByRole("link", { name: "Match History" })).toHaveCount(0);
    await tabs.getByRole("link", { name: "All Champions" }).click();
    await expect(page).toHaveURL(new RegExp(`${href}/champions`));
    await expect(tabs.getByRole("link", { name: "All Champions" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("large screens", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("the layout grows with the window instead of staying small, and stays unchanged at laptop size", async ({ page }) => {
    const root = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/team");
    expect(await root()).toBe(16);
    // Resized live, without reloading.
    await page.setViewportSize({ width: 2560, height: 1440 });
    expect(await root()).toBeGreaterThan(19);
    const sidebar = (await page.getByTestId("sidebar-slot").boundingBox())!;
    expect(sidebar.width).toBeGreaterThan(256 * 1.2);
    await page.setViewportSize({ width: 3840, height: 2160 });
    expect(await root()).toBeLessThanOrEqual(22);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
});
