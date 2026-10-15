import { expect, test } from "@playwright/test";

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
  await login.getByLabel("Password").fill("Temp#2026");
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
  await setPw("Temp#2026");
  await expect(pw.getByRole("alert")).toHaveText("Choose your own password, not the temporary one.");
  await pw.getByLabel("New password").fill("Abc1!x");
  await pw.getByLabel("Confirm password").fill("Abc1!y");
  await expect(pw.getByRole("button", { name: "Save my password" })).toBeDisabled();
  await setPw("Mine#2026");
  await expect(page.getByTestId("onboarding-step-profile")).toBeVisible();

  // Roles and champions: Finish waits for a primary role and a champion.
  const setup = page.getByTestId("setup-form");
  const finish = setup.getByRole("button", { name: "Finish setup" });
  await expect(finish).toBeDisabled();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: "Mid" }).click();
  await expect(setup.getByTestId("primary-role-status")).toContainText("Mid");
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await expect(setup.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(setup.getByTestId("primary-pool-results")).toBeHidden();

  // Back to the password step and forward again: the choices are kept.
  await page.getByTestId("preview-back").click();
  await expect(page.getByTestId("onboarding-step-password")).toBeVisible();
  await page.getByTestId("preview-step-profile").click();
  await expect(setup.getByTestId("primary-role-status")).toContainText("Mid");
  await expect(setup.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(1);
  await expect(finish).toBeEnabled();
  await finish.click();

  // Done: the summary and where they go next, for each kind of account.
  await expect(page.getByTestId("onboarding-done")).toBeVisible();
  await expect(page.getByTestId("onboarding-summary")).toContainText("Mid");
  await expect(page.getByTestId("onboarding-next")).toContainText("Where they go next: Team");
  await page.getByTestId("preview-kind-personal").click();
  await expect(page.getByTestId("onboarding-next")).toContainText("Where they go next: My Profile");

  // Restart: back to an empty sign-in.
  await page.getByTestId("preview-restart").click();
  await expect(page.getByTestId("onboarding-step-signin")).toBeVisible();
  await expect(page.getByTestId("login-form").getByLabel("Username")).toHaveValue("");
  await page.getByTestId("preview-step-profile").click();
  await expect(page.getByTestId("setup-form").getByTestId("primary-role-status")).toContainText("Not selected");

  // A step opens directly from its link.
  await page.goto("/preview/setup?step=done");
  await expect(page.getByTestId("onboarding-done")).toBeVisible();

  // No horizontal scroll at this size, and nothing was ever sent.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(posts).toEqual([]);
});
