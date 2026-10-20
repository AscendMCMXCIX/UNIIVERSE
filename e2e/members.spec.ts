import { expect, test } from "@playwright/test";

/*
  Membership and setup are separate (demo roster, in-memory only): "Demo Newcomer" has chosen
  nothing yet and "Demo Halfway" has a role but has not finished setup. Both are listed with the
  configured members, open like anyone else, show what is missing as such, and only a member with
  a role is offered for lineup roles.
*/

test("members in setup are listed beside configured members and their profiles open with clear empty states", async ({ page }) => {
  await page.goto("/players");
  // Each card is a container with one link laid over it; the badges and texts are the container's.
  const cards = page.locator("main [data-testid='player-card-item']");
  await expect(cards.filter({ hasText: "Demo Top" })).toHaveCount(1);
  const newcomer = cards.filter({ hasText: "Demo Newcomer" });
  const halfway = cards.filter({ hasText: "Demo Halfway" });
  await expect(newcomer).toHaveCount(1);
  await expect(halfway).toHaveCount(1);
  await expect(newcomer.getByTestId("setup-incomplete")).toBeVisible();
  await expect(newcomer.getByTestId("directory-no-roles")).toBeVisible();
  await expect(cards.filter({ hasText: "Demo Top" }).getByTestId("setup-incomplete")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await newcomer.click();
  await expect(page.getByTestId("setup-incomplete").first()).toBeVisible();
  await expect(page.getByTestId("profile-no-role")).toBeVisible();
  await expect(page.getByTestId("no-roles")).toBeVisible();
  // No games: shown as missing, never as a zero statistic.
  await expect(page.getByTestId("season-record")).toHaveText("—");
  // The other sections open too, each with its own empty state.
  const profile = new URL(page.url()).pathname;
  await page.goto(`${profile}/accounts`);
  await expect(page.getByRole("heading", { name: /Riot accounts/i }).first()).toBeVisible();
});

test("a member with a role but unfinished setup is offered for that role; a member without a role is shown but not assignable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "lineup editing runs once");
  await page.goto("/team");
  await page.getByRole("button", { name: /edit lineup/i }).first().click();
  await page.getByRole("button", { name: /Change Bottom player/ }).click();
  const sheet = page.getByTestId("lineup-sheet-ADC");
  await expect(sheet.getByRole("radio", { name: /Demo Halfway/ })).toBeEnabled();
  const waiting = sheet.getByTestId("lineup-waiting").filter({ hasText: "Demo Newcomer" });
  await expect(waiting).toBeVisible();
  await expect(waiting).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("Players are listed A to Z by display name, whatever their lineup role", async ({ page }) => {
  await page.goto("/players");
  // Read once shown: streamed content waits, hidden and outside main, until React reveals it.
  await expect(page.locator("main a[data-testid='player-card']").first()).toBeVisible();
  const names = await page.locator("main a[data-testid='player-card']").evaluateAll((cards) => cards.map((c) => c.getAttribute("data-player-name") ?? ""));
  expect(names.length).toBeGreaterThan(3);
  // English collation, case and accents ignored, numbers as numbers (src/domain/display-name.ts).
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  expect(names).toEqual([...names].sort((a, b) => collator.compare(a, b)));
});
