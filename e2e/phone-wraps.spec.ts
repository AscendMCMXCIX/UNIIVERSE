import { expect, test, type Locator, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  On a 320px phone, the narrowest docs/MOBILE.md supports, what a row is about wraps rather than
  being cut: a member's name beside their multikill in Team Matches, a resource's title, and the
  account the champion window's figures come from; at a larger text size, a profile's header on 320
  and 375px phones. Demo data, in-memory only.
*/

test.beforeEach(async ({ context, baseURL, page }, info) => {
  test.skip(info.project.name !== "phone", "a 320px phone");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.setViewportSize({ width: 320, height: 568 });
});

/** Each element's text fits its own box: nothing is cut off or runs out past it. */
async function expectWhole(items: Locator, what: string) {
  await expect(items.first()).toBeVisible();
  const cut = await items.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.trim() ?? ""));
  expect(cut, `${what} cut at 320px`).toEqual([]);
}

/** Opens a champion's window, clicking again until the page is interactive (a click before hydration does nothing). */
async function openChampion(page: Page, button: Locator) {
  const win = page.getByTestId("champion-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await button.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("Team Matches: a member's name beside their multikill wraps rather than being cut", async ({ page }) => {
  await page.goto("/matches");
  const marked = page.getByTestId("together-member").filter({ has: page.locator("[data-testid='together-multikill']:visible") });
  await expectWhole(marked.locator("a[href^='/players/']"), "a member's name");
});

test("Resources: a title wraps rather than being cut", async ({ page }) => {
  // The Library's rows ask each site for its icon; a test asks none (resources.spec.ts).
  await page.route(/\/favicon\.ico$/, (route) => route.abort());
  await page.goto("/resources");
  await expectWhole(page.getByTestId("resource-title"), "a resource's title");
  await expect(page.getByTestId("resource-title").filter({ hasText: "League of Legends Wiki" })).toBeVisible();
});

test("the champion window: the account its figures come from wraps rather than being cut", async ({ page }) => {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  await openChampion(page, page.getByTestId("top-champion").first().getByTestId("open-champion"));
  await expectWhole(page.getByTestId("champion-detail-scope"), "the window's scope");
});

test("at 200% text on a 320px phone, Settings for a member with a player profile (its Social links too) is no wider than the phone, and no button spills its label", async ({ browser, page }) => {
  // A member with a profile sees Social links, which the local owner (no profile) does not.
  const member = await memberContext(browser, page, { width: 320, height: 568 }, { base: "Wide" });
  try {
    await member.page.goto("/settings");
    await expect(member.page.getByTestId("social-links-save")).toBeVisible();
    await member.page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await member.page.evaluate(() => document.fonts.ready);
    await expect.poll(() => member.page.evaluate(() => document.documentElement.scrollWidth), { message: "the page as wide as the phone" }).toBeLessThanOrEqual(320);
    const spilled = await member.page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button")].filter((b) => b.getBoundingClientRect().width > 0 && b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent?.trim() ?? ""));
    expect(spilled, "buttons whose label spills out of them").toEqual([]);
  } finally {
    await member.context.close();
  }
});

test("at 200% text on a 320px phone, Team Overview's header (Edit lineup included) is no wider than the phone", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-header")).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("[data-testid=team-header]")!.getBoundingClientRect().right)), { message: "the header's right edge" }).toBeLessThanOrEqual(320);
  const edit = page.getByTestId("edit-lineup");
  if (await edit.count()) {
    const box = (await edit.boundingBox())!;
    expect(box.x + box.width, "Edit lineup within the phone").toBeLessThanOrEqual(320.5);
  }
});

/**
 * A profile's header as drawn: text cut by a box that clips it (the header clips at its edge; an
 * ellipsis made on purpose is not a cut) and words of four letters or more broken across lines.
 * Labels and sizes only: the demo roster.
 */
const HEADER_FACTS = () => {
  const header = document.querySelector<HTMLElement>("[data-testid=profile-header]")!;
  const srOnly = (el: Element) => {
    for (let e: Element | null = el; e && e !== header; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
    }
    return false;
  };
  const cut: string[] = [];
  const broken: string[] = [];
  const walk = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? "";
    const parent = n.parentElement;
    if (!text.trim() || !parent || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((b) => b.width > 0.5 && b.height > 0.5);
    if (!rects.length) continue;
    const [left, right] = [Math.min(...rects.map((b) => b.left)), Math.max(...rects.map((b) => b.right))];
    for (let e: HTMLElement | null = parent; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (!/hidden|clip/.test(cs.overflowX)) continue;
      const box = e.getBoundingClientRect();
      const past = Math.max(right - (box.right - parseFloat(cs.borderRightWidth)), box.left + parseFloat(cs.borderLeftWidth) - left);
      if (past > 1 && cs.textOverflow !== "ellipsis" && getComputedStyle(parent).textOverflow !== "ellipsis") cut.push(`"${text.trim().slice(0, 24)}" by ${Math.round(past)}px`);
      break;
    }
    for (const m of text.matchAll(/[A-Za-z\u00C0-\u00FF']{4,}/g)) {
      const word = document.createRange();
      word.setStart(n, m.index!);
      word.setEnd(n, m.index! + m[0].length);
      const lines = new Set([...word.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top))).size;
      if (lines > 1) broken.push(`"${m[0]}" over ${lines} lines`);
    }
  }
  const name = header.querySelector("[data-testid=card-name]")!;
  return { cut, broken, name: name.textContent ?? "" };
};

test("at 150%, 175% and 200% text on 320px and 375px phones, a profile's header cuts nothing and keeps each word of the name whole, on the Overview and in the other sections' band", async ({ page }) => {
  // The lineup's five: the longest name word ("Support"), off roles and every lineup status. Before,
  // at 375px and 175% the rank ran 156px past the header's edge, the lineup status 12px, and "Demo"
  // broke as "De / mo" beside the picture and Customise (LARGE_TEXT in profile-header.tsx).
  await page.goto("/team");
  const profiles = await Promise.all((["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map(async (role) => `/players/${await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id")}`));
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [i, profile] of profiles.entries())
      for (const section of ["", "/champions"]) {
        await page.goto(`${profile}${section}`);
        await expect(page.getByTestId("profile-header")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (const root of [150, 175, 200]) {
          await page.evaluate((r) => {
            document.documentElement.style.fontSize = `${r}%`;
          }, root);
          const where = `the lineup's ${i + 1} of 5, ${section ? "the band" : "the Overview"}, ${width}px at ${root}%`;
          await expect(async () => {
            const facts = await page.evaluate(HEADER_FACTS);
            expect(facts.cut, `${where}: text cut`).toEqual([]);
            expect(facts.broken, `${where}: words broken (${facts.name})`).toEqual([]);
          }).toPass({ timeout: 5_000 });
        }
      }
  }
});

test("with the browser's own text at twice its size on a 320px phone, a profile's header cuts nothing and keeps each word of the name whole", async ({ browser, baseURL }) => {
  // The reader's own setting scales the rem of the media queries too (Chromium's default font size),
  // not only of the page: the header follows its own width either way.
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
  await page.goto("/team");
  const profile = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  for (const section of ["", "/champions"]) {
    await page.goto(`${profile}${section}`);
    await expect(page.getByTestId("profile-header")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const facts = await page.evaluate(HEADER_FACTS);
    expect(facts.cut, `${section ? "the band" : "the Overview"}: text cut`).toEqual([]);
    expect(facts.broken, `${section ? "the band" : "the Overview"}: words broken`).toEqual([]);
  }
  await context.close();
});
