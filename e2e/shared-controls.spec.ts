import { expect, test, type Locator, type Page } from "./test";

/*
  The text-led selection controls (Release 17, the owner's brief §9; docs/DESIGN_SYSTEM.md §5,
  "Text-led controls"): a segmented group, a section's views and the in-page indexes draw no outline
  and no fill round the group, and the chosen item no box of its own (no fill, no ring) but the
  accent underline under its words, inside its own box. Checked on representative pages at every
  project's width; src/app/segmented-use.test.ts keeps pages from drawing their own boxes. Every
  shared group carries the unstyled marker `ui-segmented`, every item `ui-segment`.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const CHOSEN = "[aria-checked=true], [aria-current]:not([aria-current=false]), [aria-pressed=true]";

/** The page's accent as the browser resolves it. */
const accentOf = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--color-accent)";
    document.body.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  });

const transparent = (c: string) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);

/** A group: no outline, no fill, no ring; its chosen item (if it has one) unboxed and underlined in the accent. */
async function expectFlat(group: Locator, accent: string, what: string, opts: { chosen?: boolean } = {}) {
  const look = await group.evaluate((g, sel) => {
    const s = getComputedStyle(g);
    const chosen = [...g.querySelectorAll<HTMLElement>(sel)].find((e) => e.classList.contains("ui-segment") && e.getBoundingClientRect().width > 0);
    const c = chosen ? getComputedStyle(chosen) : null;
    const after = chosen ? getComputedStyle(chosen, "::after") : null;
    const box = chosen?.getBoundingClientRect();
    return {
      border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
      fill: s.backgroundColor,
      shadow: s.boxShadow,
      chosen: c && after && box ? { fill: c.backgroundColor, shadow: c.boxShadow, border: c.borderBottomWidth, line: after.backgroundColor, lineHeight: parseFloat(after.height), lineOpacity: after.opacity, lineBottom: parseFloat(after.bottom) } : null,
    };
  }, CHOSEN);
  expect(look.border, `${what}: no outline round the group`).toEqual(["0px", "0px", "0px", "0px"]);
  expect(transparent(look.fill), `${what}: no fill behind the group (${look.fill})`).toBe(true);
  expect(look.shadow, `${what}: no ring round the group`).toBe("none");
  if (opts.chosen === false) return;
  expect(look.chosen, `${what}: a chosen item`).not.toBeNull();
  const c = look.chosen!;
  expect(transparent(c.fill), `${what}: no filled box round the chosen item (${c.fill})`).toBe(true);
  expect(c.shadow, `${what}: no ring round the chosen item`).toBe("none");
  expect(c.border, `${what}: no edge under the chosen item`).toBe("0px");
  expect(c.line, `${what}: the chosen item's underline in the accent`).toBe(accent);
  expect(c.lineOpacity, `${what}: the underline shown`).toBe("1");
  expect(c.lineHeight, `${what}: a 2px underline`).toBeGreaterThanOrEqual(2);
  expect(c.lineBottom, `${what}: drawn inside the item, never below it`).toBeGreaterThanOrEqual(0);
}

/** Every shared group shown on the page is flat (the chosen item checked where the group has one). */
async function expectAllFlat(page: Page, accent: string, where: string) {
  const groups = page.locator(".ui-segmented:visible, [role=radiogroup]:visible");
  const n = await groups.count();
  for (let i = 0; i < n; i++) {
    const g = groups.nth(i);
    const hasChosen = (await g.locator(`.ui-segment:is(${CHOSEN})`).count()) > 0;
    await expectFlat(g, accent, `${where}, group ${i + 1}`, { chosen: hasChosen ? undefined : false });
  }
  return n;
}

async function openProfile(page: Page, tab = "") {
  await page.goto("/players", { waitUntil: "networkidle" });
  const href = (await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href"))!;
  await page.goto(`${href}${tab}`, { waitUntil: "networkidle" });
}

async function openFilters(page: Page) {
  const button = page.getByRole("button", { name: /^(Refine|Filters)/ }).filter({ visible: true }).first();
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test("Profile: Ranked progress's queue, Match History's views and filters, Encounters' choices", async ({ page }) => {
  await openProfile(page);
  const a = await accentOf(page);
  if (await page.locator("#ranked-queues").isVisible()) await expectFlat(page.locator("#ranked-queues"), a, "Ranked progress's queue");
  await expectAllFlat(page, a, "Profile Overview");

  await openProfile(page, "/matches");
  await expectFlat(page.getByTestId("match-views").filter({ visible: true }).first().locator(".ui-segmented"), a, "Match History's views");
  await openFilters(page);
  const result = page.getByTestId("refine-result").filter({ visible: true }).first();
  await expect(result).toBeVisible();
  await expectFlat(result, a, "Refine's Result");
  const roles = page.getByTestId("role-filter").filter({ visible: true }).first();
  if (await roles.count()) await expectFlat(roles, a, "Refine's Role played");
  // Heights: a segment is the height of a field beside it (36px with a mouse, 44px on touch screens).
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  for (const h of await result.locator(".ui-segment").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(Math.round(h), "a segment's height").toBe(touch ? 44 : 36);

  await openProfile(page, "/matches?view=encounters");
  const relations = page.getByTestId("encounter-relations");
  await expect(relations).toBeVisible();
  await expectFlat(relations, a, "Encounters' players");
});

test("Players and All Champions: the role filter", async ({ page }) => {
  await page.goto("/players", { waitUntil: "networkidle" });
  const a = await accentOf(page);
  const roles = page.getByTestId("role-filter");
  if (await roles.isVisible()) await expectFlat(roles, a, "Players' roles");
  else {
    await openFilters(page);
    await expectFlat(page.getByTestId("role-filter").filter({ visible: true }).first(), a, "Players' roles (the Filters sheet)");
  }
  await openProfile(page, "/champions");
  await expectAllFlat(page, a, "All Champions");
  await openFilters(page);
  await expectAllFlat(page, a, "All Champions' filters");
});

test("Leaderboards' section index: underlined, no chips", async ({ page }) => {
  await page.goto("/leaderboards", { waitUntil: "networkidle" });
  const a = await accentOf(page);
  const row = page.getByTestId("leaderboards-chip-row");
  const pinned = page.getByTestId("pinned-section-index");
  // Down the page, so the pinned copy (from xl) or the phone's row shows.
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(400);
  // The phone's row is a pinned bar (its own ink and hairline): the index inside it is the group.
  const index = (await row.isVisible()) ? row.getByTestId("phone-section-index") : (await pinned.isVisible()) ? pinned : null;
  test.skip(!index, "no copy of the index shown here: below xl, or where the page does not scroll past its header, the index under the header is the way");
  const current = index!.locator(".ui-segment[aria-current]").first();
  await expect(current).toBeVisible();
  await expectFlat(index!, a, "Leaderboards' index");
});

test("Champion Intel and Settings: no boxed group", async ({ page }) => {
  await page.goto("/lookup", { waitUntil: "networkidle" });
  const a = await accentOf(page);
  await expectAllFlat(page, a, "Champion Intel");
  // Two champions: one aligned board (no switcher since 25 Nov 2026); nothing boxed there either.
  await page.goto("/lookup?champion=Ahri&champion2=Jinx", { waitUntil: "networkidle" });
  await expectAllFlat(page, a, "Champion Intel, two champions");
  await page.goto("/settings", { waitUntil: "networkidle" });
  await expectAllFlat(page, a, "Settings");
  // Its index, the row on a phone and the list from md alike (a filled list entry until the Release 17 review).
  const index = page.getByTestId("settings-index");
  await expect(index).toBeVisible();
  await expectFlat(index, a, "Settings' sections");
});

test("Admin Mode: Previews' page and screen size", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/previews", { waitUntil: "networkidle" });
  const a = await accentOf(page);
  const groups = page.getByTestId("preview-studio").getByRole("radiogroup");
  await expect(groups).toHaveCount(2);
  await expectFlat(groups.nth(0), a, "Previews' page");
  await expectFlat(groups.nth(1), a, "Previews' screen size");
  // The section tabs above (TabBar) keep their own, stronger mark: the bar in the brand gradient.
  expect(await page.getByRole("link", { name: "Previews", exact: true }).and(page.locator("[aria-current=page]")).filter({ visible: true }).first().evaluate((e) => getComputedStyle(e, "::after").backgroundImage)).toContain("gradient");
});
