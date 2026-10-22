import { expect, test } from "./test";
import { createMember, memberContext, signIn, view } from "./member-account";

/*
  PERMANENT ERASURE in Admin Mode → Users & Permissions, always on an account made for the test
  (never a demo player other tests read). The dialog shows what would change before anything
  does, erases only once the username is typed and the permanence acknowledged, and leaves a
  reference that names no one, in the Personal data records and the admin log, where the
  person's name no longer appears. The erased account can no longer sign in. The Owner and the
  administrator's own account are never offered for erasure, and a member who is not an
  administrator cannot reach any of it. What erasure does to the data is tested against the
  database in tests/db/privacy-erasure.test.ts.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await view(context, baseURL!, "admin");
});

test("an administrator erases a member's personal data after seeing what changes and confirming it; a reference stays, never the name", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one pass: it changes the shared demo database");
  const { username, temporary } = await createMember(page, "Erase");
  await page.goto("/admin/people");
  const row = page.getByTestId("admin-player-row").filter({ hasText: `@${username}` });
  await expect(row).toHaveCount(1);
  // Deactivate and Delete keep data; Erase is its own action, and says it is permanent before anything happens.
  await row.getByTestId("erase-person").click();
  const dialog = page.getByRole("dialog", { name: `Erase ${username}'s personal data?` });
  await expect(dialog).toContainText("cannot be undone");
  const preview = dialog.getByTestId("erasure-preview");
  await expect(preview).toContainText("Their account and every signed-in session are removed.");
  await expect(preview).toContainText(`${username}#OCE`);
  await expect(preview).toContainText("Encrypted backups made before now keep this information until they expire");
  const confirm = dialog.getByTestId("erasure-confirm");
  await expect(confirm).toBeDisabled();
  // The wrong name, or no acknowledgement, erases nothing.
  await dialog.getByTestId("erasure-confirm-input").fill("someone-else");
  await dialog.getByTestId("erasure-understood").check();
  await expect(confirm).toBeDisabled();
  await dialog.getByTestId("erasure-understood").uncheck();
  await dialog.getByTestId("erasure-confirm-input").fill(username);
  await expect(confirm).toBeDisabled();
  await dialog.getByTestId("erasure-understood").check();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const done = page.getByTestId("erasure-done");
  await expect(done).toContainText(/Reference ER-[A-Z2-9]{6}/);
  const reference = (await done.innerText()).match(/ER-[A-Z2-9]{6}/)![0];
  await done.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("admin-player-row").filter({ hasText: `@${username}` })).toHaveCount(0);

  // The record names no one.
  await page.goto("/admin/people/privacy");
  await expect(page.getByTestId("erasure-record").filter({ hasText: reference })).toContainText("In force");
  await expect(page.getByTestId("admin-privacy")).not.toContainText(username);
  // The admin log keeps the reference, and the earlier entries name them "Erased member".
  await page.goto("/admin/audit");
  const activity = page.getByTestId("admin-activity");
  await expect(activity.getByTestId("admin-activity-row").first()).toContainText("Permanently erased a person's personal data");
  await expect(activity.getByTestId("admin-activity-row").first()).toContainText(reference);
  await expect(activity).not.toContainText(username);
  await page.getByTestId("audit-category-privacy").click();
  await expect(page).toHaveURL(/category=privacy/);
  await expect(activity.getByTestId("admin-activity-row").first()).toContainText(reference);

  // The erased account cannot sign in any more.
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`${baseURL}/public`);
  await signIn(guest, username, temporary);
  await expect(guest.getByText("Username or password not recognised.")).toBeVisible();
  await context.close();
});

test("the Owner and the administrator's own account are never offered for erasure", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  await page.goto("/admin/people");
  // The demo's local owner is the administrator here, and the Owner: their row has no Erase.
  const own = page.getByTestId("admin-user-row").filter({ hasText: "(you)" });
  await expect(own).toHaveCount(1);
  await expect(own).toContainText("Owner");
  await expect(own.getByTestId("erase-person")).toHaveCount(0);
});

test("a member who is not an administrator cannot open Personal data", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for permissions");
  await admin.goto("/admin/people");
  const member = await memberContext(browser, admin, undefined, { base: "NoErase" });
  await member.page.goto("/admin/people/privacy");
  await expect(member.page.getByTestId("admin-privacy")).toHaveCount(0);
  await expect(member.page.getByTestId("erase-former")).toHaveCount(0);
  await member.context.close();
});
