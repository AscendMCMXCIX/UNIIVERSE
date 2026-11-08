import { expect, test, type CDPSession, type Page } from "./test";

/*
  Team Overview layout: the team's header is one row (its name, the lineup's line and Edit lineup
  side by side) that shares the cards' width and centre on wider screens; upright tablets show the
  lineup 3 + 2 and desktops five across, with the bench of substitutes under the cards (five
  across, each role's cell under its card); on phones the five cards are one sideways track (real
  touch swipes, snap points, role tabs with each player's picture) under a header without the
  logo the top bar already shows, its first card whole on the first screen, and the track never
  makes the page itself scroll sideways.
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
  // One row: the logo, the name over its one line, and Edit lineup side by side, no taller than the logo.
  const logo = (await page.getByTestId("team-header").locator("img, [data-testid=brand-mark-text]").first().boundingBox())!;
  const name = (await page.getByTestId("team-name").boundingBox())!;
  const edit = (await page.getByTestId("edit-lineup").boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(logo.height + 1);
  for (const part of [name, edit]) expect(part.y >= header.y - 1 && part.y + part.height <= header.y + header.height + 1).toBe(true);
  expect(edit.x).toBeGreaterThan(name.x + name.width);
  // The tab above already says Team Overview: the header does not repeat it on screen.
  await expect(page.getByTestId("team-header").getByText("Team Overview")).toHaveClass(/sr-only/);
});

test("upright tablets show the lineup 3 + 2 and desktops five across, with the substitutes under the cards", async ({ page }) => {
  test.skip(isPhone(page), "the phone layout has its own test");
  await page.goto("/team");
  const cells = page.getByTestId("lineup-cell");
  await expect(cells).toHaveCount(5);
  const boxes = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, top: Math.round(r.top), bottom: r.bottom, width: r.width })));
  const track = (await page.getByTestId("lineup-overview").boundingBox())!;
  const tablet = (page.viewportSize()?.width ?? 1440) < 1024;
  if (tablet) {
    // 3 + 2: three cards share the first row, the last two the second, centred under them.
    expect(new Set(boxes.slice(0, 3).map((b) => b.top)).size).toBe(1);
    expect(new Set(boxes.slice(3).map((b) => b.top)).size).toBe(1);
    expect(boxes[3]!.top).toBeGreaterThan(boxes[0]!.top);
    const pair = (boxes[3]!.x + boxes[4]!.x + boxes[4]!.width) / 2;
    expect(Math.abs(pair - (track.x + track.width / 2))).toBeLessThanOrEqual(2);
  } else {
    expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  }
  // The bench: under the cards, a substitute's entry for each role whose card turns to one.
  const bench = page.getByTestId("lineup-bench");
  await expect(bench).toBeVisible();
  expect((await bench.boundingBox())!.y).toBeGreaterThanOrEqual(Math.max(...boxes.map((b) => b.bottom)) - 1);
  for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]) {
    const turns = (await page.getByTestId(`lineup-sub-${role}`).count()) > 0;
    await expect(page.getByTestId(`bench-${role}`)).toHaveCount(turns ? 1 : 0);
    if (tablet) await expect(page.getByTestId(`bench-empty-${role}`)).toBeHidden();
  }
  if (!tablet) {
    // Five across: a cell under every card, the substitute's or a quiet "No substitute", in the cards' columns.
    for (const [i, role] of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].entries()) {
      const under = (await page.getByTestId(`bench-${role}`).or(page.getByTestId(`bench-empty-${role}`)).boundingBox())!;
      expect(Math.abs(under.x - boxes[i]!.x), `${role}: under its card`).toBeLessThanOrEqual(1);
      expect(Math.abs(under.width - boxes[i]!.width), `${role}: the card's width`).toBeLessThanOrEqual(1);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
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
  // The header is one row: the name and its line beside Edit lineup (a 44px target), and no logo:
  // the top bar right above shows the team's mark.
  const header = (await page.getByTestId("team-header").boundingBox())!;
  const edit = (await page.getByTestId("edit-lineup").boundingBox())!;
  const name = (await page.getByTestId("team-name").boundingBox())!;
  expect(edit.y).toBeLessThan(name.y + name.height);
  expect(edit.x).toBeGreaterThan(name.x + name.width - 1);
  expect(edit.height).toBeGreaterThanOrEqual(44);
  expect(header.height).toBeLessThanOrEqual(56);
  await expect(page.getByTestId("team-header").locator("img, [data-testid=brand-mark-text]")).toBeHidden();
  await expect(page.getByTestId("edit-lineup")).toHaveAccessibleName("Edit lineup");
  // The first card is whole on the first screen, above the tab bar (375 × 667).
  const tabBar = (await page.getByRole("navigation", { name: "Primary" }).boundingBox())!;
  const first = (await cells.first().boundingBox())!;
  expect(first.y + first.height, "the first card ends above the tab bar").toBeLessThanOrEqual(tabBar.y);
  // Each role's tab shows who plays it: their picture in its frame, the role's name under it.
  for (const tab of await tabs.all()) await expect(tab.locator("[data-avatar-frame]")).toHaveCount(1);

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
  await expect(page.getByTestId("lineup-dot-label")).toHaveText(["Top", "Jungle", "Mid", "Bottom", "Support"]);
  // Named by what it shows, the role first, then the player (read from hidden text, which Chromium
  // sets off with a space: "Top : Demo Top").
  await expect(tabs.first()).toHaveAccessibleName(/^Top ?: .+/);
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

// docs/PERFORMANCE.md, "Team Overview's first card": on a phone the first card's art is the page's
// largest element, so it is fetched at once and ahead of the rest, and the other cards' art waits
// for it (a lazy image that is not displayed is not fetched). Wider screens show all five cards
// and never wait. Data Dragon is held here until the test lets it answer.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("the first card's art loads first, and on phones the other cards' art waits for it", async ({ page }) => {
  let answer!: () => void;
  const held = new Promise<void>((resolve) => (answer = resolve));
  const requested: string[] = [];
  await page.route(/ddragon\.leagueoflegends\.com\/cdn\/img\/champion\/splash\//, async (route) => {
    requested.push(new URL(route.request().url()).pathname.split("/").pop()!);
    await held;
    await route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  // The pool portraits (small PNGs under the versioned path) answer at once; which ones are asked for is what matters.
  const portraits: string[] = [];
  await page.route(/ddragon\.leagueoflegends\.com\/cdn\/[^/]+\/img\/champion\/[^/]+\.png/, async (route) => {
    portraits.push(new URL(route.request().url()).pathname.split("/").pop()!);
    await route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  // The page's load event waits for the first art, which is held: wait for the page itself.
  await page.goto("/team", { waitUntil: "domcontentloaded" });
  const track = page.getByTestId("lineup-overview");
  await expect(track).toHaveAttribute("data-ready", "true");
  const cells = page.getByTestId("lineup-cell");
  const first = cells.nth(0).locator(".card-art-img");
  const second = cells.nth(1).locator(".card-art-img");
  await expect(first).toHaveAttribute("loading", "eager");
  await expect(first).toHaveAttribute("fetchpriority", "high");
  await expect(second).toHaveAttribute("loading", "lazy");
  expect(await second.getAttribute("fetchpriority")).toBeNull();
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  const firstArt = (await first.getAttribute("src"))!.split("/").pop()!;
  expect(requested[0]).toBe(firstArt);
  if (isPhone(page)) {
    // While the first art is on its way, the other cards' art is not shown, so it is not fetched.
    await expect(track).toHaveAttribute("data-art-wait", "true");
    await expect(second).toBeHidden();
    await page.waitForTimeout(500);
    expect(requested).toEqual([firstArt]);
    // Nor are the later cards' pool portraits (they would share the connection with the first art): only the first card's are asked for.
    await expect(cells.nth(1).locator("[data-card-pool] img").first()).toBeHidden();
    const firstPool = await cells.nth(0).locator("[data-card-pool] img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.split("/").pop()!));
    expect(firstPool.length).toBeGreaterThan(0);
    expect(portraits.filter((n) => !firstPool.includes(n)), "only the first card's portraits").toEqual([]);
  } else {
    // Several cards side by side: every card's art is shown and fetched together.
    await expect(second).toBeVisible();
    await expect.poll(() => requested.length).toBeGreaterThan(1);
  }
  answer();
  // Once the first art has arrived, nothing waits.
  await expect(track).not.toHaveAttribute("data-art-wait", "true");
  await expect(second).toBeVisible();
  await expect(cells.nth(1).locator("[data-card-pool] img").first()).toBeVisible();
});
