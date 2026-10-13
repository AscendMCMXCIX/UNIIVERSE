import { expect, test, type Page } from "@playwright/test";

/*
  Smoke tests for the responsive layout. Each project (phone 375, tablet 768, desktop 1440) runs
  every test; the app runs in local open mode with the demo roster, so there is no sign-in step.
*/

const ROUTES = ["/team", "/players", "/me", "/draft", "/matches", "/trends", "/settings", "/ranked", "/ranked/history"];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(1);
}

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 768;
}

test.describe("pages", () => {
  for (const route of ROUTES) {
    test(`${route} fits the viewport`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("main h1, main h2").first()).toBeVisible();
    });
  }
});

test("navigation is usable", async ({ page }) => {
  await page.goto("/team");
  if (isPhone(page)) {
    // Bottom tab bar on phones.
    const tabs = page.locator("nav[aria-label='Primary'] a");
    await expect(tabs).toHaveCount(5);
    await tabs.filter({ hasText: "Draft" }).click();
    await expect(page).toHaveURL(/\/draft$/);
    // Drawer holds the rest.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(drawer).toBeHidden();
  } else if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  } else {
    await expect(page.locator("aside")).toBeVisible();
    await page.locator("aside").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  }
});

test("touch targets and inputs are phone-sized", async ({ page }) => {
  test.skip(!isPhone(page), "phone only");
  await page.goto("/draft");
  const submit = page.locator("main button[type=submit]").first();
  const box = await submit.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const fontSize = await page.locator("#mode").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, "16px inputs stop iOS zooming").toBeGreaterThanOrEqual(16);
});

test("player profile: champion picker works", async ({ page }) => {
  await page.goto("/players");
  await page.locator("main a[href^='/players/']:not([href='/players/new'])").first().click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  await expectNoHorizontalOverflow(page);
  // Open the first empty primary slot (or replace the first champion) and pick by search.
  await page.locator("button[title^='Add champion'], button[title*='click to replace']").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (isPhone(page)) {
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) - 2);
  }
  // Search narrows the grid; the first enabled portrait is a legal choice.
  const first = dialog.locator("button[title]:not([disabled])").first();
  const name = await first.getAttribute("title");
  await dialog.getByPlaceholder("Search champion…").fill((name ?? "").slice(0, 3));
  await dialog.locator("button[title]:not([disabled])").first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("main button[type=submit]").first()).toBeVisible();
});

test("draft room: current action, recommendation and board are usable", async ({ page }) => {
  await page.goto("/draft");
  // Ranked 5s / Flex is the default mode; optional information stays collapsed.
  await expect(page.locator("#mode")).toHaveValue("ranked-flex");
  await page.locator("main button[type=submit]").click();
  await page.waitForURL(/\/draft\/[0-9a-f-]+/);
  if (/\/prepare$/.test(page.url())) {
    await page.getByRole("link", { name: /Open draft room/ }).click();
    await page.waitForURL(/\/draft\/[0-9a-f-]+$/);
  }
  await page.waitForLoadState("networkidle");
  await expectNoHorizontalOverflow(page);
  await expect(page.getByText(/BAN|PICK/).first()).toBeVisible();
  const lock = page.locator("section:has-text('RECOMMENDED') button:has-text('Ban'), section:has-text('RECOMMENDED') button:has-text('Lock')").first();
  await expect(lock).toBeVisible();
  if (isPhone(page)) {
    await expect(page.getByLabel("Draft board")).toBeVisible();
    // Deeper analytics are collapsed on phones.
    await expect(page.getByRole("button", { name: /Projected team/i })).toBeVisible();
    await expect(page.getByText("Best complete team reachable from here")).toBeHidden();
  }
  await lock.click();
  await expect(page.getByText("Updating recommendation")).toBeHidden({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
});
