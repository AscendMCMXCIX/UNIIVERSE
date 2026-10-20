import { expect, test, type Locator } from "@playwright/test";

/*
  Team Overview: the card shows the role the player holds in the lineup, with Main Role when that
  is their Primary Role and Off Role otherwise (never their preferred role), Support shows average vision where
  other roles show CS/min, and the Players directory previews the Primary Role only.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("Support shows average vision instead of CS/min; the other roles keep CS/min", async ({ page }) => {
  await page.goto("/team");
  const support = page.getByTestId("lineup-row-SUPPORT");
  await expect(support.getByTestId("assigned-role")).toHaveText(/Support/i);
  await expect(support.getByTestId("card-vision")).toBeVisible();
  await expect(support.getByTestId("card-cs")).toHaveCount(0);
  for (const role of ["TOP", "JUNGLE", "MID", "ADC"]) {
    await expect(page.getByTestId(`lineup-row-${role}`).getByTestId("card-cs")).toBeVisible();
    await expect(page.getByTestId(`lineup-row-${role}`).getByTestId("card-vision")).toHaveCount(0);
  }
  // Every assigned player carries exactly one badge: Main Role in their Primary Role, else Off Role
  // (other tests share the demo roster and may have changed someone's roles, so the expectation
  // comes from the card itself).
  for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]) {
    const card = page.getByTestId(`lineup-row-${role}`);
    if (!(await card.getAttribute("data-player-id"))) continue;
    const off = (await card.getAttribute("data-off-role")) === "true";
    await expect(card.getByTestId("off-role-badge")).toHaveCount(off ? 1 : 0);
    await expect(card.getByTestId("main-role-badge")).toHaveCount(off ? 0 : 1);
    await expect(card.getByTestId("card-fit").locator("[data-status]")).toHaveCount(1);
  }
});

test("a player put in a role that is not their Primary Role shows Off Role, not their preference", async ({ page }) => {
  await page.goto("/team");
  await page.getByTestId("edit-lineup").click();
  const labels: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" };
  // Moving a player who already holds another place empties that place: note the whole lineup so
  // it can be put back exactly (later tests share this demo roster).
  const lineupBefore: Record<string, { id: string | null; name: string | null }> = {};
  for (const role of Object.keys(labels)) {
    const card = page.getByTestId(`lineup-row-${role}`);
    lineupBefore[role] = { id: await card.getAttribute("data-player-id"), name: await card.getAttribute("data-player-name") };
  }
  // A choice in a role's sheet changes nothing until it is saved.
  const choose = async (role: string, option: Locator) => {
    await option.click();
    await page.getByTestId(`lineup-sheet-${role}`).getByTestId("lineup-sheet-save").click();
    await expect(page.getByTestId(`lineup-sheet-${role}`)).toBeHidden();
  };
  const restoreLineup = async () => {
    for (const [role, label] of Object.entries(labels)) {
      const before = lineupBefore[role]!;
      const card = page.getByTestId(`lineup-row-${role}`);
      if (!before.id || (await card.getAttribute("data-player-id")) === before.id) continue;
      await page.getByRole("button", { name: new RegExp(`^(Change|Assign) ${label} player$`) }).click();
      await choose(role, page.getByTestId(`lineup-sheet-${role}`).locator(`[data-testid="lineup-option"][data-player-name="${before.name}"]`));
      await expect(card).toHaveAttribute("data-player-id", before.id);
    }
  };
  for (const [role, label] of Object.entries(labels)) {
    const card = page.getByTestId(`lineup-row-${role}`);
    const original = await card.getAttribute("data-player-id");
    const open = async () => {
      await page.getByRole("button", { name: `Change ${label} player` }).click();
      const sheet = page.getByTestId(`lineup-sheet-${role}`);
      await expect(sheet).toBeVisible();
      return sheet;
    };
    let sheet = await open();
    const candidate = sheet.getByTestId("lineup-option").filter({ hasText: /off role|out of role/ }).first();
    if ((await candidate.count()) === 0) {
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      continue;
    }
    await choose(role, candidate);
    await expect(card.getByTestId("off-role-badge")).toBeVisible();
    await expect(card.getByTestId("main-role-badge")).toHaveCount(0);
    await expect(card.getByTestId("assigned-role")).toHaveText(new RegExp(label, "i"));
    await expect(card.getByTestId("card-fit")).not.toContainText(/prefers|Primary Role/);
    // Put the original player back.
    sheet = await open();
    await choose(role, sheet.getByTestId("lineup-option").filter({ hasText: /primary role/ }).first());
    await expect(card).toHaveAttribute("data-player-id", original!);
    await expect(card.getByTestId("off-role-badge")).toHaveCount(0);
    await expect(card.getByTestId("main-role-badge")).toBeVisible();
    await restoreLineup();
    return;
  }
  test.skip(true, "the demo roster has nobody who lists a lineup role as an Off Role");
});

test("a role's sheet works from the keyboard: one tab stop, arrow keys move the choice, Cancel keeps the lineup", async ({ page }) => {
  await page.goto("/team");
  await page.getByTestId("edit-lineup").click();
  const card = page.getByTestId("lineup-row-TOP");
  const before = await card.getAttribute("data-player-id");
  await page.getByRole("button", { name: "Change Top player" }).click();
  const sheet = page.getByTestId("lineup-sheet-TOP");
  await expect(sheet).toBeVisible();
  // The group is one stop in the tab order: the current choice.
  expect(await sheet.getByRole("radio").evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
  const current = sheet.getByRole("radio", { checked: true });
  await expect(current).toHaveAttribute("tabindex", "0");
  const was = await current.getAttribute("data-player-name");
  await current.focus();
  await page.keyboard.press("ArrowDown");
  const next = sheet.getByRole("radio", { checked: true });
  await expect(next).toBeFocused();
  expect(await next.getAttribute("data-player-name")).not.toBe(was);
  await page.keyboard.press("ArrowUp");
  await expect(sheet.getByRole("radio", { checked: true })).toHaveAttribute("data-player-name", was!);
  // Nothing is saved until Save: Cancel leaves the lineup as it was.
  await page.keyboard.press("ArrowDown");
  await sheet.getByTestId("lineup-sheet-cancel").click();
  await expect(sheet).toBeHidden();
  await expect(card).toHaveAttribute("data-player-id", before!);
});

test("the Players directory previews only the Primary Role's champions", async ({ page }) => {
  await page.goto("/players");
  const card = page.locator("main [data-testid='player-card-item'][data-player-name='Demo Top']");
  const label = (await card.getByTestId("directory-primary-role").textContent()) ?? "";
  const primaryCount = Number(/(\d+) champions?/.exec(label)?.[1] ?? 0);
  expect(primaryCount).toBeGreaterThan(0);
  const portraits = await card.getByTestId("directory-pool").locator("[title]").count();
  expect(portraits).toBe(Math.min(primaryCount, 7));
  // The full profile still has every role: the Primary Role's pool matches, Off Roles are there too.
  await card.click();
  await expect(page.getByTestId("primary-pool-list").getByTestId("pool-item")).toHaveCount(primaryCount);
});
