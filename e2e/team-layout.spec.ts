import { expect, test, type CDPSession, type Page } from "./test";

/*
  Team Overview layout: the header shares the cards' width and centre on wider screens, cards side
  by side stay level whatever their names, and on phones the five cards are one sideways track
  (real touch swipes, snap points, role tabs and arrows) that never makes the page itself scroll
  sideways.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 500;

/** A finger drag on the touchscreen (real touch events, so the browser scrolls natively). */
async function swipe(page: Page, cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("the header is centred over the cards and sits close to them", async ({ page }) => {
  test.skip(isPhone(page), "the phone layout has its own test");
  await page.goto("/team");
  await expect(page.getByTestId("team-header")).toBeVisible();
  await expect(page.getByTestId("lineup-overview")).toBeVisible();
  const header = (await page.getByTestId("team-header").boundingBox())!;
  const cards = (await page.getByTestId("lineup-overview").boundingBox())!;
  expect(Math.abs(header.x + header.width / 2 - (cards.x + cards.width / 2))).toBeLessThanOrEqual(2);
  // The header block is the cards' width (never the whole window) and sits right above them.
  expect(header.width).toBeLessThanOrEqual(cards.width + 1);
  expect(cards.y - (header.y + header.height)).toBeLessThanOrEqual(24);
  await expect(page.getByTestId("edit-lineup")).toBeVisible();
  await expect(page.getByTestId("lineup-pager")).toBeHidden();
});

test("a name that takes two lines keeps the cards' avatars, names and rank lines level", async ({ page }) => {
  test.skip(isPhone(page), "phones show one card at a time");
  await page.goto("/team");
  const cards = page.locator("[data-testid^=lineup-row-]");
  await expect(cards).toHaveCount(5);
  // Only once hydrated: a name changed in the server's HTML before then is a hydration mismatch, and
  // React draws the cards again (a slow runner hit this).
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  // A name long enough to wrap, as a real one can (a card shows two lines at most).
  const name = cards.nth(1).getByTestId("card-name");
  await name.evaluate((el) => (el.textContent = "Extraordinarily Longnamed Jungler"));
  expect(await name.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))).toBe(2);
  const parts = await cards.evaluateAll((els) =>
    els.map((card) => {
      const top = (selector: string) => Math.round(card.querySelector(selector)!.getBoundingClientRect().top);
      return { row: Math.round(card.getBoundingClientRect().top), avatar: top("[data-avatar-frame]"), name: top("[data-testid=card-name]"), rank: top("[data-testid=card-fit]") };
    }),
  );
  // Cards side by side (the same row) keep each part at one height.
  const rows = [...new Set(parts.map((p) => p.row))];
  expect(rows.some((row) => parts.filter((p) => p.row === row).length > 1)).toBe(true);
  for (const row of rows) {
    const inRow = parts.filter((p) => p.row === row);
    for (const part of ["avatar", "name", "rank"] as const) expect(Math.max(...inRow.map((p) => p[part])) - Math.min(...inRow.map((p) => p[part])), `${part}s level`).toBeLessThanOrEqual(1);
  }
});

test("phones swipe sideways through the five cards, one at a time", async ({ page, context }) => {
  test.skip(!isPhone(page), "phones only");
  await page.goto("/team");
  const track = page.getByTestId("lineup-overview");
  await expect(track).toBeVisible();
  const cells = page.getByTestId("lineup-cell");
  await expect(cells).toHaveCount(5);
  // Only the track scrolls sideways; the page stays within the window.
  expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth + 100)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  // Cards keep one height and a readable width.
  const sizes = await cells.evaluateAll((els) => els.map((e) => ({ w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })));
  expect(new Set(sizes.map((s) => s.h)).size).toBe(1);
  expect(Math.min(...sizes.map((s) => s.w))).toBeGreaterThanOrEqual(280);
  const tabs = page.getByTestId("lineup-dot");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  // The line under the team's name wraps between whole items, never leaving a separator at a line's end.
  const subtitle = page.getByTestId("team-subtitle");
  await expect(subtitle.locator(":scope > span", { hasText: /^·$/ })).toHaveCount(0);
  expect((await subtitle.locator(":scope > span").first().boundingBox())!.height).toBeLessThanOrEqual(20);

  // A real touch swipe to the left lands on the next card, centred (snap).
  const cdp = await context.newCDPSession(page);
  // The track in view (it sits under the team's header and the Team tabs), then swipe across it.
  await track.evaluate((el) => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 120)));
  const box = (await track.boundingBox())!;
  const y = Math.round(box.y + 160);
  await swipe(page, cdp, { x: Math.round(box.width * 0.85), y }, { x: Math.round(box.width * 0.2), y });
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => cells.nth(1).evaluate((c) => { const t = c.parentElement!.getBoundingClientRect(); const r = c.getBoundingClientRect(); return Math.round(Math.abs(r.left + r.width / 2 - (t.left + t.width / 2))); }))
    .toBeLessThanOrEqual(3);
  // An equal glimpse of the cards either side, so the track reads as a carousel.
  const glimpse = await cells.nth(1).evaluate((c) => {
    const t = c.parentElement!.getBoundingClientRect();
    return { left: Math.round(c.previousElementSibling!.getBoundingClientRect().right - t.left), right: Math.round(t.right - c.nextElementSibling!.getBoundingClientRect().left) };
  });
  expect(glimpse.left).toBeGreaterThan(4);
  expect(Math.abs(glimpse.left - glimpse.right)).toBeLessThanOrEqual(3);
  // A vertical swipe still scrolls the page, not the track.
  const before = await track.evaluate((el) => el.scrollLeft);
  await swipe(page, cdp, { x: Math.round(box.width / 2), y: 600 }, { x: Math.round(box.width / 2), y: 300 });
  // Compact cards make the page short: it scrolls as far as it can (up to 50px), the track not at all.
  const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(room).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(Math.min(50, room) - 1);
  expect(await track.evaluate((el) => el.scrollLeft)).toBe(before);
  await page.evaluate(() => window.scrollTo(0, 0));

  // The role bar moves too (a tap away from any player), names each role and says where you are.
  await expect(tabs).toHaveText(["Top", "Jungle", "Mid", "Bottom", "Support"]);
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(4).click();
  await expect(tabs.nth(4)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(3).click();
  await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "true");
  for (const tab of await tabs.all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Every card is labelled with its role, player and position.
  await expect(cells.first()).toHaveAttribute("aria-label", /^Top: .+ \(1 of 5\)$/);
});
