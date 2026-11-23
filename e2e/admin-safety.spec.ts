import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Locator, type Page } from "./test";
import { createMember, grantAdministrator, memberContext, openDanger, openPerson, view } from "./member-account";

/*
  ADMIN SAFETY (the overhaul's S1a). Admin Mode → Data & Integrations lists its jobs as Checks and
  Refresh; the setup and repair jobs and the schedule's intervals sit under a closed Advanced, for
  the Owner only, and each runs only once its phrase is typed. Users & Permissions shows the
  Production check's account locked under Kept automatically, and deleting a profile takes its name
  typed. Personal data's Import and Re-apply (what the erasure-reconcile job does) are the Owner's,
  with REAPPLY typed. Checked at 1440 and on a 375px phone, with axe, for the demo's local owner (the Owner);
  an administrator who is not the Owner is not sent the setup jobs or the intervals at all.
  Nothing is ever confirmed here: every dialog is checked, then cancelled (the server's side of each
  rule is tested in tests/db/admin-safety.test.ts). Viewport-independent apart from the two sizes
  it sets itself, so it runs on the desktop project only.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project, at the sizes it sets");
  await view(context, baseURL!, "admin");
});

const SETUP_KEYS = ["rank-schedule-off", "history-rescan", "erasure-reconcile", "verify-account", "lane-opponent-recompute"];

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), label).toEqual([]);
}

/** Opens a <details> by its summary until it is open (the page may still be hydrating). */
async function openDetails(details: Locator) {
  await expect(async () => {
    if ((await details.getAttribute("open")) === null) await details.locator("summary").first().click({ timeout: 2_000 });
    await expect(details).toHaveAttribute("open", "", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Clicks until the dialog it opens is on screen (a click before hydration does nothing). */
async function openDialog(page: Page, button: Locator, name: string | RegExp) {
  const dialog = page.getByRole("dialog", { name });
  await expect(async () => {
    if (!(await dialog.isVisible())) await button.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

async function noSidewaysScroll(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), label).toBeLessThanOrEqual(1);
}

/** The Owner's Data & Integrations at one size: lists, Advanced closed then open, both typed confirmations, axe. */
async function ownerJobs(page: Page, size: string) {
  await page.goto("/admin/data");
  const details = page.getByTestId("data-details");
  await openDetails(details);
  // The static-data diff, beside the datasets: none recorded yet, or the patch the demo read from Data Dragon with its counts (static-diff.test.ts has every state).
  await expect(details.getByTestId("static-diff").getByTestId("static-diff-line").first()).toHaveText(/^(No patch recorded yet\.|\d+\.\d+ recorded: [\d,]+ champions?, [\d,]+ items?, [\d,]+ runes?\.)$/);
  // Matchup Intel's curation priorities left with it (23 Nov 2026).
  await expect(details.getByTestId("curation-priorities")).toHaveCount(0);
  const panel = page.getByTestId("jobs-panel");
  // Checks and Refresh in view, each with its button; the costly reads say so.
  await expect(panel.getByTestId("jobs-checks").getByTestId("job-row")).not.toHaveCount(0);
  await expect(panel.getByTestId("jobs-checks").locator("[data-job=perf-probe]")).toContainText("6 MB");
  await expect(panel.getByTestId("jobs-checks").locator("[data-job=auth-audit]").getByTestId("run-job")).toHaveText(/Run check/);
  await expect(panel.getByTestId("jobs-refresh").locator("[data-job=account-sync]").getByTestId("run-job")).toHaveText(/Run now/);
  // No setup job and no interval field outside Advanced, which starts closed.
  for (const key of SETUP_KEYS) {
    await expect(panel.getByTestId("jobs-checks").locator(`[data-job=${key}]`), `${size}: ${key} not a check`).toHaveCount(0);
    await expect(panel.getByTestId("jobs-refresh").locator(`[data-job=${key}]`), `${size}: ${key} not a refresh`).toHaveCount(0);
  }
  const advanced = panel.getByTestId("jobs-advanced");
  await expect(advanced).not.toHaveAttribute("open", "");
  await expect(advanced.getByTestId("jobs-setup")).toBeHidden();
  await expect(advanced.getByTestId("schedule-editor")).toBeHidden();
  await expect(page.getByLabel("LP tracking interval in minutes")).toBeHidden();
  await axe(page, `${size}: Data & Integrations, Details open`);

  await openDetails(advanced);
  const setup = advanced.getByTestId("jobs-setup");
  await expect(setup.getByTestId("job-row")).toHaveCount(6);
  for (const key of SETUP_KEYS) await expect(setup.locator(`[data-job=${key}]`), `${size}: ${key} under Advanced`).toBeVisible();
  await expect(advanced.getByTestId("schedule-editor").getByTestId("schedule-row")).toHaveCount(7);
  await axe(page, `${size}: Advanced open`);
  await noSidewaysScroll(page, `${size}: Advanced open`);

  // A setup job: its effect in words, and Run only once TURN OFF is typed.
  const off = setup.locator("[data-job=rank-schedule-off]");
  const dialog = await openDialog(page, off.getByTestId("run-job"), "Turn off LP tracking's five-minute schedule?");
  await expect(dialog).toContainText("Removes the database's call of the rank watch every five minutes");
  const run = dialog.getByTestId("job-confirm-run");
  const phrase = dialog.getByTestId("job-confirm-input");
  await expect(run).toBeDisabled();
  await phrase.fill("TURN ON");
  await expect(run).toBeDisabled();
  await phrase.fill("turn of");
  await expect(run).toBeDisabled();
  await phrase.fill("turn off");
  await expect(run).toBeEnabled();
  await axe(page, `${size}: a setup job's typed confirmation`);
  await noSidewaysScroll(page, `${size}: a setup job's typed confirmation`);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // The schedule: 0 asks once, and Save waits for "TURN OFF rank-watch".
  const interval = page.getByLabel("LP tracking interval in minutes");
  await interval.fill("0");
  const review = await openDialog(page, advanced.getByTestId("save-schedule"), "Save the schedule?");
  await expect(review.getByTestId("schedule-confirm")).toContainText("LP tracking: every 5 min → off");
  const save = review.getByTestId("schedule-confirm-save");
  await expect(save).toBeDisabled();
  await review.locator("[data-testid=schedule-turn-off-input][data-job=rank-watch]").fill("TURN OFF integrity");
  await expect(save).toBeDisabled();
  await review.locator("[data-testid=schedule-turn-off-input][data-job=rank-watch]").fill("turn off rank-watch");
  await expect(save).toBeEnabled();
  await axe(page, `${size}: the schedule's typed confirmation`);
  await review.getByRole("button", { name: "Cancel" }).click();
  await expect(review).toBeHidden();
  await interval.fill("5");
  await expect(advanced.getByTestId("save-schedule")).toBeDisabled();
}

test("the Owner finds the setup jobs and the schedule only under Advanced, and each typed confirmation holds its button until the words match, at 1440 and on a phone", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ownerJobs(page, "1440");

  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await view(phone, baseURL!, "admin");
    await ownerJobs(await phone.newPage(), "375");
  } finally {
    await phone.close();
  }
});

test("an administrator who is not the Owner gets the checks and refreshes only: no Advanced, no setup job and no interval, not even in the page's data", async ({ browser, page: owner, baseURL }) => {
  test.setTimeout(180_000);
  let deputy: { context: BrowserContext; page: Page; username: string } | null = null;
  try {
    deputy = await memberContext(browser, owner, undefined, { base: "Deputy" });
    await owner.goto("/admin/people");
    await grantAdministrator(owner, deputy.username);

    for (const [width, height] of [[1440, 900], [375, 667]] as const) {
      await deputy.page.setViewportSize({ width, height });
      await view(deputy.context, baseURL!, "admin");
      const response = await deputy.page.goto("/admin/data");
      const html = (await response?.text()) ?? "";
      await openDetails(deputy.page.getByTestId("data-details"));
      const panel = deputy.page.getByTestId("jobs-panel");
      await expect(panel.getByTestId("jobs-checks").locator("[data-job=auth-audit]")).toBeVisible();
      await expect(panel.getByTestId("jobs-refresh").locator("[data-job=account-sync]")).toBeVisible();
      await expect(panel.getByTestId("jobs-advanced")).toHaveCount(0);
      await expect(panel.getByTestId("jobs-owner-only")).toBeVisible();
      await expect(deputy.page.getByLabel("LP tracking interval in minutes")).toHaveCount(0);
      // The server never sent them: neither the setup jobs nor their phrases are in the page.
      for (const key of SETUP_KEYS) expect(html, `${width}: ${key} sent`).not.toContain(`"${key}"`);
      expect(html).not.toContain("TURN OFF");
      await axe(deputy.page, `${width}: Data & Integrations for an administrator`);
      // Personal data: Export and Release, but importing and re-applying the records are the Owner's.
      await deputy.page.goto("/admin/people/privacy");
      const records = deputy.page.getByTestId("erasure-records");
      await expect(records.getByTestId("erasure-export")).toBeVisible();
      await expect(records.getByTestId("erasure-owner-only")).toContainText("The Owner imports and re-applies the records");
      await expect(records.getByTestId("erasure-reconcile")).toHaveCount(0);
      await expect(records.getByTestId("erasure-import")).toHaveCount(0);
      await axe(deputy.page, `${width}: Personal data for an administrator`);
    }
  } finally {
    await deputy?.context.close();
  }
});

test("Users & Permissions: the Production check's account is locked under Kept automatically, deleting a profile takes its name typed, and re-applying the erasure records REAPPLY", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // An account made for this test, so the delete dialog's profile is nobody else's.
  const { username } = await createMember(page, "Typed");
  await page.goto("/admin/people");

  // The Production check's account: its own locked group; its view offers Deactivate and Delete only.
  const kept = page.getByTestId("people-group-kept");
  await expect(kept).toContainText("Kept automatically");
  await expect(kept).toContainText("Deactivate it to turn the signed-in checks off");
  await expect(kept.getByTestId("admin-kept-row")).toHaveCount(1);
  await expect(kept.getByTestId("admin-kept-row")).toContainText("verify");
  // The stale "admin account" words are gone.
  await expect(page.getByTestId("players-admin")).not.toContainText("The admin account");
  const keptView = await openPerson(page, "verify", "admin-kept-row");
  await openDanger(keptView);
  await expect(keptView.getByRole("button", { name: "Deactivate" })).toBeVisible();
  await expect(keptView.getByTestId("delete-account")).toBeVisible();
  await expect(keptView.getByTestId("open-access")).toHaveCount(0);
  await expect(keptView.getByTestId("sign-out-everywhere")).toHaveCount(0);
  await expect(keptView.getByTestId("member-display-name")).toHaveCount(0);
  await expect(keptView.getByRole("button", { name: /Reset password|temporary password/ })).toHaveCount(0);
  await expect(keptView.getByTestId("erase-person")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(keptView).toBeHidden();

  // An account with a profile: "Delete with profile" waits for the username; the two deletes share a row.
  const member = await openPerson(page, username);
  await openDanger(member);
  const dialog = await openDialog(page, member.getByTestId("delete-account"), `Delete ${username}?`);
  const keep = dialog.getByTestId("delete-keep-profile");
  const withProfile = dialog.getByTestId("delete-with-profile");
  await expect(keep).toBeEnabled();
  await expect(withProfile).toBeDisabled();
  await dialog.getByTestId("delete-confirm-input").fill("someone-else");
  await expect(withProfile).toBeDisabled();
  await dialog.getByTestId("delete-confirm-input").fill(username.toUpperCase());
  await expect(withProfile).toBeEnabled();
  const [a, b] = [(await keep.boundingBox())!, (await withProfile.boundingBox())!];
  expect(Math.abs(a.y - b.y), "the two deletes on one row at 1440").toBeLessThanOrEqual(1);
  await axe(page, "the delete dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(member).toBeHidden();

  // A profile without an account: Delete permanently waits for its name.
  const accountless = await openPerson(page, "Demo Sub (Top)");
  await openDanger(accountless);
  const confirm = await openDialog(page, accountless.getByTestId("delete-profile"), /^Delete Demo Sub \(Top\)\?$/);
  const go = confirm.getByTestId("delete-profile-confirm");
  await expect(go).toBeDisabled();
  await confirm.getByTestId("delete-confirm-input").fill("Demo Sub");
  await expect(go).toBeDisabled();
  await confirm.getByTestId("delete-confirm-input").fill("demo sub (top)");
  await expect(go).toBeEnabled();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();

  // Personal data: Re-apply records is the erasure-reconcile job's work, so it waits for REAPPLY.
  await page.goto("/admin/people/privacy");
  const records = page.getByTestId("erasure-records");
  await expect(records.getByTestId("erasure-owner-only")).toHaveCount(0);
  await expect(records.getByTestId("erasure-import")).toBeVisible();
  const reapply = await openDialog(page, records.getByTestId("erasure-reconcile"), "Re-apply every erasure?");
  await expect(reapply).toContainText("Whatever it finds is erased for good");
  const run = reapply.getByTestId("reapply-confirm-run");
  await expect(run).toBeDisabled();
  await reapply.getByTestId("reapply-confirm-input").fill("RECOMPUTE");
  await expect(run).toBeDisabled();
  await reapply.getByTestId("reapply-confirm-input").fill(" reapply ");
  await expect(run).toBeEnabled();
  await axe(page, "Personal data's typed confirmation");
  await reapply.getByRole("button", { name: "Cancel" }).click();
  await expect(reapply).toBeHidden();
});
