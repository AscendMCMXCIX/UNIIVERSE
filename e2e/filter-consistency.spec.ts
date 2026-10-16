import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFilterBar } from "./filters";

/*
  Layout regression for the shared filter bar on every page that has one. The same rules at every
  size, checked on the rendered page rather than in the code:
    - Folded (phones; tablets for Leaderboards): one "Filters · summary" button, the filters hidden
      until it is opened, every field 44px tall once open.
    - Inline (wide screens): no button; the filters on one baseline, every control the same height
      (36px with a mouse, 44px on touch screens).
    - Never a horizontal scroll, open or closed.
*/

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** The controls of a bar: dropdowns, segmented groups, chips and buttons placed directly in it. */
async function controlBoxes(controls: Locator) {
  return controls.evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(":scope > div > select, :scope > div > [role=radiogroup], :scope > div > nav, :scope > div > button, :scope > div > a, :scope > button, :scope > a"))
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, h: Math.round(r.height), top: Math.round(r.top), mid: r.top + r.height / 2, testId: el.dataset.testid ?? "" };
      }),
  );
}

async function checkBar(page: Page, scope: Locator, toggleTestId = "filter-toggle") {
  await expect(scope).toBeVisible();
  const toggle = scope.getByTestId(toggleTestId);
  // The bar's own markers (not its generated ids, which a re-render may change).
  const controls = scope.locator("[data-filter-controls]");
  if (await toggle.isVisible()) {
    // Folded: the button names what is chosen; nothing else shows until it is opened.
    await expect(toggle).toContainText("Filters");
    await expect(controls).toBeHidden();
    expect(Math.round((await toggle.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    await openFilterBar(scope, toggleTestId);
    await expect(controls).toBeVisible();
    for (const select of await controls.locator("select").filter({ visible: true }).all()) expect(Math.round((await select.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    await noHorizontalOverflow(page);
  } else {
    // Inline: one height (36px with a mouse, 44px on touch screens) and one baseline for the first
    // row of controls.
    await expect(controls).toBeVisible();
    const height = (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) ? 44 : 36;
    const boxes = await controlBoxes(controls);
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(Math.abs(b.h - height), `${b.tag} ${b.testId} is ${b.h}px, not ${height}px`).toBeLessThanOrEqual(1);
    const first = Math.min(...boxes.map((b) => b.top));
    const row = boxes.filter((b) => b.top - first < 8);
    const mids = row.map((b) => b.mid);
    expect(Math.max(...mids) - Math.min(...mids)).toBeLessThanOrEqual(2);
  }
  await noHorizontalOverflow(page);
}

test("every filter bar folds on phones and lines up on wide screens", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto("/players");
  const card = page.locator("main a[data-testid='player-card']").first();
  const profile = new URL((await card.getAttribute("href"))!, "http://x").pathname;
  await checkBar(page, page.getByTestId("players-filters"));

  for (const [path, testId] of [
    [profile, "overview-filters"],
    [`${profile}/champions`, "all-champions-filters"],
    [`${profile}/matches`, "match-filters"],
    [`${profile}/matchups`, "matchups-filters"],
  ] as const) {
    await page.goto(path);
    await checkBar(page, page.getByTestId(testId));
  }

  await page.goto("/leaderboards");
  const lb = page.getByTestId("leaderboard-filters");
  // Leaderboards keep the filters folded up to large screens (the board comes first on tablets).
  if (info.project.name !== "desktop") await expect(lb.getByTestId("filter-toggle")).toBeVisible();
  await checkBar(page, lb);

  await page.goto("/matches");
  await checkBar(page, page.getByTestId("together-filters"), "together-filters-toggle");

  await page.goto("/matches?view=drafted");
  await checkBar(page, page.getByTestId("drafted-filters"));
});

test("Reset appears only when something is narrowed and puts every filter back", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await page.goto("/leaderboards");
  const bar = page.getByTestId("leaderboard-filters");
  await openFilterBar(bar);
  await expect(bar.getByTestId("reset-filters")).toHaveCount(0);
  await bar.getByTestId("filter-queue").selectOption("solo");
  await expect(page).toHaveURL(/queue=solo/);
  await bar.getByTestId("filter-lineup").click();
  await expect(page).toHaveURL(/lineup=1/);
  // The folded button counts the narrowed filters.
  if (await bar.getByTestId("filter-toggle").isVisible()) await expect(bar.getByTestId("filter-toggle")).toContainText("2");
  await openFilterBar(bar);
  await bar.getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/queue=|lineup=/);
  await expect(bar.getByTestId("filter-queue")).toHaveValue("all");
  await expect(bar.getByTestId("filter-lineup")).toHaveAttribute("aria-pressed", "false");
});

test("Drafted matches apply each filter at once and say what each dropdown holds", async ({ page }) => {
  await page.goto("/matches?view=drafted");
  const bar = page.getByTestId("drafted-filters");
  await openFilterBar(bar);
  await expect(bar.getByTestId("drafted-filter-result").locator("option").first()).toHaveText("Any result");
  await bar.getByTestId("drafted-filter-result").selectOption("win");
  await expect(page).toHaveURL(/view=drafted.*result=win|result=win.*view=drafted/);
  await expect(bar.getByTestId("reset-filters")).toBeVisible();
  await bar.getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/result=/);
});
