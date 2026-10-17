import { expect, test, type Page } from "@playwright/test";

/*
  Meta & Trends navigation: the sidebar has one Meta & Trends entry (it opens Solo Queue Meta and is
  marked on every Meta & Trends page) and each of those pages carries the same tabs: Solo Queue
  Meta, Duo Synergies, Pro Play. Every tab keeps its own address, so direct links, Back and Forward
  work. Demo data, in-memory only.
*/

const SECTIONS = [
  ["solo", "/trends/solo", "Solo Queue Meta"],
  ["duos", "/trends/duos", "Duo Synergies"],
  ["pro", "/trends/pro", "Pro Play"],
] as const;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function expectCurrent(page: Page, key: string) {
  await expect(page.getByTestId(`meta-tab-${key}`)).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("meta-tabs").locator("[aria-current=page]")).toHaveCount(1);
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator("aside").getByTestId("nav-trends")).toHaveAttribute("aria-current", "page");
  if (isPhone(page)) {
    // The bottom bar (a team member: Profile, Team, Draft, Matches, Meta): Meta stands for every section.
    await expect(page.locator("nav[aria-label='Primary'] a[href='/trends/solo']")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("nav[aria-label='Primary'] a[aria-current=page]")).toHaveCount(1);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the Meta & Trends tabs move between the sections, each at its own address, with Back and Forward", async ({ page }) => {
  await page.goto("/trends");
  await expect(page).toHaveURL(/\/trends\/solo/);
  await expect(page.getByTestId("meta-tabs").getByRole("link")).toHaveText(SECTIONS.map(([, , label]) => label));
  await expect(page.getByTestId("team-tabs-identity")).toHaveCount(0);
  await expectCurrent(page, "solo");
  for (const [key, href] of SECTIONS.slice(1)) {
    await page.getByTestId(`meta-tab-${key}`).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expectCurrent(page, key);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/trends\/duos$/);
  await expectCurrent(page, "duos");
  await page.goForward();
  await expect(page).toHaveURL(/\/trends\/pro$/);
  await expectCurrent(page, "pro");
});

test("a section opened directly has the tabs, and the sidebar entry opens Solo Queue Meta", async ({ page }) => {
  await page.goto("/trends/duos");
  await expectCurrent(page, "duos");
  await expect(page.getByRole("heading", { name: "Duo Synergies" })).toBeVisible();
  // Team pages keep their own tabs; the Meta & Trends tabs are only on Meta & Trends pages.
  await page.goto("/team");
  await expect(page.getByTestId("meta-tabs")).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.locator("aside").getByTestId("nav-trends").click();
    await expect(page).toHaveURL(/\/trends\/solo$/);
    await expectCurrent(page, "solo");
  }
});

test("the collapsed sidebar keeps Meta & Trends as one marked icon", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the sidebar is desktop-only");
  await page.goto("/trends/pro");
  const aside = page.locator("aside");
  await aside.getByTestId("sidebar-toggle").click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await page.mouse.move(900, 400);
  await expect(aside.getByTestId("nav-trends")).toHaveAttribute("aria-current", "page");
  await expect(aside.getByRole("link", { name: "Duo Synergies" })).toHaveCount(0);
  await aside.getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
  await expect(aside).toHaveAttribute("data-collapsed", "false");
});

test("Admin Mode has the same single entry and tabs", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the sidebar is desktop-only");
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/trends/pro");
  const entry = page.locator("aside").getByTestId("nav-admin-league");
  await expect(entry).toHaveAttribute("href", "/trends/solo");
  await expect(entry).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("meta-tabs").getByRole("link")).toHaveText(SECTIONS.map(([, , label]) => label));
  await page.getByTestId("meta-tab-duos").click();
  await expect(page).toHaveURL(/\/trends\/duos$/);
  await expect(entry).toHaveAttribute("aria-current", "page");
});
