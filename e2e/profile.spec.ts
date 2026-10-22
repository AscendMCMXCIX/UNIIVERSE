import { expect, test } from "./test";

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

test("the profile header: Main lineup is a status, Customise is one small control, rank has a crest", async ({ page }) => {
  await page.goto("/players");
  await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").click();
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
  await page.locator(`main a[data-testid='player-card'][data-player-name='${name}']`).click();
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
