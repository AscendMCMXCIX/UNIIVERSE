import { expect, test, type Page } from "@playwright/test";
import { startDraft } from "./draft-flow";

/*
  Team navigation: the sidebar has one Team entry (marked on every Team section) and each Team page
  carries the same tabs: Overview, Players, Leaderboards, Matches. Drafting is started from Team
  Overview (Start a draft, Resume draft) and has no tab; Team stays marked on the draft pages. Every tab keeps its own
  address, so direct links, Back and Forward work; pages inside a section (a profile) have no tabs
  and keep Team marked. Demo roster, in-memory only.
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

async function expectCurrent(page: Page, key: string) {
  await expect(page.getByTestId(`team-tab-${key}`)).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("team-tabs").locator("[aria-current=page]")).toHaveCount(1);
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator("aside").getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  if (isPhone(page)) {
    // The bottom bar: Matches has its own tab; Team stands for the other sections.
    const own = key === "matches" ? `/${key}` : "/team";
    await expect(page.locator(`nav[aria-label='Primary'] a[href='${own}']`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator("nav[aria-label='Primary'] a[aria-current=page]")).toHaveCount(1);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the Team tabs move between the sections, each at its own address, with Back and Forward", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-tabs").getByRole("link")).toHaveText(SECTIONS.map(([, , label]) => label));
  // Team Overview stays the team's home page: its header and the five lineup cards.
  await expect(page.getByTestId("lineup-row-TOP")).toBeVisible();
  await expect(page.getByTestId("team-tabs-identity")).toHaveCount(0);
  await expectCurrent(page, "team");
  for (const [key, href] of SECTIONS.slice(1)) {
    await page.getByTestId(`team-tab-${key}`).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expectCurrent(page, key);
  }
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
  const href = (await page.locator("main a[data-testid='player-card']").first().getAttribute("href"))!;
  await page.goto(href);
  await expect(page.getByTestId("team-tabs")).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator("aside").getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  if (isPhone(page)) await expect(page.locator("nav[aria-label='Primary'] a[href='/team']")).toHaveAttribute("aria-current", "page");
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

test("Draft is not a tab: Team Overview starts it, and Team stays marked on the draft pages", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-tabs").getByRole("link", { name: "Draft" })).toHaveCount(0);
  await expect(page.locator("nav[aria-label='Primary'] a[href='/draft']")).toHaveCount(0);
  await page.goto("/draft");
  await expect(page.getByTestId("team-tabs")).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator("aside").getByTestId("nav-team")).toHaveAttribute("aria-current", "page");
  if (isPhone(page)) await expect(page.locator("nav[aria-label='Primary'] a[href='/team']")).toHaveAttribute("aria-current", "page");
  // Back on Team Overview, Start a draft leads to the same page.
  await page.goto("/team");
  await page.getByTestId("team-start-draft").click();
  await expect(page).toHaveURL(/\/draft$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
});

test("an unfinished draft adds Resume draft beside Start a draft, and the header still fits a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "starts a draft once; checks the narrow widths with explicit viewports");
  const room = await startDraft(page);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/team");
    const resume = page.getByTestId("team-resume-draft");
    await expect(resume).toBeVisible();
    await expect(page.getByTestId("team-start-draft")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `Team Overview at ${width}px`).toBeLessThanOrEqual(1);
  }
  // One unfinished draft opens directly; several open the draft page's list.
  const href = await page.getByTestId("team-resume-draft").getAttribute("href");
  expect(href === room || href === "/draft").toBe(true);
  await page.getByTestId("team-resume-draft").click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});
