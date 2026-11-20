import { expect, test, type Locator, type Page } from "./test";
import { pick, valueOf } from "./select";
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

/** `toggleIn`: where the folded button is, when not in the bar (All Champions on a phone: the list's own search and sort row). */
async function checkBar(page: Page, scope: Locator, toggleTestId = "filter-toggle", toggleIn: Locator = scope) {
  // (A bar whose button is elsewhere can have nothing of its own on screen: no chips.)
  await expect(toggleIn).toBeVisible();
  const toggle = toggleIn.getByTestId(toggleTestId);
  // The bar's own markers (not its generated ids, which a re-render may change).
  const controls = scope.locator("[data-filter-controls]");
  if (await toggle.isVisible()) {
    // Folded: the button names what is chosen; nothing else shows until it is opened.
    await expect(toggle).toContainText("Filters");
    await expect(controls).toBeHidden();
    expect(Math.round((await toggle.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    await openFilterBar(toggleIn, toggleTestId);
    await expect(controls).toBeVisible();
    for (const select of await controls.locator("select").filter({ visible: true }).all()) expect(Math.round((await select.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    await noHorizontalOverflow(page);
  } else {
    // Inline: one height (36px with a mouse, 44px on touch screens) and one baseline for the first
    // row of controls.
    await expect(controls).toBeVisible();
    const height = (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) ? 44 : 36;
    // The controls are laid out once the page has settled (a slow machine can still be streaming
    // or hydrating the bar right after the navigation), so wait for them rather than measure once.
    const where = `${await scope.getAttribute("data-testid")} on ${new URL(page.url()).pathname}`;
    await expect.poll(async () => (await controlBoxes(controls)).length, { message: `inline controls of ${where}` }).toBeGreaterThan(0);
    const boxes = await controlBoxes(controls);
    for (const b of boxes) expect(Math.abs(b.h - height), `${b.tag} ${b.testId} in ${where} is ${b.h}px, not ${height}px`).toBeLessThanOrEqual(1);
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
  const card = page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']");
  const profile = new URL((await card.getAttribute("href"))!, "http://x").pathname;
  await checkBar(page, page.getByTestId("players-filters"));

  for (const [path, testId] of [
    [profile, "overview-filters"],
    [`${profile}/champions`, "all-champions-filters"],
    [`${profile}/matches`, "match-filters"],
  ] as const) {
    await page.goto(path);
    // All Champions on a phone: Filters is in the list's own row (PLAN §S2b), its sheet still the bar's.
    const phoneRow = info.project.name === "phone" && testId === "all-champions-filters";
    if (phoneRow) await expect(page.getByTestId("all-champions-toolbar").getByTestId("filter-toggle")).toBeVisible();
    await checkBar(page, page.getByTestId(testId), "filter-toggle", phoneRow ? page.getByTestId("all-champions-toolbar") : undefined);
  }

  await page.goto("/matches");
  await checkBar(page, page.getByTestId("together-filters"), "together-filters-toggle");
});

test("opened from the pinned row on a tablet and a desktop, the sheet labels every field and holds the only copy of each id", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "phones open the sheet from the page's own Filters or the top bar (mobile-nav.spec.ts)");
  // A window short enough for each page to scroll its toolbar away, tall enough to pin (over 480px).
  // (The demo's Players and All Champions, nine players and eight champions, fit it whole: their rows
  // never need their compact controls at these widths.)
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
  await page.goto("/players");
  const card = page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']");
  const profile = new URL((await card.getAttribute("href"))!, "http://x").pathname;
  for (const [path, sheetId, more, picker] of [
    [profile, "filter-sheet", false, false],
    [`${profile}/matches`, "filter-sheet", true, false],
    ["/matches", "together-filters-sheet", false, true],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      for (let at = 0; at < document.documentElement.scrollHeight; at += 240) {
        window.scrollTo(0, at);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.getByTestId("toolbar-filters").click();
    const sheet = page.getByTestId(sheetId);
    await expect(sheet, path).toBeVisible();
    // Match History's Refine keeps its less used fields behind More filters in the sheet, as on a
    // phone: closed at first, every one of them there once it is opened.
    if (more) {
      const toggle = sheet.getByTestId("refine-more");
      await expect(toggle, path).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(toggle, path).toHaveAttribute("aria-expanded", "true");
    }
    // Every field's label shows (not left to screen readers as in the inline row), above its field.
    const labels = await sheet.locator("[data-filter-controls] [data-filter-label]").evaluateAll((els) => els.map((el) => ({ text: (el.textContent ?? "").trim(), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })));
    expect(labels.length, `${path}: labels`).toBeGreaterThan(0);
    for (const l of labels) expect(l.w > 1 && l.h > 1, `${path}: the label "${l.text}" shows`).toBe(true);
    // Team Matches' Played with takes the sheet's width as its selects do (inline from md it keeps to its own).
    // Measured once the sheet has finished opening (it scales in from 0.97 over 180ms) and in one frame:
    // read in two calls during that animation, the two boxes came out 2px apart on CI.
    if (picker) {
      await expect(async () => expect(await sheet.evaluate((d) => d.getAnimations().length)).toBe(0)).toPass();
      const widths = await sheet.evaluate((d) => ({ button: d.querySelector("[data-testid=together-with-button]")!.getBoundingClientRect().width, select: d.querySelector("[data-testid=together-queue]")!.getBoundingClientRect().width }));
      expect(Math.abs(widths.button - widths.select), `${path}: Played with is as wide as Game mode`).toBeLessThanOrEqual(1);
    }
    // One copy of each id on the page: the fields are in the sheet, not also in the row.
    const ids = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((e) => e.id).filter((id, i, all) => all.indexOf(id) !== i));
    expect(ids, `${path}: ids found twice`).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  }
});

test("Team Matches' Bookmarked ends the filter row at the controls' height: 36px with a mouse, 44px on a touch screen", async ({ page }) => {
  await page.goto("/matches");
  const phone = (page.viewportSize()?.width ?? 0) < 768;
  // On a phone beside the folded Filters button (the bar's own end); from md after the inline filters.
  const saved = page.getByTestId(phone ? "together-saved-phone" : "together-saved");
  await expect(saved).toBeVisible();
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(Math.round((await saved.boundingBox())!.height)).toBe(coarse ? 44 : 36);
  const control = page.getByTestId(phone ? "together-filters-toggle" : "together-queue");
  const [s, c] = [(await saved.boundingBox())!, (await control.boundingBox())!];
  expect(Math.abs(s.y + s.height / 2 - (c.y + c.height / 2)), "on the filter row's line").toBeLessThanOrEqual(2);
  expect(s.x, "after the filters").toBeGreaterThan(c.x + c.width);
  await expect(page.getByTestId(phone ? "together-saved" : "together-saved-phone")).toBeHidden();
  await noHorizontalOverflow(page);
});

test("Reset appears only when something is narrowed and puts every filter back", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  // Team → Matches: the game mode and the team members in the game are filters with defaults.
  await page.goto("/matches");
  const bar = page.getByTestId("together-filters");
  const toggle = "together-filters-toggle";
  await openFilterBar(bar, toggle);
  await expect(bar.getByTestId("reset-filters")).toHaveCount(0);
  await pick(bar.getByTestId("together-queue"), "solo");
  await expect(page).toHaveURL(/queue=solo/);
  await openFilterBar(bar, toggle);
  await pick(bar.getByTestId("together-min"), "3");
  await expect(page).toHaveURL(/min=3/);
  // The folded button counts the narrowed filters.
  if (await bar.getByTestId(toggle).isVisible()) await expect(bar.getByTestId(toggle)).toContainText("2");
  await openFilterBar(bar, toggle);
  await bar.getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/queue=|min=/);
  await expect.poll(() => valueOf(bar.getByTestId("together-queue"))).toBe("all");
  await expect.poll(() => valueOf(bar.getByTestId("together-min"))).toBe("2");
});
