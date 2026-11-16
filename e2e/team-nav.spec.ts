import { expect, test, type Page } from "./test";

/*
  Team navigation: the sidebar has one Team entry (marked on every Team section) and each Team page
  carries the same tabs: Overview, Players, Leaderboards, Matches. Every tab keeps its own address,
  so direct links, Back and Forward work; pages inside a section (a profile) have no tabs and keep
  Team marked. Phones put the four sections in the bottom tab bar instead (docs/MOBILE.md), each its
  own tab, so the page tabs are not repeated there. Demo roster, in-memory only.
*/

const SECTIONS = [
  ["team", "/team", "Overview"],
  ["players", "/players", "Players"],
  ["leaderboards", "/leaderboards", "Leaderboards"],
  ["matches", "/matches", "Matches"],
] as const;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The phone tab of each Team section (the bottom bar's own destinations). */
const PHONE_TAB: Record<string, string> = { team: "/team", players: "/players", leaderboards: "/leaderboards", matches: "/matches" };

async function expectCurrent(page: Page, key: string) {
  if (isPhone(page)) {
    // The bottom bar: each Team section is a destination of its own; the page tabs are not repeated.
    await expect(page.getByTestId("team-tabs")).toBeHidden();
    await expect(page.locator(`nav[aria-label='Primary'] a[href='${PHONE_TAB[key]}']`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator("nav[aria-label='Primary'] a[aria-current=page]")).toHaveCount(1);
  } else {
    await expect(page.getByTestId(`team-tab-${key}`)).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("team-tabs").locator("[aria-current=page]")).toHaveCount(1);
  }
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator("aside").getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the Team tabs move between the sections, each at its own address, with Back and Forward", async ({ page }) => {
  await page.goto("/team");
  if (!isPhone(page)) await expect(page.getByTestId("team-tabs").getByRole("link")).toHaveText(SECTIONS.map(([, , label]) => label));
  // Team Overview stays the team's home page: its header and the five lineup cards.
  await expect(page.getByTestId("lineup-row-TOP")).toBeVisible();
  await expect(page.getByTestId("team-tabs-identity")).toHaveCount(0);
  await expectCurrent(page, "team");
  for (const [key, href] of SECTIONS.slice(1)) {
    await (isPhone(page) ? page.locator(`nav[aria-label='Primary'] a[href='${href}']`) : page.getByTestId(`team-tab-${key}`)).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expectCurrent(page, key);
  }
  // The last tab is Matches: Back goes through the tabs in reverse, Forward returns.
  await page.goBack();
  await expect(page).toHaveURL(/\/leaderboards$/);
  await expectCurrent(page, "leaderboards");
  await page.goBack();
  await expect(page).toHaveURL(/\/players$/);
  await expectCurrent(page, "players");
  await page.goForward();
  await expect(page).toHaveURL(/\/leaderboards$/);
  await expectCurrent(page, "leaderboards");
});

test("a section opened directly has the tabs; a page inside a section has none and keeps Team marked", async ({ page }) => {
  await page.goto("/leaderboards");
  await expectCurrent(page, "leaderboards");
  if ((page.viewportSize()?.width ?? 0) >= 768) await expect(page.getByTestId("team-tabs-identity")).toBeVisible();
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").getAttribute("href"))!;
  await page.goto(href);
  await expect(page.getByTestId("team-tabs")).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator("aside").getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  // A teammate's profile is under Players on a phone, the bar's own destination for it.
  if (isPhone(page)) await expect(page.locator("nav[aria-label='Primary'] a[href='/players']")).toHaveAttribute("aria-current", "page");
});

test("the collapsed sidebar keeps Team as one marked icon", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the sidebar is desktop-only");
  await page.goto("/matches");
  const aside = page.locator("aside");
  await aside.getByTestId("sidebar-toggle").click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await page.mouse.move(900, 400);
  await expect(aside.getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  await expect(aside.getByRole("link", { name: "Players" })).toHaveCount(0);
  await aside.getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
  await expect(aside).toHaveAttribute("data-collapsed", "false");
});

test("Clash Scout is gone: no entry, tab or link in any navigation, the phone bar is its five destinations, and its addresses are not found", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  const entries = ["nav-overview", "nav-team", "nav-resources"];
  await page.goto("/team");
  await expect(page.locator("a[href^='/clash']")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Clash Scout|Scout/ })).toHaveCount(0);
  if (width >= 1024) {
    const aside = page.locator("aside");
    expect(await aside.locator("nav[aria-label='Main'] > a").evaluateAll((as) => as.map((a) => a.getAttribute("data-testid")))).toEqual(entries);
    // Collapsed to icons: the same three, nothing in between.
    await aside.getByTestId("sidebar-toggle").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(await aside.locator("nav[aria-label='Main'] > a").evaluateAll((as) => as.map((a) => a.getAttribute("data-testid")))).toEqual(entries);
    await aside.getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
    await expect(aside).toHaveAttribute("data-collapsed", "false");
  } else {
    if (isPhone(page)) {
      // The bar shares its width between the five destinations, with Team lit; the account screen holds the rest.
      const bar = page.locator("nav[aria-label='Primary']");
      await expect(bar.locator("a")).toHaveText(["Team", "Players", "Leaderboards", "Matches", "Profile"]);
      await expect(bar.locator("a[aria-current=page]")).toHaveText("Team");
      const cells = await bar.locator("li").evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect().width));
      expect(cells).toHaveLength(5);
      const list = (await bar.locator("ul").boundingBox())!;
      expect(Math.abs(cells.reduce((a, b) => a + b, 0) - list.width)).toBeLessThanOrEqual(1);
      await page.getByTestId("account-sheet-button").click();
      const sheet = page.getByTestId("account-sheet");
      await expect(sheet.getByRole("link", { name: "Resources" })).toBeVisible();
      await expect(sheet.locator("a[href^='/clash']")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
    } else {
      // The tablet menu: the same entries as the sidebar.
      await page.getByRole("button", { name: "Open menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Menu" });
      expect(await drawer.locator("nav[aria-label='Main'] > a").evaluateAll((as) => as.map((a) => a.getAttribute("data-testid")))).toEqual(entries);
      await page.keyboard.press("Escape");
    }
  }
  // Its pages answer the app's own "not found", at the address asked for, and its API is gone too.
  for (const path of ["/clash", "/clash/lab", "/clash/0f0e0d0c-0b0a-4908-8706-050403020100"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    await expect(page, path).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByTestId("not-found")).toContainText("This page does not exist");
  }
  expect((await page.request.get("/api/clash/champion-prints?v=1")).status()).toBe(404);
});

test("Meta & Trends is gone: no entry, tab or link in any navigation, and its pages are not found", async ({ page }, info) => {
  await page.goto("/team");
  if (info.project.name === "phone") {
    await expect(page.locator("nav[aria-label='Primary'] a")).toHaveText(["Team", "Players", "Leaderboards", "Matches", "Profile"]);
    await page.getByTestId("account-sheet-button").click();
    await expect(page.getByTestId("account-sheet")).toBeVisible();
  }
  await expect(page.locator("a[href^='/trends']")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Meta|Trends|Pro Play|Duo Synergies/ })).toHaveCount(0);
  for (const path of ["/trends", "/trends/solo", "/trends/duos", "/trends/pro"]) expect((await page.goto(path))?.status(), path).toBe(404);
});

test("Draft is gone: no Draft tab, link or control on Team Overview, its pages are not found, and the header fits every width", async ({ page }, info) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-tabs").getByRole("link", { name: "Draft" })).toHaveCount(0);
  await expect(page.locator("a[href^='/draft'], a[href^='/opponents']")).toHaveCount(0);
  for (const id of ["team-start-draft", "team-resume-draft"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId("edit-lineup")).toBeVisible();
  for (const path of ["/draft", "/opponents", "/admin/competition"]) expect((await page.goto(path))?.status(), path).toBe(404);
  if (info.project.name !== "desktop") return;
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/team");
    await expect(page.getByTestId("edit-lineup")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `Team Overview at ${width}px`).toBeLessThanOrEqual(1);
  }
});
