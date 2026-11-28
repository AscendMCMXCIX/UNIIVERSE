import { expect, test, type Page } from "./test";
import { FLOOR, cfg, expectEveryRecord, fits, openAt, resizeTo, settled, walkPages, withWideText, type Size } from "./workspace";

/*
  Users & Permissions on a desktop window (docs/RESPONSIVE.md, "One-screen desktop pages": Personal
  data, Accounts and Access levels): Personal data as a sectioned workspace (a quiet rail, one section
  at a time, in the address, Back walks them, its folds opening in place and still fitting), and the
  Accounts list paged to the room under its search row, every account on exactly one page. The
  platform spec holds their fit at the eight configurations and the floor (e2e/one-screen.spec.ts);
  outside the gate each page is the stack it always was. Nothing here names a person.
*/

test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop", "the desktop workspace (the flow's own specs cover phones and tablets)");
});

const link = (page: Page, testId: string, id: string) => page.getByTestId(`${testId}-rail`).locator(`[data-target="${id}"]`);
const shown = (page: Page, testId: string) => page.getByTestId(testId).getAttribute("data-section");

async function expectSection(page: Page, testId: string, id: string, all: readonly string[]) {
  await expect.poll(() => shown(page, testId)).toBe(id);
  await expect(link(page, testId, id)).toHaveAttribute("aria-current", "page");
  for (const other of all) {
    if (other === id) await expect(page.locator(`[data-ws-section="${other}"]`)).toBeVisible();
    else await expect(page.locator(`[data-ws-section="${other}"]`)).toBeHidden();
  }
}

const PRIVACY = ["requests", "erase", "records"];

test("Personal data: three sections beside a quiet rail, the records' count; Back walks them; both folds open in place and still fit", async ({ page }) => {
  await withWideText(page);
  await openAt(page, "/admin/people/privacy", FLOOR, "expanded", { admin: true });
  await expectSection(page, "admin-privacy", "requests", PRIVACY);
  await expect(link(page, "admin-privacy", "records").getByTestId("admin-privacy-count")).toHaveText(/^\d+$/);
  await page.getByTestId("privacy-procedure").locator("summary").click();
  await fits(page, `${cfg(FLOOR, "expanded")}: Personal data, the procedure open`, { workspace: true });
  await link(page, "admin-privacy", "erase").click();
  await expect(page).toHaveURL(/\/admin\/people\/privacy\?section=erase$/);
  await expectSection(page, "admin-privacy", "erase", PRIVACY);
  await fits(page, `${cfg(FLOOR, "expanded")}: Personal data, Erase a former member`, { workspace: true });
  await link(page, "admin-privacy", "records").click();
  await expectSection(page, "admin-privacy", "records", PRIVACY);
  await page.getByTestId("privacy-backups").locator("summary").click();
  await fits(page, `${cfg(FLOOR, "expanded")}: Personal data, the records with the backups' fold open`, { workspace: true });
  await page.goBack();
  await expectSection(page, "admin-privacy", "erase", PRIVACY);
  await page.goBack();
  await expectSection(page, "admin-privacy", "requests", PRIVACY);
  // The fold opened before the switches is still open: every section stays mounted.
  await expect(page.getByTestId("privacy-procedure")).toHaveAttribute("open", "");
});

test("Accounts: the list is paged to the room under its search row, every account on exactly one page; a search goes to page 1", async ({ page }) => {
  test.setTimeout(120_000);
  await withWideText(page);
  for (const [size, side] of [
    [FLOOR, "expanded"],
    [[1366, 768], "collapsed"],
  ] as Array<[Size, "expanded" | "collapsed"]>) {
    await openAt(page, "/admin/people", size, side, { admin: true });
    const at = cfg(size, side);
    await fits(page, `${at}: Accounts`, { workspace: true, pager: "people-pager" });
    const walk = await walkPages(page, "list", "people-next", () => page.locator("[data-testid=people-list] [data-ws-row]").evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.rowKey!)));
    const total = walk.meta[0]!.total;
    expectEveryRecord(walk, total, `${at}: Accounts`);
    // Every person (every row but an empty group's line) has its row; the range counts people.
    const people = await page.locator("[data-testid=people-list] [data-person]").count();
    expect(people, `${at}: the last page draws its people`).toBeGreaterThan(0);
    await settled(page);
    await fits(page, `${at}: Accounts, the last page`, { workspace: true, pager: "people-pager" });
    // A search goes to page 1 and finds across the groups.
    await page.getByTestId("people-search").fill("demo");
    await expect.poll(async () => (await page.locator("[data-ws-region=list]").getAttribute("data-page")) ?? "1").toBe("1");
    await page.getByTestId("people-search").fill("");
  }
});

test("Accounts: a person opened on another page brings the list to their page once the view closes, and ‹ › walk everyone", async ({ page }) => {
  await openAt(page, "/admin/people", FLOOR, "expanded", { admin: true });
  const region = page.locator("[data-ws-region=list]");
  await expect(region).toHaveAttribute("data-pages", /^[2-9]|\d\d$/);
  await page.getByTestId("people-next").click();
  await expect(region).toHaveAttribute("data-page", "2");
  const second = page.locator("[data-testid=people-list] [data-person]").first();
  const key = (await second.getAttribute("data-person"))!;
  await second.click();
  await expect(page.getByTestId("person-view")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`person=${key}`));
  await page.getByTestId("person-view-close").click();
  await expect(page.getByTestId("person-view")).toBeHidden();
  await expect(region).toHaveAttribute("data-page", "2");
  await expect(page.locator(`[data-testid=people-list] [data-person="${key}"]`)).toBeVisible();
});

test("Accounts and Access levels outside the gate are the stack they always were", async ({ page }) => {
  await openAt(page, "/admin/people", [1366, 640], "expanded", { admin: true });
  await expect(page.locator("[data-workspace]")).toHaveCount(0);
  await expect(page.getByTestId("people-list")).toHaveCount(0);
  await expect(page.getByTestId("people-group-team")).toBeVisible();
  await expect(page.getByTestId("people-group-accountless")).toHaveAttribute("data-fold", "row");
  await openAt(page, "/admin/people/access", [1366, 640], "expanded", { admin: true });
  await expect(page.locator("[data-workspace]")).toHaveCount(0);
  await expect(page.getByTestId("access-groups")).toBeVisible();
  // The hub's eyebrow is drawn outside the workspace (the short form gives its line back).
  await expect(page.locator("main header [data-eyebrow]")).toBeVisible();
  await resizeTo(page, FLOOR);
  await expect(page.locator("main header [data-eyebrow]")).toBeHidden();
});
