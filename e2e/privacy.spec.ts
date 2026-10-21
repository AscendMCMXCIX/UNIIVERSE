import { expect, test } from "./test";

/*
  THE PRIVACY NOTICE (audit decision 14). /privacy is open without an account, linked from the
  sign-in page and from Settings, and fits a phone without sideways scrolling.
*/

const GUEST_COOKIE = "uniiverse_guest";

test("is public, linked from sign-in, and lists what is stored, who sees it and how long", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const context = await browser.newContext(info.project.name === "phone" ? { viewport: { width: 375, height: 667 } } : {});
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  const guest = await context.newPage();
  await guest.goto("/login");
  await guest.getByTestId("login-privacy-link").click();
  await expect(guest).toHaveURL(/\/privacy$/);
  await expect(guest.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  const stored = guest.getByTestId("privacy-stored").locator(":scope > li");
  await expect(stored).toHaveCount(12);
  await expect(stored.filter({ hasText: "Clash scouts the team saves" })).toContainText("never uploaded");
  await expect(guest.getByText("text-recognition files from jsDelivr")).toBeVisible();
  await expect(stored.filter({ hasText: "Social links, only if you add them" })).toContainText("only you, team members, or also the public team page");
  await expect(stored.first()).toContainText("scrypt hash");
  await expect(guest.getByText("Failed sign-ins")).toBeVisible();
  await expect(stored.nth(1)).toContainText("deleted automatically about a week later");
  // Shared match records outlive an erased profile, and the notice says so.
  await expect(guest.getByTestId("privacy-stored")).toContainText("a game stays stored after the profiles that played it are erased");
  await expect(guest.getByText("It never shows usernames, Riot IDs, ranks or statistics.")).toBeVisible();
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test("Settings links to it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one size is enough for a link");
  await page.goto("/settings");
  const link = page.getByTestId("settings-privacy-link");
  await expect(link).toHaveAttribute("href", "/privacy");
  await link.click();
  await expect(page).toHaveURL(/\/privacy$/);
});
