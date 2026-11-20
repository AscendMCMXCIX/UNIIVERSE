import { expect, test, type Page } from "./test";
import { openPerson } from "./member-account";

/*
  Users & Permissions after the overhaul's S9a: one quiet list (52px rows on desktop, 64px on
  phones) with no action buttons, starting high on the page, and the person view kept in the
  address: a deep link opens it, ‹ › step without adding history, Back closes it with the list's
  scroll kept, Escape closes it and focus returns to the row. No count of sign-in sessions shows
  anywhere in it (the privacy notice: nobody in the app sees sign-in sessions). Desktop and phone;
  the tablet sits between the two and is covered by phone-wraps and quality.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "desktop and phone measure the two row heights");
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
});

const ROWS = "[data-testid=admin-player-row],[data-testid=admin-user-row],[data-testid=admin-kept-row]";

async function measure(page: Page) {
  return page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0);
    const buttons = [...document.querySelectorAll("[data-testid=players-admin] button")].filter((b) => b.getBoundingClientRect().height > 0 && !b.closest("[data-testid=status-filters]"));
    return {
      firstTop: rows[0]!.getBoundingClientRect().top + scrollY,
      heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      destructive: buttons.filter((b) => /delete|erase|deactivate|remove|reset/i.test(b.textContent ?? "")).length,
      screens: document.documentElement.scrollHeight / innerHeight,
    };
  }, ROWS);
}

test("the list starts high, its rows are one height, and it has no action buttons", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await page.goto("/admin/people");
  await expect(page.locator(ROWS).first()).toBeVisible();
  const m = await measure(page);
  expect(m.heights, "one row height").toEqual([phone ? 64 : 52]);
  expect(m.firstTop, "the first row's top").toBeLessThanOrEqual(phone ? 300 : 220);
  expect(m.destructive, "destructive buttons on the list").toBe(0);
  expect(m.screens, "screens of the page").toBeLessThanOrEqual(phone ? 2.0 : 1.3);
});

test("the person view: a deep link opens it, ‹ › replace, Back closes it, Escape returns focus", async ({ page }) => {
  await page.goto("/admin/people");
  const view = await openPerson(page, "Demo Halfway");
  await expect(page).toHaveURL(/[?&]person=/);
  const id = new URL(page.url()).searchParams.get("person")!;
  for (const section of ["person-account", "person-password", "person-access", "person-riot", "person-picture", "person-activity", "person-danger"]) await expect(view.getByTestId(section), section).toBeVisible();
  // The Danger zone stays closed until asked.
  expect(await view.getByTestId("person-danger").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  // No count of sessions, anywhere in it.
  await expect(view).not.toContainText(/\d+\s+(sign-in\s+)?sessions?/i);
  // Escape closes it, the address loses it, and focus goes back to the row.
  await page.keyboard.press("Escape");
  await expect(view).toBeHidden();
  await expect(page).not.toHaveURL(/person=/);
  await expect(page.locator(`[data-person="${id}"]`)).toBeFocused();

  // The whole list: ‹ › go to another person in the same history entry; Back closes the window.
  await page.getByTestId("people-search").fill("");
  await page.locator(`[data-person="${id}"]`).click();
  await expect(view).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await view.getByTestId("person-next").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("person")).not.toBe(id);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack();
  await expect(view).toBeHidden();
  await expect(page).not.toHaveURL(/person=/);
  await expect(page).toHaveURL(/\/admin\/people/);

  // A deep link opens it at once.
  await page.goto(`/admin/people?person=${id}`);
  await expect(page.getByTestId("person-view")).toBeVisible();
  await expect(page.getByTestId("person-view")).toContainText("Demo Halfway");
});

test("saving access keeps the person view and its address, and it still closes", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass: the router's refresh is the same at every width");
  await page.goto("/admin/people");
  const view = await openPerson(page, "Demo Halfway");
  const url = page.url();
  await view.getByTestId("open-access").click();
  await page.getByTestId("save-access").click();
  await expect(page.getByTestId("access-dialog")).toBeHidden();
  await expect(view).toBeVisible();
  await expect(page).toHaveURL(url);
  await view.getByTestId("person-view-close").click();
  await expect(view).toBeHidden();
  await expect(page).not.toHaveURL(/person=/);
});

test("Back keeps the list's scroll where it was", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone's list is the one taller than its screen");
  await page.goto("/admin/people");
  const last = page.locator(ROWS).last();
  await last.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(0);
  await expect(async () => {
    await last.click({ timeout: 2_000 });
    await expect(page.getByTestId("person-view")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.goBack();
  await expect(page.getByTestId("person-view")).toBeHidden();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 2);
});
