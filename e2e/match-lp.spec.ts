import { expect, test, type Page } from "./test";

/*
  A ranked game's LP on its card (demo roster; the rank readings are synthetic demo data, seeded in
  demo mode only, from the demo games): the figure the readings prove, in the gain or loss colour,
  or a quiet dash, each with its tooltip (what it rests on, or why there is none: on hover; on a
  touch screen the card's mark is no button, and the opened game's tip takes the tap, 44px each way)
  and words for screen readers. On a wide card it follows when the game was
  played, on that line of the result column (a promotion's longer mark takes the next line); on a
  tablet's it ends the result line; on a phone's it ends the result line too, at the card's end
  (owner decision D8, 18 Nov 2026: it sat under the KDA). Nothing crowds the card.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function matchesOf(page: Page, role: string) {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`, { waitUntil: "networkidle" });
}

test("ranked cards show the LP their readings prove, or a dash that says why", async ({ page }, info) => {
  await matchesOf(page, "TOP");
  const touch = !!info.project.use.hasTouch;
  const lps = page.locator('[data-testid="match-lp"]:visible');
  await expect(lps.first()).toBeVisible();
  // Each mark's tooltip text is its trigger's description, which the bubble shows.
  const found = await lps.evaluateAll((els) =>
    els.map((e) => {
      const tip = e.closest("[data-testid=match-lp-tip]");
      const note = (tip && document.getElementById(tip.getAttribute("aria-describedby") ?? "")?.textContent) ?? "";
      return { lp: e.getAttribute("data-lp"), text: (e.textContent ?? "").trim(), note, tip: !!tip, tabIndex: tip?.getAttribute("tabindex") ?? null, reason: e.getAttribute("data-reason") };
    }),
  );
  // Never a tab stop of its own: the card is the one stop, and its label says the LP. On a touch
  // screen no button at all (row 2.21: no target under 44px on a card); the opened game has the tip.
  for (const f of found) {
    if (touch) expect(f.tip, "no tip button on a card on touch").toBe(false);
    else expect(f.tabIndex).toBe("-1");
  }
  const figures = found.filter((f) => f.lp !== null && /^-?\d+$/.test(f.lp));
  const dashes = found.filter((f) => f.lp === "none");
  expect(figures.length, "some games have a recorded figure").toBeGreaterThan(0);
  expect(dashes.length, "some games have none").toBeGreaterThan(0);
  for (const f of figures) {
    // "+19 LP" or "−22 LP" (a true minus), resting on two named readings.
    expect(f.text).toMatch(/^(\+\d+|−\d+|0) LP$/);
    if (!touch) expect(f.note).toMatch(/^.+ \d+ LP → .+ \d+ LP: checked \d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [ap]m and .*\d{1,2}:\d{2} [ap]m, either side of this game's result\.$/);
  }
  for (const d of dashes) {
    expect(d.text).toContain("—");
    expect(d.text).toContain("LP not recorded");
    if (!touch) expect(d.note.length).toBeGreaterThan(20);
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

test("the LP sits in the result column on a wide card and at the end of the result line on a narrow one, without making the card taller", async ({ page }, info) => {
  await matchesOf(page, "TOP");
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-lp"]:visible') }).first();
  const lp = card.locator('[data-testid="match-lp"]:visible');
  const [c, l] = [(await card.boundingBox())!, (await lp.boundingBox())!];
  expect(l.x).toBeGreaterThanOrEqual(c.x);
  expect(l.x + l.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  if (info.project.name === "desktop") {
    expect(l.x - c.x, "in the result column, at the card's start").toBeLessThan(140);
    // On every card, a figure or a dash shares the line of when the game was played, after it.
    const lines = await page.getByTestId("match-card").evaluateAll((els) =>
      els.flatMap((card) => {
        const mark = [...card.querySelectorAll('[data-testid="match-lp"]')].find((e) => e.getBoundingClientRect().width > 0);
        const when = card.querySelector('[data-testid="match-when"]');
        if (!mark || !when || mark.getAttribute("data-lp") === "promoted" || mark.getAttribute("data-lp") === "demoted") return [];
        const [m, w] = [mark.getBoundingClientRect(), when.getBoundingClientRect()];
        return [{ apart: Math.abs(m.top + m.height / 2 - (w.top + w.height / 2)), after: m.left - w.right }];
      }),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const [i, x] of lines.entries()) {
      expect(x.apart, `card ${i}: on the time's line`).toBeLessThanOrEqual(3);
      expect(x.after, `card ${i}: after the time`).toBeGreaterThanOrEqual(0);
    }
  } else if (info.project.name === "tablet") {
    // On the result line ("Defeat · Flex · 42h ago · −22 LP"), which has room at this width.
    const meta = (await card.getByTestId("match-card-meta").filter({ visible: true }).boundingBox())!;
    expect(l.y + l.height / 2, "on the result line").toBeGreaterThan(meta.y);
    expect(l.y + l.height / 2, "on the result line").toBeLessThan(meta.y + meta.height);
  } else {
    // On the result line, which runs across the card ("Defeat · Flex · 42h ago … −22 LP"), at its end.
    const meta = (await card.getByTestId("match-card-meta").filter({ visible: true }).boundingBox())!;
    expect(l.y + l.height / 2, "on the result line").toBeGreaterThan(meta.y);
    expect(l.y + l.height / 2, "on the result line").toBeLessThan(meta.y + meta.height);
    expect(c.x + c.width - (l.x + l.width), "at the card's end").toBeLessThan(40);
  }
  // Cards with and without a figure stay compact: the same height on a phone (the KDA column has
  // room), one band on a tablet's stacked card (the figure adds no line).
  const heights = await page.getByTestId("match-card").evaluateAll((els) => els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().height)));
  if (info.project.name === "phone") expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(40);
  if (info.project.name === "tablet") {
    const rows = await page.getByTestId("match-row").evaluateAll((els) => els.slice(0, 6).map((e) => e.getBoundingClientRect().height));
    for (const h of rows) expect(h, "a tablet card stays compact").toBeLessThan(170);
  }
});

test("a dash's reason: on hover over the card's mark without opening the game; on a touch screen a tap on the mark opens the game, whose tip (44px each way) takes the tap", async ({ page }, info) => {
  await matchesOf(page, "TOP");
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-lp"][data-lp="none"]:visible') }).first();
  const bubble = page.getByTestId("match-lp-tip-bubble");
  const touch = !!info.project.use.hasTouch;
  if (touch) {
    // Row 2.21 (PLAN S2b): no target under 44px on a card. The mark is no button; a tap on it is a
    // tap on the card, which opens the game.
    const mark = card.getByTestId("match-lp-mark").filter({ visible: true });
    await mark.scrollIntoViewIfNeeded();
    await expect(card.locator('[data-testid="match-lp-tip"]')).toHaveCount(0);
    await mark.tap();
    await expect(page).toHaveURL(/[?&]match=/);
    const opened = info.project.name === "phone" ? page.getByRole("dialog") : page.getByTestId("match-card-header");
    const tip = opened.locator('[data-testid="match-lp-tip"]').first();
    await expect(tip).toBeVisible();
    const t = (await tip.boundingBox())!;
    expect(t.width, "the opened game's tip: 44px wide on touch").toBeGreaterThanOrEqual(43.5);
    expect(t.height, "and 44px tall").toBeGreaterThanOrEqual(43.5);
    const note = await tip.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
    expect(note.length).toBeGreaterThan(20);
    await tip.tap();
    await expect(bubble).toHaveText(note);
    const b = (await bubble.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await tip.tap();
    await expect(bubble).toHaveCount(0);
    // The game stays open.
    await expect(page).toHaveURL(/[?&]match=/);
    return;
  }
  const tip = card.locator('[data-testid="match-lp-tip"]:visible');
  await tip.scrollIntoViewIfNeeded();
  const note = await tip.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
  expect(note.length).toBeGreaterThan(20);
  // The dash is narrow; its trigger is as wide as a target (24px) and as tall.
  const t = (await tip.boundingBox())!;
  expect(t.width).toBeGreaterThanOrEqual(23.5);
  expect(t.height).toBeGreaterThanOrEqual(23.5);
  await tip.hover();
  await expect(bubble).toHaveText(note);
  const b = (await bubble.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // A click with a mouse keeps it open, and does not open the game.
  await tip.click();
  await expect(bubble).toBeVisible();
  await page.mouse.move(2, 2);
  await expect(bubble).toHaveCount(0);
  // The game did not open: an open game is kept in the address (?match=), under its card or on a
  // screen of its own, and draws its breakdown. A moment for either to show, had it opened.
  await page.waitForTimeout(400);
  await expect(page).not.toHaveURL(/[?&]match=/);
  await expect(page.getByTestId("match-breakdown")).toHaveCount(0);
  // Anywhere else on the card still opens the game (its portrait, at the card's start).
  const c = (await card.boundingBox())!;
  await card.click({ position: { x: 24, y: c.height / 2 } });
  await expect(page).toHaveURL(/[?&]match=/);
});

test("in an opened game, the LP's reason is within a keyboard's reach: its tip is a tab stop and opens on focus (TT.TD12)", async ({ page }, info) => {
  // A phone's game window, or a wider screen's game opened in place (its header).
  test.skip(info.project.name === "tablet", "the phone's window and the desktop's open card cover both forms");
  await matchesOf(page, "TOP");
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-lp"]:visible') }).first();
  // The card's own control (its figures lie over it), opened as a keyboard does.
  await card.getByTestId("match-row").focus();
  await page.keyboard.press("Enter");
  const opened = info.project.name === "phone" ? page.getByRole("dialog") : page.getByTestId("match-card-header");
  const tip = opened.locator('[data-testid="match-lp-tip"]').first();
  await expect(tip).toBeVisible();
  expect(await tip.getAttribute("tabindex"), "a tab stop of its own in the window").toBeNull();
  const note = await tip.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
  await tip.focus();
  await expect(page.getByTestId("match-lp-tip-bubble")).toHaveText(note);
  // A pointer reaches it too: above the card's own button, a hover opens it and leaves the game open
  // (the card's button lay over it, so a pointer on the header's LP reached the card).
  if (info.project.name === "desktop") {
    await tip.blur();
    await expect(page.getByTestId("match-lp-tip-bubble")).toHaveCount(0);
    await tip.hover();
    await expect(page.getByTestId("match-lp-tip-bubble")).toHaveText(note);
    await tip.click();
    await expect(page.getByTestId("match-card-header")).toBeVisible();
  }
});
