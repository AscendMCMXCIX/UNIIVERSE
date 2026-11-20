import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from "./test";
import { lineupAtRest } from "./lineup";
import { openMatchWindow } from "./match-history";
import { memberContext } from "./member-account";
import { playerEntry } from "./players";

/*
  PHONES HELD EITHER WAY (in-memory demo; Chromium emulating each device, not the devices
  themselves). A phone held sideways is a short window (480px tall or less), whatever its width
  below lg: one compact top bar holds the four destinations (no bottom bar), a profile's sections or
  a destination's tabs ride as its second row, and it slides away while reading and comes back on a scroll up; detail windows
  take the whole screen and scroll as one with their controls in reach, and dialogs keep their title
  and actions on screen. Turning the phone keeps what was open and chosen (docs/MOBILE.md, "Frames
  by posture").
*/

const SE_LANDSCAPE = devices["iPhone SE landscape"];
const IPHONE_LANDSCAPE = devices["iPhone 15 landscape"];
const IPHONE = devices["iPhone 15"];
const SE = devices["iPhone SE"];

async function phone(browser: Browser, baseURL: string, device: BrowserContextOptions & { defaultBrowserType?: string }, view: "player" | "admin" = "player"): Promise<Page> {
  const { defaultBrowserType: _, ...options } = device;
  const context = await browser.newContext(options);
  await context.addCookies([{ name: "uniiverse_view", value: view, url: baseURL }]);
  return context.newPage();
}

/**
 * Closes a test's own context once the page is quiet. Closing while a request is still streaming
 * (Next prefetches the links on screen) can catch the trace mid-write: Playwright then fails the
 * close with "file data stream has unexpected number of bytes".
 */
async function done(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.context().close();
}

/** Where an element sits on screen, once its opening motion (if any) is over. */
const rect = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight };
  });

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "phone", "the device matrix runs once, with its own devices");
});

test("held sideways: one compact bar holds the destinations, with no bottom bar, and it gets out of the way while reading", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE);
  await page.goto("/players");
  await expect(playerEntry(page).first()).toBeVisible();
  // The roster is one column of rows on a small phone held sideways: far more than the bar needs to slide away.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), "Players scrolls on a small phone held sideways").toBeGreaterThan(200);
  const bar = page.getByTestId("mobile-topbar");
  // The places to go stay one tap away sideways: in the top bar, the one primary navigation shown.
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toHaveCount(1);
  await expect(bar.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByTestId("phone-tabbar")).toBeHidden();
  const links = nav.getByRole("link");
  for (const [i, name] of ["My Profile", "Team", "Matchup Intel", "Resources"].entries()) await expect(links.nth(i)).toHaveAccessibleName(name);
  // Players is one of Team's sections: Team is the current destination, Players the current section under the bar.
  await expect(nav.locator("[aria-current=page]")).toHaveAccessibleName("Team");
  await expect(page.getByTestId("team-chrome-tabs").locator("[aria-current=page]")).toHaveText("Players");
  // A 568px phone's row is 34.5rem: all four named in full (the five before could name only the current one), each a 44px target.
  const labels = await links.evaluateAll((as) => as.map((a) => ({ shown: a.querySelector("[data-name=label]")!.getBoundingClientRect().width > 1, rest: !a.querySelector("[data-name=rest]") || a.querySelector("[data-name=rest]")!.getBoundingClientRect().width > 1, height: a.getBoundingClientRect().height, width: a.getBoundingClientRect().width })));
  for (const l of labels) {
    expect(l.shown && l.rest, "every name shown whole").toBe(true);
    expect(Math.min(l.height, l.width)).toBeGreaterThanOrEqual(44);
  }
  // The compact bar and Team's 44px row under it, with the hairline: at most 90px.
  const barBox = await rect(page, "[data-testid=mobile-topbar]");
  expect(barBox.height).toBeLessThanOrEqual(90);
  // No room is kept under the page for a bottom bar: only the page's own padding.
  expect(await page.locator("main").evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))).toBeLessThanOrEqual(24);

  await expect(bar).toHaveAttribute("data-hidden", "false");
  await page.mouse.wheel(0, 700);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).bottom).toBeLessThanOrEqual(1);
  // A slow drag up (two pixels a frame) brings it back...
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, -2);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }
  });
  await expect(bar).toHaveAttribute("data-hidden", "false");
  // ...and so does any quicker scroll up, after it has gone again.
  await page.mouse.wheel(0, 300);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await page.mouse.wheel(0, -120);
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).top).toBeGreaterThanOrEqual(0);
  // Gone again, the focus moving into it brings it back while the focus is there.
  await page.mouse.wheel(0, 300);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await page.getByTestId("topbar-tab-team").focus();
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).top).toBeGreaterThanOrEqual(0);
  await done(page);
});

test("held sideways, the bars at rest on a profile are the compact bar and the sections' 44px row, its band at most 80px, and nothing is wider than the phone", async ({ browser, baseURL }) => {
  // An iPhone 15 in Safari (its home indicator's inset told: before, the bars there were 163px:
  // the top bar with the sections 97 and the bottom bar 66), the same phone's whole screen, an
  // iPhone SE (1st gen), an iPhone 12 and a Pixel 7, all held sideways.
  const frames = [
    { name: "iPhone 15 in Safari", viewport: { width: 734, height: 343 }, bottom: 21 },
    { name: "iPhone 15", viewport: { width: 852, height: 393 }, bottom: 21 },
    { name: "iPhone SE", viewport: { width: 568, height: 320 }, bottom: 0 },
    { name: "iPhone 12", viewport: { width: 844, height: 390 }, bottom: 21 },
    { name: "Pixel 7", viewport: { width: 915, height: 412 }, bottom: 0 },
  ];
  const page = await phone(browser, baseURL!, IPHONE_LANDSCAPE);
  await page.goto("/team");
  // Demo Top's profile, and Demo Mid's: an off role, the lineup status and two links on the band's line.
  const profiles = await Promise.all((["TOP", "MID"] as const).map(async (role) => `/players/${await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id")}`));
  const cdp = await page.context().newCDPSession(page);
  for (const f of frames) {
    await page.setViewportSize(f.viewport);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, topMax: 0, bottom: f.bottom, bottomMax: f.bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
    for (const [i, profile] of profiles.entries()) {
      await page.goto(profile);
      await expect(page.getByTestId("profile-chrome-tabs")).toBeVisible();
      if (i === 1) await expect(page.getByTestId("profile-header").getByTestId("social-links").locator("li")).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      const where = `${["Demo Top", "Demo Mid"][i]} on ${f.name} (${f.viewport.width} × ${f.viewport.height})`;
      // Read once the bar has measured itself (a ResizeObserver): it sets the page's scroll padding.
      await expect(async () => {
        const m = await page.evaluate(() => {
          const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
          const top = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]")!;
          const meta = document.querySelector<HTMLElement>("[data-testid=profile-meta]")!;
          const oneLine = (el: Element) => {
            const r = [...el.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.getBoundingClientRect());
            return Math.max(...r.map((b) => b.top)) < Math.min(...r.map((b) => b.bottom));
          };
          return {
            bars: top.getBoundingClientRect().height + (shown(document.querySelector("[data-testid=phone-tabbar]")) ? document.querySelector("[data-testid=phone-tabbar]")!.getBoundingClientRect().height : 0),
            row: top.firstElementChild!.getBoundingClientRect().height,
            sections: document.querySelector("[data-testid=profile-sections-bar]")!.getBoundingClientRect().height,
            band: document.querySelector("[data-testid=profile-header]")!.getBoundingClientRect().height,
            // One line: every item of the roles line overlaps every other's height (a wrapped one starts below the first line's foot).
            oneLine: oneLine(meta),
            pageTabs: shown(document.querySelector("[data-testid=profile-tabs]")),
            padding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0,
            barHeight: top.offsetHeight,
            wider: document.documentElement.scrollWidth - innerWidth,
          };
        });
        expect(m.row, `${where}: the bar's row`).toBeLessThanOrEqual(44.5);
        expect(m.sections, `${where}: the sections' row, a 44px target`).toBeGreaterThanOrEqual(44);
        expect(m.sections, `${where}: the sections' row`).toBeLessThanOrEqual(44.5);
        expect(m.bars, `${where}: the bars at rest`).toBeLessThanOrEqual(90);
        expect(m.band, `${where}: the profile's band`).toBeLessThanOrEqual(80);
        expect(m.oneLine, `${where}: the band's roles line is one line`).toBe(true);
        // The sections are the bar's row alone: not again in the page.
        expect(m.pageTabs, `${where}: no sections row in the page`).toBe(false);
        // What the keyboard or a link's #anchor brings into view lands clear of the bar, its two rows measured (MEASURED_BAR).
        expect(m.padding, `${where}: the page's scroll padding clears the bar`).toBeGreaterThanOrEqual(m.barHeight);
        expect(m.wider, `${where}: nothing wider than the phone`).toBeLessThanOrEqual(1);
      }).toPass({ timeout: 10_000 });
    }
  }
  await done(page);
});

test("held sideways, the band holds the longest line it is made for, on one line: the roles, the rank, the lineup status and three links", async ({ browser, baseURL }) => {
  // The worst the band's line must hold (SIDEWAYS_META in profile-header.tsx): "Support" as the
  // primary role, two off roles, "Grandmaster · 1234 LP", "In the lineup · Support" and three links,
  // drawn into Demo Mid's band in place (nothing is saved): the narrower the line, the more it condenses.
  const page = await phone(browser, baseURL!, IPHONE_LANDSCAPE);
  await page.goto("/team");
  const profile = `/players/${await page.getByTestId("lineup-row-MID").getAttribute("data-player-id")}`;
  for (const viewport of [{ width: 568, height: 320 }, { width: 640, height: 360 }, { width: 667, height: 375 }, { width: 734, height: 343 }, { width: 852, height: 393 }, { width: 915, height: 412 }]) {
    const where = `${viewport.width} × ${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.goto(profile);
    await expect(page.getByTestId("profile-header").getByTestId("social-links").locator("li")).toHaveCount(2);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(async () => {
      // Demo Mid: Mid with Top as an off role, in the lineup, two links shown; ranked or not, the
      // rank's words become the longest. Drawn again on each try, adding only what is missing: React
      // may still be taking over the page (a busy machine) and put its own nodes back.
      await page.evaluate(() => {
        const h = document.querySelector("[data-testid=profile-header]")!;
        const meta = h.querySelector("[data-testid=profile-meta]")!;
        meta.firstElementChild!.querySelector("span:last-child")!.textContent = "Support";
        const offs = meta.querySelectorAll("[data-testid=additional-role]");
        if (offs.length < 2) offs[0]!.after(offs[0]!.cloneNode(true));
        const rank = meta.querySelector("[data-testid=profile-rank]")!;
        const tier = [...rank.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        if (tier) tier.textContent = "Grandmaster";
        rank.querySelector(".text-fg-muted")!.textContent = tier ? "· 1234 LP" : "Grandmaster · 1234 LP";
        for (const s of meta.querySelectorAll("[data-testid=lineup-status] span:last-child")) s.textContent = "In the lineup · Support";
        const links = h.querySelector("[data-testid=social-links]")!;
        if (links.children.length < 3) links.append(links.lastElementChild!.cloneNode(true));
      });
      const m = await page.evaluate(() => {
        const h = document.querySelector<HTMLElement>("[data-testid=profile-header]")!;
        const meta = h.querySelector<HTMLElement>("[data-testid=profile-meta]")!;
        const oneLine = (el: Element) => {
          const r = [...el.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.getBoundingClientRect());
          return Math.max(...r.map((b) => b.top)) < Math.min(...r.map((b) => b.bottom));
        };
        const chips = [...h.querySelectorAll<HTMLElement>("[data-testid=social-links] li > *")];
        const edge = meta.getBoundingClientRect().right;
        return {
          band: h.getBoundingClientRect().height,
          oneLine: oneLine(meta),
          // Nothing runs past the line's end (into the links, or cut by the band).
          past: Math.max(meta.scrollWidth - meta.clientWidth, ...[...meta.children].map((c) => c.getBoundingClientRect().right - edge)),
          chips: chips.length,
          chip: Math.max(...chips.map((c) => c.getBoundingClientRect().height)),
          touch: Math.min(...chips.map((c) => parseFloat(getComputedStyle(c, "::after").height) || 0)),
          wider: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(m.chips, where).toBe(3);
      expect(m.band, `${where}: the band`).toBeLessThanOrEqual(80);
      expect(m.oneLine, `${where}: one line`).toBe(true);
      expect(m.past, `${where}: nothing past the line's end`).toBeLessThanOrEqual(1);
      // The links: 32px chips, each a 44px target to a finger.
      expect(m.chip, `${where}: a link's chip`).toBeLessThanOrEqual(32.5);
      expect(m.touch, `${where}: a link's target to a finger`).toBeGreaterThanOrEqual(44);
      expect(m.wider, `${where}: nothing wider than the phone`).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 15_000 });
  }
  await done(page);
});

test("held sideways, a member's own Overview with all three links shown keeps its band at most 80px, beside the Customise chip", async ({ browser, page: admin }) => {
  // A real member (the demo's local owner has no profile of their own): their own band adds the
  // You badge and the round Customise chip at its end, and the band keeps the chip's room.
  const member = await memberContext(browser, admin, undefined, { base: "Band", role: "Support" });
  await member.page.goto("/settings");
  const form = member.page.getByTestId("social-links-form");
  await form.getByLabel("YouTube", { exact: true }).fill("youtube.com/@E2EBandChannel");
  await form.getByLabel("Twitch", { exact: true }).fill("e2e_band_live");
  await form.getByLabel("Discord", { exact: true }).fill("@E2E.Band");
  for (const kind of ["youtube", "twitch", "discord"]) await form.getByTestId(`social-public-${kind}`).click();
  await member.page.getByTestId("social-links-save").click();
  await expect(member.page.getByText("Social links saved.")).toBeVisible();
  const { defaultBrowserType: _, ...descriptor } = IPHONE_LANDSCAPE;
  const context = await browser.newContext({ ...descriptor, storageState: await member.context.storageState() });
  await member.context.close();
  const page = await context.newPage();
  for (const viewport of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 734, height: 343 }, { width: 852, height: 393 }]) {
    const where = `${viewport.width} × ${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.goto("/overview");
    const header = page.getByTestId("profile-header");
    await expect(header.getByTestId("social-links").locator("li"), where).toHaveCount(3);
    await expect(header.getByTestId("customise-card"), where).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(async () => {
      const m = await header.evaluate((h) => {
        const meta = h.querySelector<HTMLElement>("[data-testid=profile-meta]")!;
        const oneLine = (el: Element) => {
          const r = [...el.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.getBoundingClientRect());
          return Math.max(...r.map((b) => b.top)) < Math.min(...r.map((b) => b.bottom));
        };
        const chip = h.querySelector("[data-testid=customise-card]")!.getBoundingClientRect();
        const links = h.querySelector("[data-testid=social-links]")!.getBoundingClientRect();
        return {
          band: h.getBoundingClientRect().height,
          oneLine: oneLine(meta),
          clear: chip.left - links.right,
          wider: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(m.band, `${where}: the band`).toBeLessThanOrEqual(80);
      expect(m.oneLine, `${where}: one line`).toBe(true);
      expect(m.clear, `${where}: the links keep clear of Customise`).toBeGreaterThanOrEqual(0);
      expect(m.wider, `${where}: nothing wider than the phone`).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 10_000 });
  }
  await done(page);
});

test("held sideways, the compact bar's Filters gets the focus back from its sheet (Escape, Done), and stays while it has it, even once a change has emptied the list", async ({ browser, baseURL }) => {
  // The same top bar's Filters as upright (mobile-nav.spec.ts), in the one compact bar, which slides
  // away while reading: on an SE and at a tablet's width (an iPhone 15's whole screen).
  for (const viewport of [{ width: 568, height: 320 }, { width: 852, height: 393 }]) {
    const where = `${viewport.width} × ${viewport.height}`;
    const page = await phone(browser, baseURL!, { ...IPHONE_LANDSCAPE, viewport });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/team");
    await page.goto(`/players/${await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id")}/matches`);
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    // Down the list by steps, as a reader scrolls (the bar slides away), then a little back up: the bar
    // returns, its Filters in it, the page's own far above.
    await page.evaluate(async () => {
      for (let at = window.scrollY; at < document.documentElement.scrollHeight; at += 240) {
        window.scrollTo(0, at);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const bar = page.getByTestId("mobile-topbar");
    await expect(bar, where).toHaveAttribute("data-hidden", "true");
    await page.mouse.wheel(0, -80);
    await expect(bar, where).toHaveAttribute("data-hidden", "false");
    const filters = bar.getByTestId("topbar-filters");
    const sheet = page.getByTestId("filter-sheet");
    await filters.click();
    await expect(sheet, where).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet, where).toHaveCount(0);
    await expect(filters, `${where}: back from Escape`).toBeFocused();
    // A change that leaves no game: the page shortens behind the sheet and its own Filters comes back
    // into view; the bar's button is still there to take the focus back, and stays while it has it.
    await filters.click();
    await sheet.getByTestId("refine-more").click();
    await sheet.getByTestId("refine-to").fill("2001-01-01");
    await expect(page).toHaveURL(/to=2001-01-01/);
    await expect(page.getByTestId("match-empty")).toBeVisible();
    await sheet.getByTestId("filter-sheet-done").click();
    await expect(sheet, where).toHaveCount(0);
    await expect(filters, `${where}: kept after Done`).toBeVisible();
    await expect(filters, `${where}: back from Done`).toBeFocused();
    await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).top, { message: `${where}: the bar in view with the focus in it` }).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Tab");
    await expect(filters, `${where}: gone once the focus moves on`).toHaveCount(0);
    await done(page);
  }
});

test("held sideways, the avatar opens the account screen at every width, and Team's sections ride under the bar, not in the page", async ({ browser, baseURL }) => {
  for (const viewport of [{ width: 734, height: 343 }, { width: 852, height: 393 }]) {
    const page = await phone(browser, baseURL!, { ...IPHONE_LANDSCAPE, viewport });
    await page.goto("/team");
    const where = `${viewport.width} × ${viewport.height}`;
    // Team's sections are the compact bar's second row: the page's own tabs would repeat them.
    await expect(page.getByTestId("team-tabs"), where).toBeHidden();
    await expect(page.getByTestId("mobile-topbar").getByTestId("team-chrome-tabs").getByRole("link"), where).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
    await expect(page.getByTestId("mobile-topbar").getByTestId("account-menu-button"), where).toBeHidden();
    await page.getByTestId("account-sheet-button").click();
    const screen = page.getByTestId("account-sheet");
    await expect(screen, where).toHaveAttribute("data-entered", "true");
    expect(await screen.boundingBox(), where).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    // The account's own items only: Matchup Intel and Resources are destinations of the bar.
    await expect(screen.getByRole("navigation", { name: "Your account" }).getByRole("link"), where).toHaveText(["Settings"]);
    await expect(screen.getByRole("link", { name: "Matchup Intel" }), where).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(screen).toHaveCount(0);
    await expect(page.getByTestId("account-sheet-button"), where).toBeFocused();
    await done(page);
  }
});

test("held upright: a tall phone at the usual text size keeps both bars; under 700px tall the top bar's first row and the tab bar slide away and come back, the sections row pinned", async ({ browser, baseURL }) => {
  for (const [viewport, slides] of [[{ width: 393, height: 852 }, false], [{ width: 375, height: 667 }, true]] as const) {
    const page = await phone(browser, baseURL!, { ...IPHONE, viewport, screen: viewport });
    await page.goto("/players");
    await expect(playerEntry(page).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(400);
    await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", slides ? "row" : "false");
    if (slides) {
      // The sections row stays in view under the status bar; the tab bar has gone below the screen.
      expect((await page.getByTestId("hub-sections-bar").boundingBox())!.y).toBeGreaterThanOrEqual(-1);
      expect((await page.getByTestId("phone-tabbar").boundingBox())!.y).toBeGreaterThanOrEqual(viewport.height - 1);
      await page.mouse.wheel(0, -200);
      await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", "false");
    }
    await done(page);
  }
});

test("held sideways, Team Overview shows the five cards in one compact row: no orphan, no sideways track, no pager, no logo (the bar carries it)", async ({ browser, baseURL }) => {
  // An iPhone 15 and an iPhone SE (3rd gen) held sideways (S3a, 20 Nov 2026: 2 + 2 + 1 with the
  // fifth alone before, UM.T3). The first SE's 568px is under 36rem of lineup: the phone's track.
  for (const device of [IPHONE_LANDSCAPE, devices["iPhone SE (3rd gen) landscape"]]) {
    const page = await phone(browser, baseURL!, device);
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    const { cells } = await lineupAtRest(page);
    const name = `${device.viewport.width} × ${device.viewport.height}`;
    expect(new Set(cells.map((c) => Math.round(c.top))).size, `${name}: one row of five`).toBe(1);
    expect(await page.getByTestId("lineup-overview").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name}: no sideways track`).toBe(true);
    await expect(page.getByTestId("lineup-pager")).toBeHidden();
    // The header's logo and name are the bar's (the h1 read out only): one compact line.
    expect((await page.getByTestId("team-header").boundingBox())!.height, `${name}: the header`).toBeLessThanOrEqual(56);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await done(page);
  }
});

test("held sideways: a detail window takes the whole screen, scrolls as one, and its controls stay in reach", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE_LANDSCAPE);
  await page.goto("/team");
  const open = page.getByTestId("open-player-detail").first();
  const win = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const box = await rect(page, "dialog[open]");
  expect(box.top).toBeLessThanOrEqual(1);
  expect(box.left).toBeLessThanOrEqual(1);
  expect(box.bottom).toBeGreaterThanOrEqual(box.vh - 1);
  expect(box.right).toBeGreaterThanOrEqual(box.vw - 1);

  // The whole window scrolls (its header is taller than the screen allows to keep pinned)...
  const scrolled = await win.evaluate((d) => {
    d.scrollTop = d.scrollHeight;
    return d.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  // ...and the close button is still on screen, finger-sized, and closes it.
  const close = win.getByRole("button", { name: "Close" });
  const c = (await close.boundingBox())!;
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.y + c.height).toBeLessThanOrEqual(box.vh);
  expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(win).toBeHidden();
  await done(page);
});

test("held sideways: a dialog keeps its title and actions on screen and scrolls only its body", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE, "admin");
  await page.goto("/admin/people");
  const open = page.locator("[data-testid=open-access]:not([disabled])").first();
  const dialog = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const box = await rect(page, "dialog[open]");
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.vh + 0.5);
  for (const target of [dialog.locator("#dialog-title"), dialog.getByTestId("save-access"), dialog.getByTestId("dialog-close")]) {
    const b = (await target.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(box.top - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(box.bottom + 1);
  }
  const close = (await dialog.getByTestId("dialog-close").boundingBox())!;
  expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await done(page);
});

test("turning the phone keeps the open window, the chosen filters and the place in the tabs", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href"))!, "http://x").pathname;
  await page.goto(`${profile}/champions?mode=solo`);
  // All Champions' preview: a sheet on a phone, both ways round.
  const win = page.locator("dialog[open][data-testid=champion-preview]");
  const open = page.getByTestId("top-champion").first().getByTestId("open-champion");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page).toHaveURL(/champion=/);
  const url = page.url();

  for (const size of [{ width: 852, height: 393 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(size);
    await expect(win).toBeVisible();
    expect(page.url()).toBe(url);
    const box = await rect(page, "dialog[open][data-testid=champion-preview]");
    // Docked to the bottom edge, within the screen both ways round.
    expect(box.width).toBeLessThanOrEqual(size.width + 1);
    expect(box.bottom).toBeGreaterThanOrEqual(size.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await win.getByTestId("champion-preview-close").click();
  await expect(win).toHaveCount(0);
  await expect(page).toHaveURL(/mode=solo/);
  await done(page);
});

test("tab rows too wide for the screen fade only where more is hidden, and keep the current tab in view", async ({ browser, baseURL }) => {
  // Audit Logs' six categories do not fit a small phone: the row scrolls on its own.
  const page = await phone(browser, baseURL!, devices["iPhone SE"], "admin");
  await page.goto("/admin/audit");
  const list = page.getByTestId("audit-categories");
  await expect(list).toHaveAttribute("data-fade-start", "false");
  await expect(list).toHaveAttribute("data-fade-end", "true");
  await page.goto("/admin/audit?category=privacy");
  await expect(list).toHaveAttribute("data-fade-start", "true");
  const current = await list.locator("[aria-current=page]").boundingBox();
  const row = await list.boundingBox();
  expect(current!.x).toBeGreaterThanOrEqual(row!.x);
  expect(current!.x + current!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
  await done(page);
});

test("held sideways at a tablet's width, a long page goes back to the top from its title in the bar, and from the current section", async ({ browser, baseURL }) => {
  // Held sideways the frame is the phone's whatever the width: one compact bar with the destinations
  // in it, and in a window this short the section tabs do not pin, so the bar leads back up a long
  // page (a Pixel 7 held sideways is 863 × 360; Leaderboards is about five and a half screens long there). Its
  // address names a season, which the page keeps.
  for (const viewport of [{ width: 863, height: 360 }, { width: 852, height: 393 }]) {
    const where = `${viewport.width} × ${viewport.height}`;
    const page = await phone(browser, baseURL!, { ...IPHONE_LANDSCAPE, viewport });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/leaderboards?season=16");
    await expect(page.getByTestId("records")).toBeVisible();
    // The page's title in the top bar, a button named after the heading, "…: back to top".
    const title = page.getByTestId("mobile-topbar").getByRole("button", { name: /: back to top$/ });
    await expect(title).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${where}: scrolled down` }).toBeGreaterThan(600);
    // The bar may hide while scrolling down; scrolling up a little brings it back with the title.
    await page.mouse.wheel(0, -80);
    await expect(title, `${where}: the page's title in the bar`).toBeVisible();
    // Held sideways the brand is its mark alone, and the title takes the room the destinations leave:
    // it starts just after them. Before (#301), beside the brand's name.
    const brand = page.getByTestId("mobile-brand");
    const [brandBox, markBox, titleBox, navBox] = await Promise.all([brand.boundingBox(), brand.locator(":scope > *").first().boundingBox(), title.boundingBox(), page.getByTestId("topbar-tabs").boundingBox()]);
    expect(brandBox!.width, `${where}: the brand is as wide as its mark`).toBeLessThanOrEqual(markBox!.width + 6.5);
    expect(titleBox!.x - (navBox!.x + navBox!.width), `${where}: the title starts beside the destinations`).toBeLessThanOrEqual(16);
    expect(titleBox!.x - (navBox!.x + navBox!.width), `${where}: never under them`).toBeGreaterThanOrEqual(0);
    await title.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${where}: back at the top` }).toBe(0);
    // The current section, in the row under the bar, goes back to the top too, and keeps the page's view.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.mouse.wheel(0, -80);
    const current = page.getByTestId("team-chrome-tab-leaderboards");
    await expect(current).toHaveAttribute("aria-current", "page");
    await current.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${where}: back at the top from the current destination` }).toBe(0);
    await expect(page).toHaveURL(/[?&]season=16/);
    await done(page);
  }
});

test("with larger text the compact bar held sideways still fits the phone: the whole names, then the short ones, then the current one's alone, then the icons, each still named, and the page never wider than the phone", async ({ browser, baseURL }) => {
  // Held sideways the destinations ride in the top bar (no bottom bar). Its row is the container its
  // names give way by (SIDEWAYS_FIT in mobile-nav.tsx), in rem of its width less its gutters, so the
  // reader's text size counts: the whole names from 33.25rem, the short ones ("Profile", "Intel") from
  // 29rem, then the current one's alone from 22.25rem, then the icons alone; past that the row
  // scrolls inside the bar. The cases fall on both sides of each step: 852px at 100% and 150% and an
  // SE at 100% (51, 34.5 and 34.5rem: the whole names), 734px at 135% and 150% (33.0 and 29.6rem: the
  // short ones), an SE at 150% and 852px at 200% (22.7 and 25.6rem: the current one's), and 734px and
  // an SE at 200% (21.9 and 16.8rem: the icons).
  const cases = [
    { viewport: { width: 852, height: 393 }, root: 100 },
    { viewport: { width: 568, height: 320 }, root: 100 },
    { viewport: { width: 852, height: 393 }, root: 150 },
    { viewport: { width: 734, height: 343 }, root: 135 },
    { viewport: { width: 734, height: 343 }, root: 150 },
    { viewport: { width: 568, height: 320 }, root: 150 },
    { viewport: { width: 852, height: 393 }, root: 200 },
    { viewport: { width: 734, height: 343 }, root: 200 },
    { viewport: { width: 568, height: 320 }, root: 200 },
  ];
  const STEPS = { full: 33.25, short: 29, current: 22.25 } as const;
  const page = await phone(browser, baseURL!, IPHONE_LANDSCAPE);
  const nav = page.getByTestId("topbar-tabs");
  const seen = new Set<string>();
  for (const { viewport, root } of cases) {
    const where = `${viewport.width} × ${viewport.height} at ${root}% text`;
    await page.setViewportSize(viewport);
    await page.goto("/matches");
    await page.evaluate((r) => {
      document.documentElement.style.fontSize = `${r}%`;
    }, root);
    await page.evaluate(() => document.fonts.ready);
    const links = nav.getByRole("link");
    for (const [i, name] of ["My Profile", "Team", "Matchup Intel", "Resources"].entries()) await expect(links.nth(i), where).toHaveAccessibleName(name);
    await expect(async () => {
      const m = await page.evaluate(() => {
        const row = document.querySelector("[data-testid=mobile-topbar]")!.firstElementChild as HTMLElement;
        const cs = getComputedStyle(row);
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const wide = (el: Element | null) => !!el && el.getBoundingClientRect().width > 1;
        return {
          width: innerWidth,
          page: document.documentElement.scrollWidth - innerWidth,
          row: row.scrollWidth - row.clientWidth,
          content: (row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / rem,
          tabs: [...document.querySelectorAll<HTMLElement>("[data-testid=topbar-tabs] a")].map((a) => {
            const label = a.querySelector<HTMLElement>("[data-name=label]")!;
            const rest = a.querySelector("[data-name=rest]");
            const box = a.getBoundingClientRect();
            return { current: a.getAttribute("aria-current") === "page", shown: wide(label), restShown: rest ? wide(rest) : null, whole: label.scrollWidth <= label.clientWidth + 1, height: box.height, width: box.width };
          }),
        };
      });
      expect(m.width, `${where}: the page as wide as the phone`).toBe(viewport.width);
      expect(m.page, `${where}: nothing wider than the phone`).toBeLessThanOrEqual(1);
      expect(m.row, `${where}: the bar's row fits`).toBeLessThanOrEqual(1);
      expect(m.tabs.filter((t) => t.current), `${where}: one current destination`).toHaveLength(1);
      const step = m.content >= STEPS.full ? "full" : m.content >= STEPS.short ? "short" : m.content >= STEPS.current ? "current" : "icons";
      seen.add(step);
      for (const t of m.tabs) {
        const named = step === "full" || step === "short" || (step === "current" && t.current);
        expect(t.shown, `${where}: ${t.current ? "the current" : "another"} name, the bar's row ${m.content.toFixed(1)}rem (${step})`).toBe(named);
        if (t.shown && t.restShown !== null) expect(t.restShown, `${where}: the whole name or the short one`).toBe(step === "full");
        if (t.shown) expect(t.whole, `${where}: a name shown whole`).toBe(true);
        expect(Math.min(t.height, t.width), `${where}: a 44px target`).toBeGreaterThanOrEqual(43.5);
      }
    }).toPass({ timeout: 15_000 });
  }
  // The cases cover each of the four steps.
  expect([...seen].sort()).toEqual(["current", "full", "icons", "short"]);
  await done(page);
});

test("held sideways with the browser's text at twice its size, the current destination is kept in view in the bar's row, loaded sideways or turned to", async ({ browser, baseURL }) => {
  // At 200% an SE's row has room for the four destinations' icons alone (SIDEWAYS_FIT), and the row
  // keeps the current one in view whether or not it has to scroll. The browser's own text size, set
  // before the page's code runs (as a reader sets it): the row lays itself out at that size from the start.
  const inView = (page: Page) =>
    page.evaluate(() => {
      const list = document.querySelector<HTMLElement>("[data-testid=topbar-tabs] ul")!;
      const box = list.getBoundingClientRect();
      const at = list.querySelector("[aria-current=page]")!.getBoundingClientRect();
      return { inside: at.width > 0 && at.left >= box.left - 0.5 && at.right <= box.right + 0.5 };
    });
  for (const turned of [false, true]) {
    const where = turned ? "turned to sideways" : "loaded sideways";
    const page = await phone(browser, baseURL!, turned ? { ...SE, viewport: { width: 320, height: 568 } } : SE_LANDSCAPE);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
    await page.goto("/overview");
    await expect(page.getByTestId("mobile-topbar")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Upright the compact bar's row is not shown (the tab bar is); a turn shows it, at its width then.
    if (turned) {
      await expect(page.getByTestId("phone-tabbar")).toBeVisible();
      await page.setViewportSize({ width: 568, height: 320 });
    }
    await expect(page.getByTestId("topbar-tabs").locator("[aria-current=page]"), where).toHaveAccessibleName("My Profile");
    await expect.poll(() => inView(page), { message: `${where}: the current destination in view` }).toEqual({ inside: true });
    // Only the row scrolled, never the page.
    expect(await page.evaluate(() => [scrollX, document.documentElement.scrollWidth - innerWidth]), where).toEqual([0, 0]);
    await done(page);
  }
});

test("held sideways in Admin Mode, the compact bar holds its four destinations and says the mode beside the team's mark", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE, "admin");
  await page.goto("/admin/people");
  const nav = page.getByTestId("topbar-tabs");
  for (const [i, name] of ["Dashboard", "Users & Permissions", "Platform Settings", "System"].entries()) await expect(nav.getByRole("link").nth(i)).toHaveAccessibleName(name);
  await expect(nav.locator("[aria-current=page]")).toHaveAccessibleName("Users & Permissions");
  // Users & Permissions' pages ride under the bar as its second row.
  await expect(page.getByTestId("admin-users-chrome-tabs").getByRole("link")).toHaveText(["Accounts", "Access levels", "Personal data"]);
  await expect(page.getByTestId("phone-tabbar")).toBeHidden();
  // "Admin mode" beside the mark, in words, and in the link's name (the team's, then the mode).
  const brand = page.getByTestId("mobile-brand");
  await expect(brand).toHaveAccessibleName(/, Admin mode$/);
  await expect(page.getByTestId("mobile-brand-mode").getByText("Admin mode", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // At a larger text size the words give way to the destinations, and the mode is still read out.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "150%";
  });
  await expect.poll(() => page.getByTestId("mobile-brand-mode").getByText("Admin mode", { exact: true }).evaluate((el) => el.getBoundingClientRect().width), { message: "the words left to screen readers" }).toBeLessThanOrEqual(1);
  await expect(brand).toHaveAccessibleName(/, Admin mode$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // The account screen holds the account's own items only: every admin page is under a destination.
  await page.getByTestId("account-sheet-button").click();
  const screen = page.getByTestId("account-sheet");
  await expect(screen.getByRole("navigation", { name: "Your account" }).getByRole("link")).toHaveText(["Settings"]);
  await expect(screen.getByRole("link", { name: "Data & Integrations" })).toHaveCount(0);
  await expect(screen.getByRole("link", { name: "Audit Logs" })).toHaveCount(0);
  await done(page);
});

test("the (i) marks are 24px targets, 40px to a finger, without changing the line they sit in", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href"))!, "http://x").pathname;
  await page.goto(profile);
  const tip = page.getByTestId("info-tip").first();
  await expect(tip).toBeVisible();
  const b = (await tip.boundingBox())!;
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(24);
  // The mark itself is still 16px.
  expect(await tip.locator("span").evaluate((s) => s.getBoundingClientRect().width)).toBe(16);
  // A tap 18px from its centre still lands on it.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid=info-tip]") !== null, { x: b.x + b.width / 2 + 18, y: b.y + b.height / 2 });
  expect(hit).toBe(true);
  await done(page);
});

test("Branding's save bar is pinned only while there is something to save, and never floats mid-screen when held sideways", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE, "admin");
  await page.goto("/admin/branding");
  const bar = page.getByTestId("branding-actions");
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
  await page.getByLabel("App name").fill("Team Hub Landscape");
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  // Held sideways there is no bottom bar: near the bottom edge, never 72px up as over the upright
  // bar, and the same once the top bar has slid away while reading.
  await expect(page.getByTestId("phone-tabbar")).toBeHidden();
  const box = await rect(page, "[data-testid=branding-actions]");
  expect(box.vh - box.bottom).toBeLessThan(24);
  await page.mouse.wheel(0, 400);
  await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", "true");
  await expect.poll(async () => (await rect(page, "[data-testid=branding-actions]")).vh - (await rect(page, "[data-testid=branding-actions]")).bottom).toBeLessThan(24);
  await page.getByTestId("branding-cancel").click();
  await done(page);
});

test("upright on a small phone, the player window scrolls as one, so its list is not a strip under the header", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE);
  await page.goto("/team");
  const open = page.getByTestId("open-player-detail").first();
  const win = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // Its header would fill most of the screen, so the whole window scrolls instead of the list alone.
  await expect(win).toHaveAttribute("data-flow", "true");
  const box = await rect(page, "dialog[open]");
  expect(box.height).toBeGreaterThanOrEqual(box.vh - 1);
  const scrolled = await win.evaluate((d) => {
    d.scrollTop = d.scrollHeight;
    return d.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  // Scrolled down, the header has made way for the list, and the controls are still in reach.
  const hero = (await win.getByTestId("player-detail-hero").boundingBox())!;
  expect(hero.y + hero.height).toBeLessThan(box.vh * 0.25);
  const close = win.getByRole("button", { name: "Close" });
  const c = (await close.boundingBox())!;
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(win).toBeHidden();
  await done(page);
});

test("turning a small phone with the player window open keeps it open and whole-screen, scrolling as one both ways", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE);
  await page.goto("/team");
  const open = page.getByTestId("open-player-detail").first();
  const win = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const url = page.url();
  for (const size of [{ width: 568, height: 320 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await expect(win).toBeVisible();
    expect(page.url()).toBe(url);
    const box = await rect(page, "dialog[open]");
    expect(box.width).toBeGreaterThanOrEqual(size.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(size.height - 1);
    // Upright it flows by measurement, sideways as every short window does: either way the whole
    // window scrolls and the close button stays on screen.
    expect(await win.evaluate((d) => getComputedStyle(d).overflowY)).toBe("auto");
    const c = (await win.getByRole("button", { name: "Close" }).boundingBox())!;
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.y + c.height).toBeLessThanOrEqual(size.height);
  }
  await expect(win).toHaveAttribute("data-flow", "true");
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await done(page);
});

test("a phone held sideways opens a game as the match window, never under its card, and Back closes it", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE_LANDSCAPE);
  await page.goto("/team");
  await page.goto(`/players/${await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const win = page.getByTestId("match-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await page.getByTestId("match-card").first().tap({ position: { x: 24, y: 16 }, timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("match-expanded")).toHaveCount(0);
  await expect(win.getByTestId("match-detail-nav")).toBeVisible();
  await page.goBack();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await done(page);
});

test("a window whose header leaves room keeps its own scrolling body on a phone held upright", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  // A link to a game that is not on the page shown opens it in the match window (lists open their
  // games under their cards).
  const win = await openMatchWindow(page);
  await expect(page.getByTestId("post-game-figures")).toBeVisible();
  await expect(win).not.toHaveAttribute("data-flow", /.*/);
  // The header stays; the body below it scrolls.
  expect(await page.getByTestId("match-detail-body").evaluate((b) => b.scrollHeight > b.clientHeight && getComputedStyle(b).overflowY === "auto")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await done(page);
});

test("on the preview pages the badge never covers the team name, either way round", async ({ browser, baseURL }) => {
  for (const device of [SE, SE_LANDSCAPE]) {
    const page = await phone(browser, baseURL!, device, "admin");
    for (const path of ["/preview/login", "/preview/setup"]) {
      await page.goto(path);
      const block = page.getByTestId("brand-frame-block");
      await expect(block).toBeVisible();
      const badge = (await page.getByTestId("preview-badge").boundingBox())!;
      const top = (await block.boundingBox())!;
      expect(badge.y + badge.height, path).toBeLessThanOrEqual(top.y);
    }
    await done(page);
  }
});
