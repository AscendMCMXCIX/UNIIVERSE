import { expect, test, type Page } from "./test";
import { playerEntry } from "./players";

/* My Profile pieces: All Champions sorting (both ways, filters kept) and the profile header controls. */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("All Champions: column headings sort both ways within the current filters; mastery points shown", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "the phone layout uses the Sort by control (next test)");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  test.skip((await rows.count()) < 2, "needs stored games");
  const before = new URL(page.url()).search;
  const games = () => rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  // Games: most first by default, then least first.
  const desc = await games();
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  await page.getByTestId("sort-games").click();
  const asc = await games();
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  await expect(page.getByTestId("all-champions-header").locator("[data-sort=asc]")).toHaveCount(1);
  // Mastery points: a column of its own, sorted highest first; missing values last.
  await page.getByTestId("sort-mastery").click();
  const mastery = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-mastery")).map((v) => (v ? Number(v) : null)));
  const known = mastery.filter((v): v is number => v !== null);
  expect(known).toEqual([...known].sort((a, b) => b - a));
  expect(mastery.slice(known.length).every((v) => v === null)).toBe(true);
  await expect(rows.first().getByTestId("mastery-points")).toBeVisible();
  // Sorting never touches the filters (they live in the address).
  expect(new URL(page.url()).search).toBe(before);
  // No Experience: no column, no sort, no badges or their words (mastery and the figures stay).
  await expect(page.getByTestId("sort-proficiency")).toHaveCount(0);
  await expect(page.getByTestId("all-champions-header")).not.toContainText(/Experience/i);
  await expect(page.getByTestId("all-champions")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
  // The champion's window neither.
  await rows.first().getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await expect(page.getByTestId("champion-detail-tier")).toHaveCount(0);
  await expect(page.getByTestId("champion-proficiency")).toHaveCount(0);
  await expect(page.getByTestId("champion-detail")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
});

test("All Champions on a phone: a Sort by control with a direction toggle, no sideways scrolling", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "phone only");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  test.skip((await rows.count()) < 2, "needs stored games");
  await page.locator("#all-champions-sort-by").selectOption("games");
  await page.getByTestId("all-champions-sort-dir").click();
  const asc = await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

/** All Champions as drawn: its columns, its rows' heights and role lines, and whether every heading, sort arrow and figure is whole. */
async function championTable(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const shown = (el: Element) => getComputedStyle(el).display !== "none";
    const rows = [...document.querySelectorAll<HTMLElement>("[data-testid=top-champion]")];
    const heads = [...document.querySelector("[data-testid=all-champions-header]")!.children].filter(shown).map((cell) => {
      const button = cell.querySelector("button")!;
      return { label: button.textContent!.replace(/, sorted.*/, ""), cell: box(cell), text: box(button), arrow: box(button.querySelector("svg")!) };
    });
    const line = (row: Element) => row.querySelector("[data-testid=champion-role-line]")!;
    return {
      columns: heads.length,
      heights: rows.map((r) => Math.round(box(r).height)),
      // "Support · In pool" on one line under the name, and the role's name whole.
      wrapped: rows.filter((r) => {
        const pool = line(r).querySelector("[data-testid=in-pool]");
        return !!pool && Math.abs(box(pool).top - box(line(r).firstElementChild!).top) > 4;
      }).map((r) => r.dataset.champion),
      rolesCut: rows.filter((r) => {
        const name = line(r).firstElementChild!.lastElementChild!;
        return name.scrollWidth > name.clientWidth + 1;
      }).map((r) => r.dataset.champion),
      // Each heading inside its own column, and each sort arrow (shown when sorted or pointed at) clear of the headings beside it.
      spilled: heads.filter((h) => h.text.left < h.cell.left - 0.5 || h.text.right > h.cell.right + 0.5).map((h) => h.label),
      arrowsOver: heads.flatMap((h, i) => [heads[i - 1], heads[i + 1]].filter((n) => !!n && Math.min(h.arrow.right, n.text.right) - Math.max(h.arrow.left, n.text.left) > 0.5).map((n) => `${h.label} over ${n!.label}`)),
      figuresCut: rows.flatMap((r) => [...r.children].filter((el) => shown(el) && el.tagName !== "DL" && !el.querySelector("[data-open-champion]") && el.scrollWidth > el.clientWidth + 1).map((el) => `${r.dataset.champion}: ${el.textContent}`)),
    };
  });
}

test("All Champions on tablets and computers: one compact row per champion for every role, with headings, sort arrows and figures whole", async ({ page, context, baseURL }) => {
  test.skip(test.info().project.name === "phone", "phones list each champion on two lines, its figures under it");
  // The table's columns start at a 44rem list: a 752px tablet, or a 1024px computer with the
  // sidebar open, leaves exactly that. Bottom and Support are the longest role names beside "In pool".
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  const widths = test.info().project.name === "tablet" ? [768, 752] : [1440, 1024];
  for (const name of ["Demo ADC", "Demo Support"]) {
    await page.setViewportSize({ width: widths[0]!, height: 900 });
    await page.goto("/players");
    const href = await playerEntry(page, name).first().getAttribute("href");
    await page.goto(`${href}/champions`);
    await expect(page.getByTestId("top-champion").first()).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const table = await championTable(page);
      const at = `${name} at ${width}px`;
      expect(table.columns, `${at}: Champion and seven figure columns`).toBe(8);
      expect(Math.max(...table.heights), `${at}: rows ${table.heights.join(", ")}`).toBeLessThanOrEqual(56);
      expect(table.wrapped, `${at}: "In pool" on the role's line`).toEqual([]);
      expect(table.rolesCut, `${at}: role names whole`).toEqual([]);
      expect(table.spilled, `${at}: headings inside their columns`).toEqual([]);
      expect(table.arrowsOver, `${at}: sort arrows clear of the headings beside them`).toEqual([]);
      expect(table.figuresCut, `${at}: figures whole`).toEqual([]);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the profile header: Main lineup is a status, Customise is one small control, rank has a crest", async ({ page }) => {
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  await expect(header.getByTestId("profile-rank").getByTestId("rank-emblem")).toHaveCount(1);
  const status = header.getByTestId("lineup-status");
  if (await status.count()) {
    await expect(status).toContainText("Main lineup");
    expect(await status.evaluate((e) => e.tagName)).toBe("SPAN");
  }
  const customise = header.getByTestId("customise-card");
  await expect(customise).toHaveCount(1);
  await expect(customise).toHaveAccessibleName(/Customise/);
  const box = (await customise.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(48);
});

test("whole roles reorder: drag an Off Role above the Primary Role, and move it back with the keyboard", async ({ page }) => {
  const project = test.info().project.name;
  // Each device edits its own player, chosen by name (the three share one demo database).
  const name = project === "phone" ? "Demo Support" : project === "tablet" ? "Demo Halfway" : "Demo Top";
  await page.goto("/players");
  await playerEntry(page, name).click();
  await expect(page.getByTestId("pool-editor")).toBeVisible();
  await page.getByTestId("pools-edit").click();
  const sections = page.getByTestId("role-section");
  if ((await sections.count()) < 2) {
    await page.getByTestId("add-off-role").click();
    await page.getByTestId("add-off-role-picker").getByRole("radio").and(page.locator(":not([disabled])")).first().click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  }
  const roles = () => sections.evaluateAll((els) => els.map((e) => e.getAttribute("data-role")));
  const before = await roles();
  const primaryPool = await page.getByTestId("primary-pool-list").getByTestId("pool-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));
  // Pointer: the second role's grip, dragged above the first section.
  const grip = sections.nth(1).getByTestId("role-grip");
  await grip.scrollIntoViewIfNeeded();
  const g = (await grip.boundingBox())!;
  const top = (await sections.nth(0).boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, top.y + 4, { steps: 12 });
  await expect(page.getByTestId("role-drop-line")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(roles).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  // The old Primary Role is now the first Off Role, with its whole pool in the same order.
  const offPool = await page.getByTestId("secondary-pool-list").getByTestId("pool-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));
  expect(offPool).toEqual(primaryPool);
  await page.reload();
  await expect.poll(roles).toEqual([before[1], before[0], ...before.slice(2)]);
  // Keyboard: pick up the first role, move it down one place, drop. Right after the reload the
  // markup can be there before React is listening, so Edit and the pick-up are retried until they
  // register (Space on a role that was picked up but not moved drops it in place: harmless).
  await expect(async () => {
    if ((await page.getByTestId("role-grip").count()) === 0) await page.getByTestId("pools-edit").click({ timeout: 1_000 });
    await sections.nth(0).getByTestId("role-grip").focus({ timeout: 1_000 });
    await page.keyboard.press("Space");
    await expect(page.getByTestId("role-announce")).toContainText("Picked up", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(roles).toEqual(before);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
});
