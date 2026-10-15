import { expect, test, type CDPSession, type Page } from "@playwright/test";

/*
  Team Overview layout: the header shares the cards' width and centre on wider screens, and on
  phones the five cards are one sideways track (real touch swipes, snap points, role tabs and
  arrows) that never makes the page itself scroll sideways.
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

  // A real touch swipe to the left lands on the next card, centred (snap).
  const cdp = await context.newCDPSession(page);
  const box = (await track.boundingBox())!;
  const y = Math.round(box.y + 160);
  await swipe(page, cdp, { x: Math.round(box.width * 0.85), y }, { x: Math.round(box.width * 0.2), y });
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => cells.nth(1).evaluate((c) => { const t = c.parentElement!.getBoundingClientRect(); const r = c.getBoundingClientRect(); return Math.round(Math.abs(r.left + r.width / 2 - (t.left + t.width / 2))); }))
    .toBeLessThanOrEqual(3);
  // A vertical swipe still scrolls the page, not the track.
  const before = await track.evaluate((el) => el.scrollLeft);
  await swipe(page, cdp, { x: Math.round(box.width / 2), y: 600 }, { x: Math.round(box.width / 2), y: 300 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
  expect(await track.evaluate((el) => el.scrollLeft)).toBe(before);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Arrows and role tabs move too, and say where you are.
  await page.getByTestId("lineup-next").click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(4).click();
  await expect(tabs.nth(4)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("lineup-next")).toBeDisabled();
  await page.getByTestId("lineup-prev").click();
  await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "true");
  // Every card is labelled with its role, player and position.
  await expect(cells.first()).toHaveAttribute("aria-label", /^Top: .+ \(1 of 5\)$/);
});
