import { expect, test, type CDPSession, type Page } from "./test";
import { expectHeaderAligned, headerLayout } from "./team-header";

/*
  Team Overview layout. The header and the cards share one column (the lineup's, sized by the
  content area beside the sidebar): the team's identity (logo, name, its line and the lineup's
  state) is centred on the cards, with Edit lineup at their right edge, whichever state the sidebar
  is in and right after it moves, without a reload. On phones the five cards are one sideways track
  (real touch swipes, snap points, role tabs and arrows) that never makes the page itself scroll
  sideways, under the header's two lines centred on the card in view. Entering Edit lineup moves
  nothing in the header sideways.
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

test("the team's identity is centred on the cards, with Edit lineup at their right edge", async ({ page }) => {
  test.skip(isPhone(page), "the phone layout has its own test");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("edit-lineup")).toBeVisible();
  expectHeaderAligned(await headerLayout(page), `${page.viewportSize()!.width}px`);
  await expect(page.getByTestId("lineup-pager")).toBeHidden();
});

test("collapsing or opening the sidebar re-centres the header with the cards at once, without a reload", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the sidebar is desktop-only");
  const aside = page.locator("aside");
  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    for (const start of ["expanded", "collapsed"] as const) {
      const label = `${size.width}px, sidebar ${start}`;
      await context.addCookies([{ name: "uniiverse_sidebar", value: start, url: baseURL! }]);
      await page.goto("/team");
      await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
      await expect(aside).toHaveAttribute("data-collapsed", String(start === "collapsed"));
      const before = await headerLayout(page);
      expectHeaderAligned(before, label);
      // Moved in place: the same page (nothing reloads), a different content area. The sidebar's
      // room changes at once (only its drawing slides), so the very next layout is the one to check.
      await page.evaluate(() => Object.assign(window, { samePage: true }));
      await aside.getByTestId("sidebar-toggle").click(start === "collapsed" ? { position: { x: 24, y: 16 } } : undefined);
      // Away from the collapsed rail, which opens over the page while hovered.
      await page.mouse.move(size.width - 8, size.height - 8);
      await expect(aside).toHaveAttribute("data-collapsed", String(start !== "collapsed"));
      const after = await headerLayout(page);
      expect(after.cards.left, `${label}: the cards moved with the content area`).not.toBeCloseTo(before.cards.left, 0);
      expectHeaderAligned(after, `${label}, then toggled`);
      expect(await page.evaluate(() => (window as { samePage?: boolean }).samePage)).toBe(true);
    }
  }
});

test("phones: the header's two lines are centred on the card in view, the first and the last card too", async ({ page }) => {
  test.skip(!isPhone(page), "phones only");
  // A phone, and the widest window that still has the sideways track (its cards at their widest).
  for (const width of [375, 600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    const tabs = page.getByTestId("lineup-dot");
    for (const index of [0, 4]) {
      const label = `${width}px, card ${index + 1}`;
      await tabs.nth(index).click();
      await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
      // The track scrolls smoothly: the card comes to rest, whole, under the logo and the name.
      await expect
        .poll(async () => {
          const m = await headerLayout(page);
          return Math.abs(m.firstLine.centre - m.cards.centre) <= 1;
        }, { message: `${label}: comes to rest under the logo and the name` })
        .toBe(true);
      const m = await headerLayout(page);
      expect(Math.abs(m.foot.centre - m.cards.centre), `${label}: the lineup's state and Edit lineup`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.statusMiddle! - m.edit!.middle), `${label}: the state and Edit lineup share one line`).toBeLessThanOrEqual(1);
      expect(m.sideways, `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
    }
  }
});

test("entering and leaving Edit lineup moves nothing in the header sideways: the button stays under the pointer", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  // Left edges and widths, and the header's height (the cards' edit controls may move it all down).
  const places = () =>
    page.getByTestId("team-header").evaluate((header) => {
      const at = (selector: string) => {
        const r = header.querySelector(selector)?.getBoundingClientRect();
        return r ? [Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10] : "gone";
      };
      return { logo: at('[data-testid="brand-mark-text"], img'), name: at('[data-testid="team-name"]'), status: at('[data-testid="lineup-status"]'), edit: at('[data-testid="edit-lineup"]'), height: Math.round(header.getBoundingClientRect().height) };
    });
  const before = await places();
  const button = page.getByTestId("edit-lineup");
  await expect(button).toHaveAccessibleName("Edit lineup");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveAccessibleName("Done");
  await expect(page.getByTestId("team-subtitle")).toHaveText("Editing the lineup", { useInnerText: true });
  await expect(page.getByTestId("lineup-status")).toBeHidden();
  expect(await places(), "editing").toEqual(before);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button).toHaveAccessibleName("Edit lineup");
  await expect(page.getByTestId("team-subtitle")).toHaveText(/^Main lineup/, { useInnerText: true });
  await expect(page.getByTestId("lineup-status")).toBeVisible();
  expect(await places(), "back").toEqual(before);
});

// Cards side by side keeping their pictures, names and labels level whatever the names and
// taglines is checked in card-layout.spec.ts, with real long names and taglines at every size
// where cards stand side by side (the cards size those rows from the lineup's own players).

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
