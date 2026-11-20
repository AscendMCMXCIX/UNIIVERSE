import { expect, test, type Page } from "./test";
import { createMember, openPerson } from "./member-account";

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

/**
 * The plan's height target is for a list of 13 accounts (S9a). Other specs in the same run add
 * members to the demo (CI's shards share one server), so the page is measured as it would be with
 * 13 rows: each row past the 13th gives its own height back (the rows are one height, checked).
 */
const PLAN_ROWS = 13;

async function measure(page: Page) {
  return page.evaluate(([sel, planRows]) => {
    const rows = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0);
    const buttons = [...document.querySelectorAll("[data-testid=players-admin] button")].filter((b) => b.getBoundingClientRect().height > 0 && !b.closest("[data-testid=status-filters]") && b.getAttribute("role") !== "combobox");
    const extra = Math.max(0, rows.length - planRows) * rows[0]!.getBoundingClientRect().height;
    return {
      firstTop: rows[0]!.getBoundingClientRect().top + scrollY,
      heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      destructive: buttons.filter((b) => /delete|erase|deactivate|remove|reset/i.test(b.textContent ?? "")).length,
      screens: (document.documentElement.scrollHeight - extra) / innerHeight,
    };
  }, [ROWS, PLAN_ROWS] as const);
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

test("a window opened inside the person view closes alone: a confirmation's Cancel and Escape, the temporary password after a reset, and the grant's Cancel", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass: the windows close the same way at every width");
  // A member of this run's own (a reset would lock a demo account out for other specs).
  const { username } = await createMember(page, "Nested");
  await page.goto("/admin/people");
  const view = await openPerson(page, username);
  const url = page.url();
  const stays = async (what: string) => {
    await expect(view, what).toBeVisible();
    expect(page.url(), what).toBe(url);
  };

  // Sign out everywhere's confirmation, cancelled by its button and by Escape: nothing else closes.
  for (const how of ["Cancel", "Escape"] as const) {
    await view.getByTestId("sign-out-everywhere").click();
    const confirm = page.getByRole("dialog", { name: /out everywhere\?$/ });
    await expect(confirm).toBeVisible();
    if (how === "Cancel") await confirm.getByRole("button", { name: "Cancel" }).click();
    else await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();
    await stays(`after the confirmation's ${how}`);
  }

  // Reset password, confirmed: the one-time password is shown, and Done leaves the person view open.
  await view.getByTestId("person-password").getByRole("button", { name: "Reset password" }).click();
  await page.getByRole("dialog", { name: /password\?$/ }).getByTestId("confirm-dialog-confirm").click();
  const issued = page.getByRole("dialog", { name: "Temporary password" });
  await expect(issued.getByTestId("temporary-password-value")).not.toBeEmpty();
  await stays("with the temporary password shown");
  await issued.getByRole("button", { name: "Done" }).click();
  await expect(issued).toBeHidden();
  await stays("after Done");

  // Making them an administrator, cancelled at the second question: Manage access keeps its edits.
  await view.getByTestId("open-access").click();
  const access = page.getByTestId("access-dialog");
  await access.getByTestId("administrator-access").getByText("Administrator access").click();
  await page.getByTestId("save-access").click();
  // Found by its heading (opened over Manage access, the two sheets share the title's id, Dialog's
  // "dialog-title"), the innermost window holding it: it is drawn inside the person view.
  const grant = page.locator("dialog[open]").filter({ has: page.getByRole("heading", { name: /an administrator\?$/ }) }).last();
  await grant.getByRole("button", { name: "Cancel" }).click();
  await expect(grant).toBeHidden();
  await expect(access).toBeVisible();
  await stays("after the grant's Cancel");
  await page.keyboard.press("Escape");
  await expect(access).toBeHidden();
  await stays("after Manage access closed");
  await view.getByTestId("person-view-close").click();
  await expect(view).toBeHidden();
  await expect(page).not.toHaveURL(/person=/);
});

test("phone at 200% text: the person view's ‹ › and close button stay on the screen and off the name, and the name field keeps its width", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone at a large text size");
  await page.goto("/admin/people");
  await openPerson(page, "Demo Halfway");
  const id = new URL(page.url()).searchParams.get("person")!;
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    // Opened from its address, with the whole list behind it (so ‹ › are there), then the text doubled.
    await page.goto(`/admin/people?person=${id}`);
    const view = page.getByTestId("person-view");
    await expect(view.getByTestId("person-next")).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const m = await view.evaluate((d) => {
      const box = (el: Element | null) => {
        const r = el!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
      };
      const form = d.querySelector("[data-testid=member-display-name]")!;
      return { screen: innerWidth, title: box(d.querySelector("h2")), controls: ["person-prev", "person-next", "person-view-close"].map((testId) => ({ testId, ...box(d.querySelector(`[data-testid=${testId}]`)) })), field: box(form.querySelector("input")), form: box(form) };
    });
    const at = `${width}px at 200%`;
    expect(m.title.width, `${at}: the name's room`).toBeGreaterThanOrEqual(96);
    for (const c of m.controls) {
      expect(c.left, `${at}: ${c.testId} on the screen`).toBeGreaterThanOrEqual(0);
      expect(c.right, `${at}: ${c.testId} on the screen`).toBeLessThanOrEqual(m.screen);
      expect(c.left < m.title.right && c.right > m.title.left && c.top < m.title.bottom && c.bottom > m.title.top, `${at}: ${c.testId} off the name`).toBe(false);
    }
    expect(m.field.width, `${at}: the name field as wide as its form`).toBeGreaterThanOrEqual(m.form.width * 0.9);
  }
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
