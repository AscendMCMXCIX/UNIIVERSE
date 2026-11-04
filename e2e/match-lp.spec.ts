import { expect, test, type Page } from "./test";

/*
  A ranked game's LP on its card (demo roster; the rank readings are synthetic demo data, seeded in
  demo mode only, from the demo games): the figure the readings prove, in the gain or loss colour,
  or a quiet dash with the reason in its hover text and words for screen readers. On a wide card it
  closes the result column; on a narrow one it sits under the KDA. Nothing crowds the card.
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
  const found = await lps.evaluateAll((els) => els.map((e) => ({ lp: e.getAttribute("data-lp"), text: (e.textContent ?? "").trim(), title: e.getAttribute("title") ?? "", reason: e.getAttribute("data-reason") })));
  const figures = found.filter((f) => f.lp !== null && /^-?\d+$/.test(f.lp));
  const dashes = found.filter((f) => f.lp === "none");
  expect(figures.length, "some games have a recorded figure").toBeGreaterThan(0);
  expect(dashes.length, "some games have none").toBeGreaterThan(0);
  for (const f of figures) {
    // "+19 LP" or "−22 LP" (a true minus), resting on two named readings.
    expect(f.text).toMatch(/^(\+\d+|−\d+|0) LP$/);
    expect(f.title).toMatch(/^Recorded: .+ before this game \(read .+\) and .+ after it \(read .+\)\.$/);
  }
  for (const d of dashes) {
    expect(d.text).toContain("—");
    expect(d.text).toContain("LP not recorded");
    expect(d.title.length).toBeGreaterThan(20);
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
