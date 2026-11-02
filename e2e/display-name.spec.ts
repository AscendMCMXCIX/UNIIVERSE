import { expect, test } from "./test";
import { choosePassword, createMember, memberContext, unique } from "./member-account";
import { NEUTRAL_NAME } from "../src/domain/branding";

/*
  Usernames and display names are separate. A new player chooses the display name teammates see
  (prefilled with their username) in the required setup, moves back and forth without losing
  anything, then may personalise their card with the real Card Studio. Later, Settings changes the
  display name everywhere it shows, and never the username.
*/

const noSideScroll = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("a new player picks a display name apart from their username, goes back without losing anything, and personalises their card", async ({ browser, page: admin }, info) => {
  const { username, temporary } = await createMember(admin, "Rookie");
  const viewport = admin.viewportSize() ?? { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);

  // Step 1 of 3: the display name, prefilled with the username, checked as typed, shown on the live card.
  const setup = page.getByTestId("setup-form");
  await expect(setup).toHaveAttribute("data-step", "name");
  await expect(page.getByTestId("setup-steps")).toContainText("Step 1 of 3");
  const name = setup.getByTestId("setup-display-name");
  await expect(name).toHaveValue(username);
  await expect(setup.getByTestId("setup-account-facts")).toContainText(username);
  await name.fill("a");
  await name.blur();
  await expect(setup.getByText("At least 2 characters.")).toBeVisible();
  await expect(setup.getByTestId("setup-continue")).toBeDisabled();
  const display = unique("Rift Walker ");
  await name.fill(display);
  const card = setup.getByTestId("setup-preview").getByTestId("card-preview");
  await expect(card).toContainText(display);
  await setup.getByTestId("setup-continue").click();

  // Step 2: roles and champions; the card follows the role. Back keeps the name, forward keeps the role and pool.
  await expect(setup).toHaveAttribute("data-step", "profile");
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: "Mid" }).click();
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Mid");
  await setup.getByTestId("setup-back").click();
  await expect(name).toHaveValue(display);
  await setup.getByTestId("setup-continue").click();
  await expect(setup.getByTestId("primary-role-status")).toContainText("Mid");
  await expect(setup.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(1);
  expect(await noSideScroll(page)).toBe(true);

  // A reload (or a closed tab) resumes on the same step with everything kept: the server holds the progress.
  // (The autosave waits half a second after the last change, then reports "Progress saved".)
  await page.waitForTimeout(700);
  await expect(setup.getByText("Progress saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("setup-form")).toHaveAttribute("data-step", "profile");
  await expect(setup.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(1);
  await setup.getByTestId("setup-back").click();
  await expect(name).toHaveValue(display);
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("button", { name: "Finish setup" }).click();

  // Step 3 (optional): Personalise, with the saved card and the real Card Studio.
  await expect(page).toHaveURL(/\/welcome\/personalise$/);
  const personalise = page.getByTestId("personalise-step");
  await expect(page.getByTestId("setup-steps")).toHaveAttribute("data-current", "personalise");
  await expect(personalise.getByTestId("personalise-preview")).toContainText(display);
  await expect(personalise.getByTestId("personalise-done")).toHaveText("Skip for now");
  // Social links are offered here too, each private until its Show publicly switch is on.
  await expect(personalise.getByTestId("social-links-form")).toBeVisible();
  for (const platform of ["YouTube", "Twitch", "Discord"]) await expect(personalise.getByRole("switch", { name: `Show publicly: ${platform}` })).not.toBeChecked();
  expect(await noSideScroll(page)).toBe(true);
  // Back opens the roles step with the saved answers, and Finish returns here.
  await personalise.getByTestId("personalise-back").click();
  await expect(page.getByTestId("setup-form")).toHaveAttribute("data-step", "profile");
  await expect(setup.getByTestId("primary-role-status")).toContainText("Mid");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/welcome\/personalise$/);
  // A Studio preset, saved: the card here shows it, and the step now offers Done.
  const frameBefore = await personalise.getByTestId("card-preview").getAttribute("data-frame");
  await personalise.getByTestId("customise-card").click();
  const studio = page.getByTestId("card-studio");
  await expect(studio).toBeVisible();
  const presets = page.getByTestId("studio-presets").getByRole("button");
  for (let i = 0; i < (await presets.count()); i++) {
    await presets.nth(i).click();
    if ((await studio.getByTestId("card-preview").getAttribute("data-frame")) !== frameBefore) break;
  }
  await page.getByTestId("save-card-style").click();
  await expect(studio).toBeHidden();
  await expect(personalise.getByTestId("personalise-done")).toHaveText(`Done: open ${NEUTRAL_NAME}`);
  await expect(personalise.getByTestId("card-preview")).not.toHaveAttribute("data-frame", frameBefore ?? "");
  await personalise.getByTestId("personalise-done").click();

  // The app opens; teammates see the display name, the username stays the sign-in name.
  await expect(page).toHaveURL(/\/team/);
  if (info.project.name === "desktop") {
    await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(display);
  }
  await page.goto("/overview");
  await expect(page.getByTestId("profile-header")).toContainText(display);
  // Teammates see it on Players (one's own card is left out of one's own directory).
  await admin.goto("/players");
  await expect(admin.getByTestId("players-directory")).toContainText(display);
  await page.goto("/settings");
  await expect(page.getByLabel("Display name")).toHaveValue(display);
  await expect(page.getByLabel("Username")).toHaveValue(username);
  await context.close();
});

test("Settings changes the display name everywhere it shows and never the username", async ({ browser, page: admin }) => {
  test.skip(test.info().project.name !== "desktop", "one device is enough for the propagation check");
  const { context, page, username } = await memberContext(browser, admin);
  await page.goto("/settings");
  const form = page.getByTestId("display-name-form");
  const field = form.getByLabel("Display name");
  await expect(field).toHaveValue(username);
  await expect(page.getByLabel("Username")).toHaveValue(username);
  const save = form.getByRole("button", { name: "Save display name" });
  await expect(save).toBeDisabled();
  // The server's rule, as typed.
  await field.fill("!");
  await expect(form.getByText("At least 2 characters.")).toBeVisible();
  await expect(save).toBeDisabled();
  const display = unique("Jungle Diff ");
  await field.fill(`  ${display}  `);
  await save.click();
  await expect(page.getByTestId("toast").filter({ hasText: "Display name changed." })).toBeVisible();
  await expect(field).toHaveValue(display);
  await expect(page.getByLabel("Username")).toHaveValue(username);
  // The account menu: the display name, with the username beside it to tell accounts apart.
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(display);
  await page.locator("aside").getByTestId("account-menu-button").click();
  await expect(page.getByTestId("account-current-username")).toHaveText(`Username: ${username}`);
  await page.keyboard.press("Escape");
  // The profile header uses it.
  await page.goto("/overview");
  await expect(page.getByTestId("profile-header")).toContainText(display);
  // Other members see it too (the admin's view of Players).
  await admin.goto("/players");
  await expect(admin.getByTestId("players-directory")).toContainText(display);
  await context.close();
});
