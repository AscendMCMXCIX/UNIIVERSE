import { expect, test, type Page } from "./test";
import { cardOf, expandedOf, openGame, opensFullScreen } from "./match-history";

/*
  Match History's layout on every size (29 Oct 2026): the profile card is one compact band on the
  profile's other sections and in full on its Overview; a phone's scoreboard row is three lines
  (the items share the damage's line); an open game ends with a control that closes it and brings
  its card back into view; a narrow card keeps the time of its game in view; and on a phone the
  Refine fields after Result wait behind "More filters".
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function profileOf(page: Page, role: string) {
  await page.goto("/team");
  return `/players/${(await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!}`;
}

test("the profile card is a compact band on the other sections and in full on the Overview", async ({ page }) => {
  const profile = await profileOf(page, "MID");
  await page.goto(profile);
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  await expect(header).not.toHaveAttribute("data-compact");
  const full = (await header.boundingBox())!;
  for (const section of ["matches", "champions", "accounts"]) {
    await page.goto(`${profile}/${section}`);
    await expect(header).toHaveAttribute("data-compact");
    // The name, the role and the rank stay; the band is far shorter than the card.
    await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(header.getByTestId("profile-rank")).toBeVisible();
    const band = (await header.boundingBox())!;
    expect(band.height, section).toBeLessThanOrEqual(80);
    expect(band.height).toBeLessThan(full.height * 0.6);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
  // Back on the Overview (a tab, no reload): the full card again. (On a phone the sections ride in the top bar.)
  await page.getByTestId((page.viewportSize()?.width ?? 1440) < 768 ? "profile-chrome-tab-overview" : "profile-tab-overview").click();
  await expect(header).not.toHaveAttribute("data-compact");
});

test("an open game ends with a control that closes it and brings its card into view, with the focus on it", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open a game as a whole screen, closed by Back or its close button: e2e/mobile-nav.spec.ts");
  const profile = await profileOf(page, "TOP");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const card = page.getByTestId("match-card").nth(1);
  const matchId = (await card.getByTestId("match-row").getAttribute("data-match"))!;
  await openGame(card);
  const close = expandedOf(cardOf(page, matchId)).getByTestId("match-close");
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeVisible();
  // A finger-sized target on touch screens.
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  const row = cardOf(page, matchId).getByTestId("match-row");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(expandedOf(cardOf(page, matchId))).toHaveCount(0);
  await expect(row).toBeFocused();
  await expect(async () => {
    const box = (await cardOf(page, matchId).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeLessThan(page.viewportSize()!.height);
  }).toPass({ timeout: 5_000 });
});

test("a phone's scoreboard row is three lines: the name and KDA, the champion and rank, the items with the damage, then the figures", async ({ page }) => {
  test.skip(!isPhone(page), "the phone layout");
  const profile = await profileOf(page, "SUPPORT");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const breakdown = await openGame(page.getByTestId("match-card").first());
  const rows = breakdown.locator('[data-testid="participant"]:not([data-removed])');
  await expect(rows.first()).toBeVisible();
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const box = (await row.boundingBox())!;
    expect(box.height, `row ${i}`).toBeLessThanOrEqual(96);
    // The items sit on the damage's line, inside the row.
    const items = (await row.getByTestId("participant-items-phone").boundingBox())!;
    expect(items.x + items.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("a narrow card keeps the time of its game in view", async ({ page }) => {
  test.skip(!isPhone(page), "the narrow card");
  const profile = await profileOf(page, "TOP");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const metas = page.getByTestId("match-card-meta");
  const count = await metas.count();
  expect(count).toBeGreaterThan(0);
  // Cards with a "Best … in N" chip too: on a narrow card it sits in the figures' row, so the KDA
  // column beside the line stays narrow.
  expect(await page.locator('[data-testid="match-standout"]:visible').count()).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const meta = metas.nth(i);
    // "Victory · Solo/Duo · 3h ago" as shown (the long queue name is hidden): without "Ranked", and nothing cut off.
    await expect(meta).toContainText(/ago|just now/);
    expect(await meta.innerText()).not.toContain("Ranked");
    expect(await meta.evaluate((el) => el.scrollWidth - el.clientWidth), `card ${i}`).toBeLessThanOrEqual(1);
  }
});

test("on a phone, Refine shows Result and keeps the other fields behind More filters", async ({ page }) => {
  test.skip(!isPhone(page), "the phone filter bar");
  const profile = await profileOf(page, "JUNGLE");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const filters = page.getByTestId("match-filters");
  const toggle = filters.getByTestId("filter-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const panel = filters.getByTestId("refine-panel");
  await expect(panel.getByTestId("refine-result")).toBeVisible();
  const more = panel.getByTestId("refine-more");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByTestId("refine-patch")).toBeHidden();
  const short = (await panel.boundingBox())!.height;
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByTestId("refine-patch")).toBeVisible();
  await expect(panel.getByTestId("refine-group")).toBeVisible();
  expect((await panel.boundingBox())!.height).toBeGreaterThan(short + 150);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
