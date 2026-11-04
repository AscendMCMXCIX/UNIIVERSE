import { expect, test, type Page } from "./test";

/*
  A ranked game's LP on its card (demo roster; the rank readings are synthetic demo data, seeded in
  demo mode only, from the demo games): the figure the readings prove, in the gain or loss colour,
  or a quiet dash, each with its tooltip (what it rests on, or why there is none: on hover, or a
  tap on a touch screen) and words for screen readers. On a wide card it closes the result column;
  on a tablet's it ends the result line; on a phone's it sits under the KDA. Nothing crowds the card.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function matchesOf(page: Page, role: string) {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`, { waitUntil: "networkidle" });
}

test("ranked cards show the LP their readings prove, or a dash that says why", async ({ page }) => {
  await matchesOf(page, "TOP");
  const lps = page.locator('[data-testid="match-lp"]:visible');
  await expect(lps.first()).toBeVisible();
  // Each mark's tooltip text is its trigger's description, which the bubble shows.
  const found = await lps.evaluateAll((els) =>
    els.map((e) => {
      const tip = e.closest("[data-testid=match-lp-tip]");
      const note = (tip && document.getElementById(tip.getAttribute("aria-describedby") ?? "")?.textContent) ?? "";
      return { lp: e.getAttribute("data-lp"), text: (e.textContent ?? "").trim(), note, tabIndex: tip?.getAttribute("tabindex") ?? null, reason: e.getAttribute("data-reason") };
    }),
  );
  // Never a tab stop of its own: the card is the one stop, and its label says the LP.
  for (const f of found) expect(f.tabIndex).toBe("-1");
  const figures = found.filter((f) => f.lp !== null && /^-?\d+$/.test(f.lp));
  const dashes = found.filter((f) => f.lp === "none");
  expect(figures.length, "some games have a recorded figure").toBeGreaterThan(0);
  expect(dashes.length, "some games have none").toBeGreaterThan(0);
  for (const f of figures) {
    // "+19 LP" or "−22 LP" (a true minus), resting on two named readings.
    expect(f.text).toMatch(/^(\+\d+|−\d+|0) LP$/);
    expect(f.note).toMatch(/^Recorded: .+ before this game \(read .+\) and .+ after it \(read .+\)\.$/);
  }
  for (const d of dashes) {
    expect(d.text).toContain("—");
    expect(d.text).toContain("LP not recorded");
    expect(d.note.length).toBeGreaterThan(20);
  }
  // The gain colour on a win, the loss colour on a loss: the figure agrees with the result.
  const cards = page.getByTestId("match-card");
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const lp = card.locator('[data-testid="match-lp"]:visible');
    if ((await lp.count()) === 0) continue;
    const value = await lp.getAttribute("data-lp");
    if (!value || !/^-?\d+$/.test(value)) continue;
    const result = await card.getByTestId("match-row").getAttribute("data-result");
    expect(Number(value) >= 0, `card ${i}`).toBe(result === "W");
  }
  // The card's label says it too, for screen readers.
  const labelled = await page.getByTestId("match-row").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labelled.some((l) => /, (\+|−)\d+ LP[,.]/.test(l))).toBe(true);
  expect(labelled.some((l) => l.includes(", LP not recorded"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the LP sits in the result column on a wide card and under the KDA on a narrow one, without making the card taller", async ({ page }, info) => {
  await matchesOf(page, "TOP");
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-lp"]:visible') }).first();
  const lp = card.locator('[data-testid="match-lp"]:visible');
  const [c, l] = [(await card.boundingBox())!, (await lp.boundingBox())!];
  expect(l.x).toBeGreaterThanOrEqual(c.x);
  expect(l.x + l.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  if (info.project.name === "desktop") expect(l.x - c.x, "in the result column, at the card's start").toBeLessThan(140);
  else if (info.project.name === "tablet") {
    // On the result line ("Defeat · Ranked Flex · 42h ago · −22 LP"), which has room at this width.
    const meta = (await card.getByTestId("match-card-meta").boundingBox())!;
    expect(l.y + l.height / 2, "on the result line").toBeGreaterThan(meta.y);
    expect(l.y + l.height / 2, "on the result line").toBeLessThan(meta.y + meta.height);
  } else expect(c.x + c.width - (l.x + l.width), "under the KDA, at the card's end").toBeLessThan(40);
  // Cards with and without a figure stay compact: the same height on a phone (the KDA column has
  // room), one band on a tablet's stacked card (the figure adds no line).
  const heights = await page.getByTestId("match-card").evaluateAll((els) => els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().height)));
  if (info.project.name === "phone") expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(40);
  if (info.project.name === "tablet") {
    const rows = await page.getByTestId("match-row").evaluateAll((els) => els.slice(0, 6).map((e) => e.getBoundingClientRect().height));
    for (const h of rows) expect(h, "a tablet card stays compact").toBeLessThan(170);
  }
});

test("a dash's reason opens on a tap (touch) or on hover, without opening the game; the rest of the card still opens it", async ({ page }, info) => {
  await matchesOf(page, "TOP");
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-lp"][data-lp="none"]:visible') }).first();
  const tip = card.locator('[data-testid="match-lp-tip"]:visible');
  await tip.scrollIntoViewIfNeeded();
  const note = await tip.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
  expect(note.length).toBeGreaterThan(20);
  const bubble = page.getByTestId("match-lp-tip-bubble");
  const touch = !!info.project.use.hasTouch;
  // The dash is narrow; its trigger is as wide as a target (24px) and as tall.
  const t = (await tip.boundingBox())!;
  expect(t.width).toBeGreaterThanOrEqual(23.5);
  expect(t.height).toBeGreaterThanOrEqual(23.5);
  if (touch) await tip.tap();
  else await tip.hover();
  await expect(bubble).toHaveText(note);
  const b = (await bubble.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // A tap toggles it closed; a click with a mouse keeps it open. Neither opens the game.
  if (touch) {
    await tip.tap();
    await expect(bubble).toHaveCount(0);
  } else {
    await tip.click();
    await expect(bubble).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(bubble).toHaveCount(0);
  }
  // The game did not open: an open game is kept in the address (?match=), under its card or on a
  // screen of its own, and draws its breakdown. A moment for either to show, had it opened.
  await page.waitForTimeout(400);
  await expect(page).not.toHaveURL(/[?&]match=/);
  await expect(page.getByTestId("match-breakdown")).toHaveCount(0);
  // Anywhere else on the card still opens the game (its portrait, at the card's start).
  const c = (await card.boundingBox())!;
  if (touch) await card.tap({ position: { x: 24, y: c.height / 2 } });
  else await card.click({ position: { x: 24, y: c.height / 2 } });
  await expect(page).toHaveURL(/[?&]match=/);
});
