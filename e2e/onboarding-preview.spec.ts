import { expect, test } from "./test";

/*
  Admin → Previews → New player setup: the whole first sign-in with the practice account, on
  phone, tablet and desktop. Every step uses the real form and the real rules, and nothing is sent:
  the page makes no POST request from start to finish.
*/

test("the new player setup preview runs end to end, with real checks, back and forth, restart, and nothing sent", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/preview/setup");
  await expect(page.getByTestId("onboarding-step-signin")).toBeVisible();
  await expect(page.getByTestId("preview-account")).toContainText("NewPlayer");

  // Sign in: a wrong password gets the real sign-in message, the practice account goes on.
  const login = page.getByTestId("login-form");
  await login.getByLabel("Username").fill("NewPlayer");
  await login.getByLabel("Password").fill("wrong");
  await login.getByRole("button", { name: "Sign in" }).click();
  await expect(login.getByRole("alert")).toContainText("Username or password not recognised");
  await login.getByLabel("Password").fill("Kq4xz-Tm7Rp-9abW");
  await login.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("onboarding-step-password")).toBeVisible();
  await expect(page).toHaveURL(/step=password/);

  // Password: the temporary one and a weak one are refused in the server's words.
  const pw = page.getByTestId("set-password-form");
  const setPw = async (value: string) => {
    await pw.getByLabel("New password").fill(value);
    await pw.getByLabel("Confirm password").fill(value);
    await pw.getByRole("button", { name: "Save my password" }).click();
  };
  await setPw("Kq4xz-Tm7Rp-9abW");
  await expect(pw.getByRole("alert")).toHaveText("Choose your own password, not the temporary one.");
  // Too short, then long enough but not matching: Save stays off.
  await pw.getByLabel("New password").fill("Abc1!x");
  await pw.getByLabel("Confirm password").fill("Abc1!x");
  await expect(pw.getByRole("button", { name: "Save my password" })).toBeDisabled();
  await pw.getByLabel("New password").fill("purple tiger lamp");
  await pw.getByLabel("Confirm password").fill("purple tiger lamb");
  await expect(pw.getByRole("button", { name: "Save my password" })).toBeDisabled();
  await setPw("Mine#2026-team");
  await expect(page.getByTestId("onboarding-step-name")).toBeVisible();

  // Display name: prefilled with the username, checked with the server's rule, shown live on the card.
  const setup = page.getByTestId("setup-form");
  const name = setup.getByTestId("setup-display-name");
  await expect(name).toHaveValue("NewPlayer");
  await expect(setup.getByTestId("setup-account-facts")).toContainText("NewPlayer");
  await name.fill("x");
  await expect(setup.getByTestId("setup-continue")).toBeDisabled();
  await name.fill("Mid Lane Hero");
  await expect(setup.getByTestId("setup-preview").getByTestId("card-preview")).toContainText("Mid Lane Hero");
  await setup.getByTestId("setup-continue").click();
  await expect(page.getByTestId("onboarding-step-profile")).toBeVisible();

  // Roles and champions: Finish waits for a primary role and a champion.
  const finish = setup.getByRole("button", { name: "Finish setup" });
  await expect(finish).toBeDisabled();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: "Mid" }).click();
  await expect(setup.getByTestId("primary-role-status")).toContainText("Mid");
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await expect(setup.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(setup.getByTestId("primary-pool-results")).toBeHidden();

  // The live preview follows the role and the first champion.
  await expect(setup.getByTestId("setup-preview").getByTestId("card-preview")).toContainText("Mid");
  // Back to the name step (the form's own Back), then the password step, and forward again: everything is kept.
  await setup.getByTestId("setup-back").click();
  await expect(page.getByTestId("onboarding-step-name")).toBeVisible();
  await expect(setup.getByTestId("setup-display-name")).toHaveValue("Mid Lane Hero");
  await page.getByTestId("preview-back").click();
  await expect(page.getByTestId("onboarding-step-password")).toBeVisible();
  await page.getByTestId("preview-step-profile").click();
  await expect(setup.getByTestId("primary-role-status")).toContainText("Mid");
  await expect(setup.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(1);
  await expect(finish).toBeEnabled();
  await finish.click();

  // Personalise: optional, the same card as the preview, editors described (nothing can be saved here).
  await expect(page.getByTestId("onboarding-step-personalise")).toBeVisible();
  await expect(page.getByTestId("setup-steps")).toHaveAttribute("data-current", "personalise");
  await expect(page.getByTestId("personalise-preview").getByTestId("card-preview")).toContainText("Mid Lane Hero");
  await page.getByTestId("personalise-back").click();
  await expect(page.getByTestId("onboarding-step-profile")).toBeVisible();
  await finish.click();
  await page.getByTestId("personalise-done").click();

  // Done: the summary and where they go next, for each kind of account.
  await expect(page.getByTestId("onboarding-done")).toBeVisible();
  await expect(page.getByTestId("onboarding-summary")).toContainText("Mid Lane Hero");
  await expect(page.getByTestId("onboarding-summary")).toContainText("Mid");
  await expect(page.getByTestId("onboarding-next")).toContainText("Where they go next: Team");
  await page.getByTestId("preview-kind-personal").click();
  await expect(page.getByTestId("onboarding-next")).toContainText("Where they go next: My Profile");

  // Restart: back to an empty sign-in.
  await page.getByTestId("preview-restart").click();
  await expect(page.getByTestId("onboarding-step-signin")).toBeVisible();
  await expect(page.getByTestId("login-form").getByLabel("Username")).toHaveValue("");
  await page.getByTestId("preview-step-name").click();
  await expect(page.getByTestId("setup-display-name")).toHaveValue("NewPlayer");
  await page.getByTestId("preview-step-profile").click();
  await expect(page.getByTestId("setup-form").getByTestId("primary-role-status")).toContainText("Not selected");

  // A step opens directly from its link.
  await page.goto("/preview/setup?step=done");
  await expect(page.getByTestId("onboarding-done")).toBeVisible();

  // No horizontal scroll at this size, and nothing was ever sent.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(posts).toEqual([]);
});
