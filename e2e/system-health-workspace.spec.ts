import { expect, test, type Page } from "./test";
import { FLOOR, cfg, fits, openAt, type Size } from "./workspace";

/*
  System Health on a desktop window (docs/RESPONSIVE.md, "One-screen desktop pages": System Health): a
  sectioned workspace (a rail, one section at a time, in the address, Back walks them), its details
  that would grow the page opening in a window that fits (page speed by device and by page, the
  recent job runs), Riot compliance open (#compliance). The platform spec holds its fit at the eight
  configurations and the floor (e2e/one-screen.spec.ts); outside the gate it is the stack it always
  was. Nothing here names a person.
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

/** The open window inside the screen, its body not scrolling (a data window fits with no inner scroll). */
async function windowFits(page: Page, testId: string, at: string) {
  const win = page.getByTestId(testId);
  await expect(win).toBeVisible();
  const m = await win.evaluate((d) => {
    const r = d.getBoundingClientRect();
    const scrolls = [d, ...d.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY + s.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    });
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, scrolls: scrolls.map((el) => el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 2).join(".")) };
  });
  expect(m.top, `${at}: the window inside the screen`).toBeGreaterThanOrEqual(0);
  expect(m.bottom, `${at}: the window inside the screen`).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
  expect(m.scrolls, `${at}: nothing in the window scrolls`).toEqual([]);
}

const SYSTEM = ["statuses", "speed", "build", "diagnostics", "environment", "compliance"];

test("System Health: each section is one rail link away, in the address; Back walks them; #compliance opens Riot compliance, open", async ({ page }) => {
  await openAt(page, "/admin/system", [1366, 768], "expanded", { admin: true });
  await expectSection(page, "system-workspace", "statuses", SYSTEM);
  for (const id of SYSTEM.slice(1)) {
    await link(page, "system-workspace", id).click();
    await expect(page).toHaveURL(new RegExp(`/admin/system\\?section=${id}$`));
    await expectSection(page, "system-workspace", id, SYSTEM);
    // The Audit Logs line under every section.
    await expect(page.getByTestId("system-audit-link")).toBeInViewport();
    await fits(page, `1366x768 expanded: System Health, ${id}`, { workspace: true });
  }
  await page.goBack();
  await expectSection(page, "system-workspace", "environment", SYSTEM);
  await page.goBack();
  await expectSection(page, "system-workspace", "diagnostics", SYSTEM);
  // An old link to the notice opens its section, the fold open.
  await page.goto("/admin/system#compliance");
  await expectSection(page, "system-workspace", "compliance", SYSTEM);
  await expect(page.getByTestId("system-compliance")).toHaveAttribute("open", "");
  await expect(page.getByTestId("system-compliance")).toContainText("Riot API keys stay on the server");
  // The flow's Technical details fold is not drawn in the workspace: its panels are sections of their own.
  await expect(page.getByTestId("system-details")).toHaveCount(0);
  // The Audit Logs line, drawn under Riot compliance, comes after it in the markup too (Tab and a screen reader follow the
  // screen), and is in the page once.
  await expect(page.getByTestId("system-audit-link")).toHaveCount(1);
  expect(await auditAfterCompliance(page), "the Audit Logs line after Riot compliance in the markup").toBe(true);
  // The section the hash opened is in the address, and survives the skip link's fragment navigation (#content).
  await expect(page).toHaveURL(/\/admin\/system\?section=compliance#compliance$/);
  await page.getByTestId("skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#content$/);
  await page.waitForTimeout(300);
  await expectSection(page, "system-workspace", "compliance", SYSTEM);
});

/** Whether the Audit Logs line comes after Riot compliance's title row in the markup. */
const auditAfterCompliance = (page: Page) =>
  page.evaluate(() => {
    const fold = document.querySelector("[data-testid=system-compliance] summary");
    const audit = document.querySelector("[data-testid=system-audit-link]");
    return !!fold && !!audit && !!(fold.compareDocumentPosition(audit) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

test("System Health: page speed's details and the recent job runs open in a window that fits, one table at a time", async ({ page }) => {
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [FLOOR, "collapsed"],
  ] as Array<[Size, "expanded" | "collapsed"]>) {
    await openAt(page, "/admin/system?section=speed", size, side, { admin: true });
    const at = cfg(size, side);
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.getByTestId("field-performance-window-open").click();
    const win = page.getByTestId("field-performance-window-window");
    await expect(win.getByTestId("field-performance-window-views")).toBeVisible();
    await expect(win.getByTestId("field-metric-LCP")).toBeVisible();
    await windowFits(page, "field-performance-window-window", `${at}: page speed, by device`);
    await win.getByTestId("field-performance-window-view").filter({ hasText: "By page" }).click();
    await expect(win.getByTestId("field-performance-window-view").filter({ hasText: "By page" })).toHaveAttribute("aria-pressed", "true");
    await expect(win.locator("[data-testid^=field-page-]").first()).toBeVisible();
    await windowFits(page, "field-performance-window-window", `${at}: page speed, by page`);
    expect(await page.evaluate(() => document.documentElement.scrollHeight), `${at}: the window does not grow the page`).toBe(before);
    await page.keyboard.press("Escape");
    await expect(win).toBeHidden();
    await expect(page.getByTestId("field-performance-window-open")).toBeFocused();

    await link(page, "system-workspace", "diagnostics").click();
    await page.getByTestId("diagnostics-runs-open").click();
    const runs = page.getByTestId("diagnostics-runs-window");
    await expect(runs.locator("tbody tr").first()).toBeVisible();
    await windowFits(page, "diagnostics-runs-window", `${at}: recent job runs`);
    await page.keyboard.press("Escape");
    await expect(runs).toBeHidden();
  }
});

test("System Health outside the gate is the stack it always was: Technical details and Riot compliance folds, the job runs inline", async ({ page }) => {
  await openAt(page, "/admin/system", [1366, 640], "expanded", { admin: true });
  await expect(page.locator("[data-workspace]")).toHaveCount(0);
  await expect(page.getByTestId("system-workspace-rail")).toBeHidden();
  const details = page.getByTestId("system-details");
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("system-compliance")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("field-performance-details")).toBeVisible();
  await details.locator("summary").first().click();
  await expect(details.getByRole("region", { name: "Recent job runs" })).toBeVisible();
  await expect(page.getByTestId("diagnostics-runs-open")).toBeHidden();
  // The Audit Logs line before Riot compliance, as always, once.
  await expect(page.getByTestId("system-audit-link")).toHaveCount(1);
  await expect(page.getByTestId("system-audit-link")).toBeVisible();
  expect(await auditAfterCompliance(page), "the Audit Logs line before Riot compliance in the flow").toBe(false);
});

