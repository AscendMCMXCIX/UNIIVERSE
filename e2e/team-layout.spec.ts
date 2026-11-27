import { expect, test, type CDPSession, type Page } from "./test";
import { memberContext } from "./member-account";
import { lineupAtRest, offCentre } from "./lineup";

/*
  Team Overview layout, as approved (before #275): the header shares the cards' width and centre on
  wider screens (the logo, the "Team Overview" eyebrow over the team's name, the lineup's state
  under it, Edit lineup at the row's end); upright tablets show the lineup 3 + 2 (never a card alone
  on a row), and from a 56rem lineup (a 1280px laptop with the sidebar open) five across, nothing
  under the cards (no bench: a substitute is on their starter's card); on a member's phone the
  header is one 44px line (the bar carries the team's mark and name), and the five cards are one
  sideways carousel (real touch swipes, snap points, one card across the width with five position
  dots under it, no row of the players over it since 23 Nov 2026) that never makes the page itself
  scroll sideways (S3a, 20 Nov 2026; the loop itself: e2e/team-carousel.spec.ts).
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 500;

/**
 * Edit lineup, in a window of the page's own: who starts in `role` (a name, or null to leave it
 * empty). Returns who started there before, to put back (later tests share this demo roster).
 */
async function setStarter(page: Page, role: string, name: string | null): Promise<string | null> {
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  const card = page.getByTestId(`lineup-row-${role}`);
  const before = await card.getAttribute("data-player-name");
  if (before === name) return before;
  await page.getByTestId("edit-lineup").click();
  await page.getByTestId(`lineup-change-${role}`).click();
  const sheet = page.getByTestId(`lineup-sheet-${role}`);
  if (name) await sheet.locator(`[data-testid=lineup-option][data-player-name="${name}"]`).click();
  else await sheet.getByTestId("clear-role").click();
  await sheet.getByTestId("lineup-sheet-save").click();
  await expect(sheet).toBeHidden();
  if (name) await expect(card).toHaveAttribute("data-player-name", name);
  else await expect(card).not.toHaveAttribute("data-player-id", /.+/);
  await page.getByTestId("edit-lineup").click();
  return before;
}

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
  await expect(page.getByTestId("lineup-indicator")).toBeHidden();
  const name = (await page.getByTestId("team-name").boundingBox())!;
  const edit = (await page.getByTestId("edit-lineup").boundingBox())!;
  for (const part of [name, edit]) expect(part.y >= header.y - 1 && part.y + part.height <= header.y + header.height + 1).toBe(true);
  expect(edit.x).toBeGreaterThan(name.x + name.width);
  // The team's identity from a tablet up: the "Team overview" eyebrow (sentence case since Release 19, D4) shown over the name, the name
  // large (30px on a tablet, 36px on a desktop), and the lineup's state under it.
  const eyebrow = (await page.getByTestId("team-header").getByText("Team overview", { exact: true }).boundingBox())!;
  expect(eyebrow.width, "the eyebrow is shown, not left to screen readers").toBeGreaterThan(40);
  expect(eyebrow.y + eyebrow.height, "the eyebrow over the name").toBeLessThanOrEqual(name.y + 1);
  const size = await page.getByTestId("team-name").evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
  expect(size, "the name's size").toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 1440) >= 1024 ? 36 : 30);
  expect((await page.getByTestId("lineup-status").boundingBox())!.y, "the lineup's state under the name").toBeGreaterThanOrEqual(name.y + name.height - 1);
});

test("upright tablets show the lineup 3 + 2 and desktops five across, with nothing under the cards", async ({ page }) => {
  test.skip(isPhone(page), "the phone layout has its own test");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-cell")).toHaveCount(5);
  // The cards and the track as one layout (lineupAtRest: the lineup streams in).
  const { cells: boxes, track, overflow } = await lineupAtRest(page);
  const tablet = (page.viewportSize()?.width ?? 1440) < 1024;
  if (tablet) {
    // 3 + 2: three cards in the first row, the last two under them, centred (no card alone on a row).
    expect(new Set(boxes.slice(0, 3).map((b) => b.top)).size, "the first three in one row").toBe(1);
    expect(new Set(boxes.slice(3).map((b) => b.top)).size, "the last two in one row").toBe(1);
    expect(boxes[3]!.top).toBeGreaterThan(boxes[0]!.top);
    const pair = (boxes[3]!.x + boxes[4]!.x + boxes[4]!.width) / 2;
    expect(Math.abs(pair - (track.x + track.width / 2))).toBeLessThanOrEqual(2);
  } else {
    expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  }
  // The cards end the lineup: no bench or row of substitutes under them (a substitute is on their
  // starter's card, turned to by its control, and managed in Edit lineup).
  await expect(page.getByTestId("lineup-bench")).toHaveCount(0);
  await expect(page.locator("[data-testid^=bench-]")).toHaveCount(0);
  const cardsEnd = Math.max(...boxes.map((b) => b.bottom));
  expect(Math.abs(track.y + track.height - cardsEnd), "the track ends with the cards").toBeLessThanOrEqual(1);
  // The stage (the cards and their floor) ends with the cards too: #275's bench stood inside it, after the track.
  const stage = (await page.getByTestId("lineup-stage").boundingBox())!;
  expect(Math.abs(stage.y + stage.height - cardsEnd), "the stage ends with the cards").toBeLessThanOrEqual(1);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a 1280 × 800 laptop with the sidebar open shows the five across on one screen, one row up to 1400; Edit mode has exactly one filled primary, Done", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "laptop widths");
  // The sidebar open, as it is by default: the lineup is 56rem or wider from 1280 (S3a; 3 + 2 at 1.28 screens before, UD.T1).
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  for (const width of [1280, 1365, 1400]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/team");
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("lineup-cell")).toHaveCount(5);
    const { cells: boxes, overflow } = await lineupAtRest(page);
    expect(new Set(boxes.map((b) => b.top)).size, `${width}: one row`).toBe(1);
    if (width === 1280) expect(overflow, "1280 × 800: one screen").toBeLessThanOrEqual(1);
  }
  await page.getByTestId("edit-lineup").click();
  // Change, Substitute and Make starter are outline buttons; Done is the one filled primary.
  const filled = await page.locator("main button").evaluateAll((buttons) => buttons.filter((b) => b.getBoundingClientRect().width > 0 && /\bbg-accent\b/.test(b.className) && !/\bbg-accent\//.test(b.className)).map((b) => b.getAttribute("data-testid")));
  expect(filled).toEqual(["edit-lineup"]);
  await page.getByTestId("edit-lineup").click();
});

// The season figures and Edit lineup's choices, as approved, on the cards five across: each card's
// kills / deaths / assists per game under its KDA from 14.5rem (whole there: the three figures stand
// closer from 14.5rem to 16.5rem, where the reference ended the line in "…"), and Change and
// Substitute side by side, their labels whole (under 14.25rem their icons step aside; the reference
// cut "Substitute").
test("five across, the K/D/A line shows whole from 14.5rem, and Edit lineup's two labels are whole side by side", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop widths");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    const cards = await page.locator("[data-testid^=lineup-row-]").evaluateAll((els) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return els.map((card) => {
        const line = card.querySelector<HTMLElement>("[data-testid=card-season] dl > div:nth-child(2) dd:last-child");
        const text = line?.querySelector<HTMLElement>(":scope > span:not([aria-hidden])");
        return { width: card.getBoundingClientRect().width / rem, shown: !!text && text.getBoundingClientRect().width > 1, whole: !!line && line.scrollWidth <= line.clientWidth };
      });
    });
    for (const card of cards) {
      if (card.width >= 14.5) expect(card, `${width}: the K/D/A line shown and whole`).toMatchObject({ shown: true, whole: true });
      else expect(card.shown, `${width}: no K/D/A line on a ${card.width.toFixed(2)}rem card`).toBe(false);
    }
    await page.getByTestId("edit-lineup").click();
    const choices = await page.locator("[data-testid^=lineup-actions-]").evaluateAll((els) =>
      els.map((row) => {
        const buttons = [...row.querySelectorAll<HTMLElement>("button")];
        return {
          side: buttons.length === 2 && Math.abs(buttons[0]!.getBoundingClientRect().top - buttons[1]!.getBoundingClientRect().top) < 1,
          whole: buttons.every((b) => [...b.querySelectorAll<HTMLElement>("span")].every((t) => t.scrollWidth <= t.clientWidth)),
          icons: buttons.map((b) => getComputedStyle(b.querySelector("svg")!).display !== "none"),
          card: row.closest("article")!.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize),
        };
      }),
    );
    expect(choices.length).toBeGreaterThan(0);
    for (const c of choices) {
      expect(c.side, `${width}: Change and Substitute side by side`).toBe(true);
      expect(c.whole, `${width}: both labels whole`).toBe(true);
      expect(c.icons, `${width}: their icons ${c.card < 14.25 ? "step aside" : "shown"} on a ${c.card.toFixed(2)}rem card`).toEqual(c.card < 14.25 ? [false, false] : [true, true]);
    }
    await page.getByTestId("edit-lineup").click();
  }
});

// Cards side by side keeping their pictures, names and labels level whatever the names and
// taglines is checked in card-layout.spec.ts, with real long names and taglines at every size
// where cards stand side by side (the cards size those rows from the lineup's own players).

test("phones swipe sideways through the five cards, one at a time, with no row of players over them", async ({ page, context }) => {
  test.skip(!isPhone(page), "phones only");
  await page.goto("/team");
  const track = page.getByTestId("lineup-overview");
  await expect(track).toBeVisible();
  const cells = page.getByTestId("lineup-cell");
  await expect(cells).toHaveCount(5);
  // Only the track scrolls sideways; the page stays within the window.
  expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth + 100)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  // Cards keep one height and the page's width inside its gutter (343px on a 375px phone; 319px with
  // the glimpse of the neighbours before the carousel of 23 Nov 2026).
  const sizes = await cells.evaluateAll((els) => els.map((e) => ({ w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })));
  expect(new Set(sizes.map((s) => s.h)).size).toBe(1);
  expect(Math.min(...sizes.map((s) => s.w))).toBe((page.viewportSize()?.width ?? 375) - 32);
  // No lineup pager over the cards (the owner's request of 23 Nov 2026: the cards are how the lineup
  // is browsed); five position dots under them instead, the first marked.
  await expect(page.getByTestId("lineup-pager")).toHaveCount(0);
  const dots = page.getByTestId("lineup-indicator-dot");
  await expect(dots).toHaveCount(5);
  await expect(dots.first()).toHaveAttribute("aria-selected", "true");
  // The line under the team's name wraps between whole items, never leaving a separator at a line's end.
  const subtitle = page.getByTestId("team-subtitle");
  await expect(subtitle.locator(":scope > span", { hasText: /^·$/ })).toHaveCount(0);
  expect((await subtitle.locator(":scope > span").first().boundingBox())!.height).toBeLessThanOrEqual(20);
  // A member's phone header: one 44px line under the bar (S2b; the bar carries the team's mark and
  // name, the h1 is read out only): the scope over the lineup's state, Edit lineup (its whole label) at its end.
  const header = (await page.getByTestId("team-header").boundingBox())!;
  const edit = (await page.getByTestId("edit-lineup").boundingBox())!;
  const status = (await page.getByTestId("lineup-status").boundingBox())!;
  expect(header.height, "one line under the bar").toBeLessThanOrEqual(56);
  expect((await page.getByTestId("team-name").boundingBox())!.width, "the h1 read out only").toBeLessThanOrEqual(1);
  expect(edit.x, "Edit lineup at the line's end").toBeGreaterThan(status.x + status.width);
  await expect(page.getByTestId("edit-lineup")).toHaveText("Edit lineup");
  // The first card follows the header, as the pager stood there before.
  expect((await cells.first().boundingBox())!.y - (header.y + header.height), "the card under the header").toBeLessThanOrEqual(32);
  // Nothing under the track but its dots: no bench of substitutes.
  await expect(page.getByTestId("lineup-bench")).toHaveCount(0);

  // A real touch swipe to the left lands on the next card, centred (snap).
  const cdp = await context.newCDPSession(page);
  // The track in view (it sits under the team's header and the Team tabs), then swipe across it.
  await track.evaluate((el) => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 120)));
  const box = (await track.boundingBox())!;
  const y = Math.round(box.y + 160);
  await swipe(page, cdp, { x: Math.round(box.width * 0.85), y }, { x: Math.round(box.width * 0.2), y });
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => offCentre(page.getByTestId("lineup-row-JUNGLE"))).toBeLessThanOrEqual(0.5);
  // One card in view: no neighbour shows beside it (the glimpse of either side went with the carousel).
  const shown = await cells.evaluateAll((els) => els.filter((c) => { const r = c.getBoundingClientRect(); return r.right > 0.5 && r.left < document.documentElement.clientWidth - 0.5; }).length);
  expect(shown, "one card on screen").toBe(1);
  // A vertical swipe still scrolls the page, not the track.
  await swipe(page, cdp, { x: Math.round(box.width / 2), y: 600 }, { x: Math.round(box.width / 2), y: 300 });
  // Compact cards make the page short (at 375 × 667 it fits the screen since S3a): it scrolls as far as it can (up to 50px), the track not at all.
  const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (room > 0) await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(Math.min(50, room) - 1);
  await page.waitForTimeout(300);
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");
  expect(await offCentre(page.getByTestId("lineup-row-JUNGLE"))).toBeLessThanOrEqual(0.5);
  await page.evaluate(() => window.scrollTo(0, 0));

  // The dots move too (a tap away from any player), each named by the role, then the player.
  await expect(dots.first()).toHaveAccessibleName(/^Top: .+/);
  for (const i of [2, 4, 3]) {
    await dots.nth(i).click();
    await expect(dots.nth(i)).toHaveAttribute("aria-selected", "true");
  }
  for (const dot of await dots.all()) expect(Math.min((await dot.boundingBox())!.height, (await dot.boundingBox())!.width)).toBeGreaterThanOrEqual(44);
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

// The later cards' members' pictures wait for the first card's art as its champions do: a member's
// picture comes from /api/avatars, and none is asked for while the first art is on its way. The
// demo has no pictures: a member with one starts at Mid for the test.
test("on a phone no later card's member's picture is asked for while the first card's art loads", async ({ browser, page: admin, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one member with a picture, checked on a phone below");
  test.setTimeout(180_000);
  const member = await memberContext(browser, admin, undefined, { base: "Pictured", role: "Mid" });
  let before: string | null = null;
  try {
    // Their own picture, chosen in Settings (a square drawn in the browser).
    await member.page.goto("/settings");
    const png = await member.page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#2a7f62";
      ctx.fillRect(0, 0, 256, 256);
      return c.toDataURL("image/png").split(",")[1]!;
    });
    const frame = member.page.getByTestId("avatar-crop-frame");
    // A file chosen before the page is interactive is ignored: choose it again until the editor opens.
    await expect(async () => {
      await member.page.getByTestId("avatar-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await expect(frame).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await member.page.getByTestId("avatar-save").click();
    await expect(frame).toBeHidden();
    await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    before = await setStarter(admin, "MID", member.username);

    const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await phone.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    const page = await phone.newPage();
    // Data Dragon answers at once, except the first card's art, held until the test lets it go.
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    await page.route(/ddragon\.leagueoflegends\.com/, (route) => route.fulfill({ contentType: "image/png", body: PIXEL }));
    await page.route(/ddragon\.leagueoflegends\.com\/cdn\/img\/champion\/splash\//, async (route) => {
      await held;
      await route.fulfill({ contentType: "image/png", body: PIXEL });
    });
    const pictures: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/avatars/")) pictures.push(r.url());
    });
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    const track = page.getByTestId("lineup-overview");
    await expect(track).toHaveAttribute("data-ready", "true");
    await expect(track).toHaveAttribute("data-art-wait", "true");
    await page.waitForTimeout(800);
    // The Mid card's picture (the member's own, by its address): it is a later card's, so it waits.
    // Only that one is counted: the viewer's own picture in the top bar, and the first card's, are
    // not held back, and an earlier spec may have given the demo owner one (avatar-editor.spec).
    const own = await page.getByTestId("lineup-row-MID").locator("[data-testid=card-identity] [data-avatar-frame] img").first().getAttribute("src");
    expect(own, "the Mid card carries the member's picture").toMatch(/^\/api\/avatars\//);
    const theirs = () => pictures.filter((u) => new URL(u).pathname === new URL(own!, baseURL).pathname);
    expect(theirs(), "no picture of a later card's member while the first card's art loads").toEqual([]);
    answer();
    await expect(track).not.toHaveAttribute("data-art-wait", "true");
    await expect.poll(() => theirs().length, "the picture once the art is in").toBeGreaterThan(0);
    await phone.close();
  } finally {
    if (before) await setStarter(admin, "MID", before);
    await member.context.close();
  }
});
