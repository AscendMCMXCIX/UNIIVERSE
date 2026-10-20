import { expect, test, type Page } from "@playwright/test";
import { NEUTRAL_NAME } from "../src/domain/branding";

/*
  Admin Mode (the Owner account only). The browser tests run in local open mode, where the
  automatic local owner stands in for the Owner: with no view cookie it opens in Admin Mode, as the
  real Owner always does. Account creation uses the in-memory demo's stand-in for Riot's account
  check (UNIIVERSE_FAKE_RIOT_IDS in playwright.config.ts), never Riot itself.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once, on the desktop project"));

/** A username unique to this run (the demo database lives as long as the test server). */
const unique = (base: string) => `${base}${Date.now().toString(36).slice(-5)}`;

async function createAccount(page: Page, username: string, access: "team" | "personal", riotId = `${username}#OCE`) {
  const form = page.getByTestId("add-player-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Riot ID").fill(riotId);
  await form.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("riot-verified")).toBeVisible();
  await page.getByTestId(`new-access-${access}`).check();
  await page.getByTestId("create-account").click();
}

test("the Owner works in Admin Mode only: grouped sidebar, no Player View switch, personal pages send it to Admin", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/admin\/people$/);
  const aside = page.locator("aside");
  for (const group of ["admin-people", "admin-site"]) await expect(aside.getByTestId(`nav-group-${group}`)).toBeVisible();
  // Team is one entry; its sections are the tabs at the top of its pages.
  await expect(aside.getByTestId("nav-admin-team")).toHaveAttribute("href", "/team");
  await expect(aside.getByRole("link", { name: "Branding" })).toBeVisible();
  await expect(page.getByText(/Switch to Admin|Back to Player View/)).toHaveCount(0);
  // Personal pages are not part of Admin Mode.
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/admin\/people$/);
  await expect(page.getByTestId("players-admin")).toBeVisible();
  // Team management stays inside Admin Mode.
  await page.goto("/team");
  await expect(aside.getByTestId("nav-admin-team")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("team-tabs")).toBeVisible();
});

test("consecutive account creations always copy the details of the account just created", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/admin/people");
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const created = page.getByTestId("created-account");
  const password = page.getByTestId("temporary-password-value");

  const first = unique("Alpha");
  await createAccount(page, first, "personal");
  await expect(created).toContainText(first);
  await expect(created).toContainText("personal use");
  const firstPassword = (await password.innerText()).trim();
  await page.getByTestId("copy-details").click();
  expect(await clipboard()).toContain(`Username: ${first}\nTemporary password: ${firstPassword}`);

  const second = unique("Bravo");
  await createAccount(page, second, "team");
  await expect(created).toContainText(second);
  const secondPassword = (await password.innerText()).trim();
  expect(secondPassword).not.toBe(firstPassword);
  await page.getByTestId("copy-details").click();
  const copied = await clipboard();
  expect(copied).toContain(`Username: ${second}\nTemporary password: ${secondPassword}`);
  expect(copied).not.toContain(first);

  // A failed creation (username taken) clears the previous result; the next success shows its own.
  await createAccount(page, second, "team", `${unique("Delta")}#OCE`);
  await expect(page.getByText(/That username is already taken/)).toBeVisible();
  await expect(created).toHaveCount(0);
  const third = unique("Charlie");
  await createAccount(page, third, "team");
  await expect(created).toContainText(third);
  await page.getByTestId("copy-details").click();
  expect(await clipboard()).toContain(`Username: ${third}`);

  // Every new account is listed at once, with its state and team membership.
  await page.getByTestId("people-search").fill(first);
  const personal = page.getByTestId("people-group-personal").getByTestId("admin-player-row").filter({ hasText: first });
  await expect(personal).toContainText("Awaiting first login");
  await expect(personal).toContainText("Personal use");
  await page.getByTestId("people-search").fill(second);
  await expect(page.getByTestId("people-group-team").getByTestId("admin-player-row").filter({ hasText: second })).toContainText("Team member");

  // Promote the personal account to the team through Manage access.
  await page.getByTestId("people-search").fill(first);
  await personal.getByTestId("open-access").click();
  const dialog = page.getByTestId("access-dialog");
  await expect(dialog.getByTestId("team-membership")).toBeVisible();
  await dialog.getByTestId("team-membership").getByText(`Member of the ${NEUTRAL_NAME} team`).click();
  await expect(dialog.getByLabel(`Member of the ${NEUTRAL_NAME} team`)).toBeChecked();
  await page.getByTestId("save-access").click();
  await expect(page.getByTestId("people-group-team").getByTestId("admin-player-row").filter({ hasText: first })).toContainText("Team member");
});

test("System Health lists admin activity, newest first, with no password in it", async ({ page }) => {
  const username = unique("Logged");
  await page.goto("/admin/people");
  await createAccount(page, username, "personal");
  const password = (await page.getByTestId("temporary-password-value").textContent())?.trim() ?? "";
  expect(password.length).toBeGreaterThan(5);
  await page.goto("/admin/system");
  const activity = page.getByTestId("admin-activity");
  await activity.locator("summary").click();
  const first = activity.getByTestId("admin-activity-row").first();
  await expect(first).toContainText("Created an account");
  await expect(first).toContainText(username);
  await expect(activity).not.toContainText(password);
});
