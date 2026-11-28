import { expect, test, type Page } from "./test";
import { createMember, openDanger, openPerson } from "./member-account";
import { FLOOR, cfg, expectEveryRecord, fits, openAt, region, resizeTo, settled, walkBack, walkPages, withWideText, type Size } from "./workspace";

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

/** The tops of the controls Tab reaches inside `root`, in the markup's order (closed windows aside). */
const tabTops = (page: Page, root: string) =>
  page.locator(root).evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("a[href], button, summary, input, select, textarea, [tabindex]")]
      .filter((c) => c.tabIndex >= 0 && c.getClientRects().length > 0 && !c.closest("dialog:not([open])"))
      .map((c) => Math.round(c.getBoundingClientRect().top)),
  );

/** Each control drawn no higher than the one before it in the markup (2px for a line's controls of different heights). */
function expectTopDown(tops: number[], at: string) {
  expect(tops.length, `${at}: controls found`).toBeGreaterThan(2);
  for (let i = 1; i < tops.length; i++) expect(tops[i]!, `${at}: ${JSON.stringify(tops)}`).toBeGreaterThanOrEqual(tops[i - 1]! - 2);
}

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

test("Personal data: with records, they are paged to the room under the actions, the card to the frame's foot", async ({ page }) => {
  test.setTimeout(120_000);
  // An erasure makes a record (an account made for this test, erased from its view).
  const { username } = await createMember(page, "Record");
  await page.goto("/admin/people");
  const view = await openPerson(page, username);
  await openDanger(view);
  await view.getByTestId("erase-person").click();
  const dialog = page.getByRole("dialog", { name: `Erase ${username}'s personal data?` });
  await expect(dialog.getByTestId("erasure-preview")).toBeVisible();
  await dialog.getByTestId("erasure-confirm-input").fill(username);
  await dialog.getByTestId("erasure-understood").check();
  await dialog.getByTestId("erasure-confirm").click();
  await page.getByTestId("erasure-done").getByRole("button", { name: "Done" }).click();
  await withWideText(page);
  for (const [size, side] of [
    [FLOOR, "expanded"],
    [[1920, 1080], "collapsed"],
  ] as Array<[Size, "expanded" | "collapsed"]>) {
    await openAt(page, "/admin/people/privacy?section=records", size, side, { admin: true });
    const at = cfg(size, side);
    await expect(page.locator("[data-ws-region=list]")).toHaveAttribute("data-total", /^[1-9]\d*$/);
    await expect(page.getByTestId("erasure-records-pager")).toBeVisible();
    await expect(page.getByTestId("erasure-record").first()).toBeVisible();
    await fits(page, `${at}: Personal data, the records`, { workspace: true, pager: "erasure-records-pager" });
    // Tab and a screen reader follow the screen: the fold, the actions, then the records and their pager, top to bottom in the
    // markup too (until 28 Nov 2026 the records came first in the markup, drawn last by a CSS order).
    expectTopDown(await tabTops(page, '[data-ws-section="records"]'), `${at}: the records' controls in the markup in the order drawn`);
    // The backups' fold opened above the records: fewer rows, never a taller page.
    await page.getByTestId("privacy-backups").locator("summary").click();
    await settled(page);
    await fits(page, `${at}: Personal data, the records with the backups' fold open`, { workspace: true, pager: "erasure-records-pager" });
    const walk = await walkPages(page, "list", "erasure-records-next", () => page.getByTestId("erasure-record").evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.rowKey!)));
    expectEveryRecord(walk, walk.meta[0]!.total, `${at}: Personal data's records`);
  }
  // A record's Release confirmation is drawn inside its row: the list's page keys are not its (until 28 Nov 2026 the list took
  // PageUp/PageDown/Home/End pressed on its buttons, PageDown turning the page and unmounting the open confirmation with it).
  await page.getByTestId("erasure-record").filter({ has: page.getByTestId("erasure-release") }).first().getByTestId("erasure-release").click();
  const confirm = page.getByRole("dialog", { name: /^Release / });
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __keys: string[] }).__keys = [];
    document.addEventListener("keydown", (e) => (window as unknown as { __keys: string[] }).__keys.push(`${e.key}:${e.defaultPrevented}`));
  });
  await confirm.getByRole("button", { name: "Cancel" }).focus();
  for (const key of ["PageDown", "PageUp", "Home", "End"]) await page.keyboard.press(key);
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys), "the confirmation's keys left to it").toEqual(["PageDown:false", "PageUp:false", "Home:false", "End:false"]);
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
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

/** The Accounts list's lines (its people and an empty group's line), as its region counts them at the floor. */
async function accountLines(page: Page): Promise<number> {
  await openAt(page, "/admin/people", FLOOR, "expanded", { admin: true });
  return (await region(page, "list"))!.total;
}

test("Accounts with more accounts than the demo's: the pages are cut once for the room, Next never repeats or skips a line, Previous comes back to the same pages", async ({ page }) => {
  test.setTimeout(240_000);
  // A CI shard's server holds the accounts its earlier specs made: 16 lines on 28 Nov 2026 (run 46125624658), where page 2,
  // drawing more group headings than page 1, measured fewer lines a page, and the list moved to the page holding its first
  // line at that size: the walk drew page 1's last two lines again. Made here as other specs make them, up to 16 lines.
  for (let n = 0; n < 8 && (await accountLines(page)) < 16; n++) await createMember(page, "Pages");
  await withWideText(page);
  for (const [size, side] of [
    [FLOOR, "expanded"],
    [[1366, 768], "collapsed"],
  ] as Array<[Size, "expanded" | "collapsed"]>) {
    await openAt(page, "/admin/people", size, side, { admin: true });
    const at = cfg(size, side);
    // Each page fits its room (none taller for its headings), and its lines are read once it has.
    const read = async () => {
      const n = (await region(page, "list"))!.page;
      await fits(page, `${at}: Accounts, page ${n}`, { workspace: true, pager: "people-pager" });
      return page.locator("[data-testid=people-list] [data-ws-row]").evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.rowKey!));
    };
    const walk = await walkPages(page, "list", "people-next", read);
    expect(walk.meta[0]!.total, `${at}: the lines made`).toBeGreaterThanOrEqual(16);
    expect(walk.pages.length, `${at}: several pages`).toBeGreaterThan(1);
    expectEveryRecord(walk, walk.meta[0]!.total, `${at}: Accounts`);
    const back = await walkBack(page, "list", "people-prev", read);
    expect(back.pages, `${at}: Previous comes back to the pages Next showed`).toEqual([...walk.pages].reverse());
    // A resize cuts the pages again, once, and keeps the first line shown before it on the screen.
    await page.getByTestId("people-next").click();
    await expect.poll(async () => (await region(page, "list"))?.page).toBe(2);
    for (const other of [[1366, 900] as Size, size]) {
      const first = (await read())[0]!;
      await resizeTo(page, other);
      await expect(page.locator(`[data-testid=people-list] [data-row-key="${first}"]`), `${at} → ${other.join("x")}: the first line shown is still drawn`).toBeVisible();
      await fits(page, `${at} → ${other.join("x")}: Accounts`, { workspace: true });
    }
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

test("Accounts: a person view stepped with ‹ › to someone on another page gives the focus back to that person's row as it closes", async ({ page }) => {
  await openAt(page, "/admin/people", FLOOR, "expanded", { admin: true });
  const region = page.locator("[data-ws-region=list]");
  await expect(region).toHaveAttribute("data-pages", /^[2-9]|\d\d$/);
  await expect(region).toHaveAttribute("data-page", "1");
  await page.locator("[data-testid=people-list] [data-person]").first().click();
  const view = page.getByTestId("person-view");
  await expect(view).toBeVisible();
  // Step until the person shown is on page 2: the list follows them, and the row that opened the view leaves the page.
  for (let i = 0; i < 40 && (await region.getAttribute("data-page")) === "1"; i++) {
    const before = page.url();
    await view.getByTestId("person-next").click();
    await expect.poll(() => page.url()).not.toBe(before);
  }
  await expect(region).toHaveAttribute("data-page", "2");
  const key = new URL(page.url()).searchParams.get("person")!;
  expect(key, "the person shown is in the address").toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(view).toBeHidden();
  // Until 28 Nov 2026 the focus fell to the page's body (the opener, a row on page 1, had been drawn away).
  await expect(page.locator(`[data-testid=people-list] button[data-person="${key}"]`)).toBeFocused();
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
