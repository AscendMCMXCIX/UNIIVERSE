import { expect, test, type Page } from "./test";
import { AxeBuilder } from "@axe-core/playwright";

/*
  Kills and multikills (domain/multikills): the profile's Season performance adds up each game's
  own kills (Total kills) and Riot's multikill counts over the same games as its other figures, as
  five plain cards, and its status (the ⓘ beside Refresh) says how many of those games have them;
  All Champions has both per champion; Match History marks each game's largest multikill. Demo games are synthetic. Every game of Demo Top
  carries the counts; Demo Support's older games were "stored before the counts were kept", like
  most real accounts' until the figures backfill reaches them: some still to fetch, some no longer
  at Riot (server/demo/seed.ts).
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function profileOf(page: Page, name: string): Promise<string> {
  await page.goto("/players");
  return (await page.locator(`main a[data-testid='player-card'][data-player-name='${name}']`).first().getAttribute("href"))!;
}

/**
 * A phone's Sort by (narrow rows, under 640px). A choice made before the page's code runs is lost
 * (React puts the control back as it hydrates), so it is made again until the first row shows the
 * figure it sorts by, under that figure's name.
 */
async function sortOnPhone(page: Page, key: string) {
  const select = page.locator("#all-champions-sort-by");
  const label = (await select.locator(`option[value="${key}"]`).textContent())!.trim();
  await expect(async () => {
    await select.selectOption(key);
    await expect(page.getByTestId("top-champion").first().getByTestId("champion-sorted-figure")).toContainText(label, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const seasonGames = async (page: Page) => Number((await page.getByTestId("season-record").textContent())!.replace(/,/g, "").trim());

const KINDS = [
  ["double", "Double kills"],
  ["triple", "Triple kills"],
  ["quadra", "Quadra kills"],
  ["penta", "Pentakills"],
] as const;

test("Overview: the multikill totals as figures of their own, from the same games as the others, with the champions in All Champions", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(href);
  const strip = page.getByTestId("multikills");
  await expect(strip).toBeVisible();
  // Every game has its counts: complete, and the page's status (the ⓘ under the title, no banner)
  // says nothing about multikills.
  await expect(strip).toHaveAttribute("data-coverage", "complete");
  await expect(page.getByTestId("data-status")).toHaveCount(0);
  await expect(page.getByTestId("data-refresh")).toHaveCount(1);
  await expect(page.getByTestId("data-refresh").locator("[data-part=multikills]")).toHaveCount(0);
  // The season card's kills line: Total kills, then each multikill kind with its total
  // ("Kills 192 · Double 33 · Triple 3 · Quadra 1 · Penta 0"); screen readers hear the full names.
  await expect(strip.getByTestId("stat-total-kills")).toHaveText(/^KillsTotal kills\s*[\d,]+\s*·$/);
  const short = { double: "Double", triple: "Triple", quadra: "Quadra", penta: "Penta" } as const;
  for (const [key, label] of KINDS) await expect(strip.getByTestId(`multikill-${key}`)).toHaveText(new RegExp(`^${short[key]}${label}\\s*\\d+\\s*·?$`));
  // No heading of their own on screen (each count names itself); screen readers keep one.
  const heading = strip.getByRole("heading", { name: /^Kills and multikills/ });
  await expect(heading).toHaveCount(1);
  expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(1);
  // Inside the season's card, under its headline and supporting figures.
  expect(await strip.evaluate((el) => !!el.closest("[data-testid=season-figures]"))).toBe(true);
  // One group: every count (a zero too) in the same colour and weight, none highlighted for its
  // kind; in the colour and weight of the season's headline figures, smaller (they support them).
  const look = (testId: string) =>
    page.getByTestId(`${testId}-value`).evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.fontSize, s.fontWeight];
    });
  const [season, kills] = [await look("stat-games"), await look("stat-total-kills")];
  expect([kills[0], kills[2]], "the season's colour and weight").toEqual([season[0], season[2]]);
  expect(parseFloat(kills[1]!), "smaller than the season's headline figures").toBeLessThan(parseFloat(season[1]!));
  for (const testId of ["stat-total-kills", ...KINDS.map(([key]) => `multikill-${key}`)]) expect(await look(testId), `${testId}: its count`).toEqual(kills);
  // Total kills first; one line where the card has room (two on a narrow phone, wrapping between
  // counts, never inside one), and the link to the champions at its end.
  const lineCounts = strip.getByTestId("multikill-tiles").locator("dl > div");
  await expect(lineCounts.first()).toHaveAttribute("data-testid", "stat-total-kills");
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const room = (await page.getByTestId("season-figures").boundingBox())!.width / rem;
  const lines = () => lineCounts.evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(await lines()).toBeLessThanOrEqual(room >= 26 ? 1 : 2);
  expect(await lineCounts.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 30).length), "no count breaks inside").toBe(0);
  // A compact row: no per-champion or per-account lists of its own, and no filters of its own.
  await expect(strip.locator("details, ul, select, [role=radiogroup]")).toHaveCount(0);
  expect((await strip.boundingBox())!.height, "one line (two on a narrow phone)").toBeLessThan(room >= 26 ? 44 : 64);
  // The narrowest phone (320px): every label, figure and count whole, the season's other figures too.
  if (room < 34) {
    await page.setViewportSize({ width: 320, height: 568 });
    await expect.poll(lines).toBeLessThanOrEqual(2);
    const cut = await page.getByTestId("season-figures").evaluate((card) => [...card.querySelectorAll("div, span")].filter((d) => d.clientWidth > 1 && d.scrollWidth > d.clientWidth + 1 && getComputedStyle(d).overflow !== "visible").map((d) => d.textContent?.trim().slice(0, 24)));
    expect(cut, "320px: nothing in the season card cut short").toEqual([]);
    // Each figure's label stays in its own box, beside its ⓘ ("Damage/min" breaks after the "/";
    // it ran 17px under the ⓘ at 320). The check above leaves out boxes that let text overflow.
    const labels = () =>
      page.getByTestId("season-figures").evaluate((card) =>
        [...card.querySelectorAll<HTMLElement>("[data-testid^=stat-]:not([data-testid$=-value]) > div:first-child > span:first-child")].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent?.trim() ?? ""),
      );
    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 568 });
      await expect.poll(labels, `${width}px: every figure's label inside its box`).toEqual([]);
    }
    expect(await page.getByTestId("stat-damage").locator(":scope > div:first-child > span:first-child").textContent(), "the break adds nothing to the label's text").toBe("Damage/min");
    await page.setViewportSize({ width: 375, height: 667 });
  }
  // The champions behind the totals are in All Champions, with the same filters, most multikills first.
  await page.goto(`${href}?mode=solo`);
  const solo = await seasonGames(page);
  await expect(page.getByTestId("multikills")).toHaveAttribute("data-coverage", "complete");
  expect(solo).toBeGreaterThan(0);
  await page.getByTestId("multikills-by-champion").click();
  await expect(page).toHaveURL(/\/champions\?.*mode=solo.*sort=multikills/);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  const counts = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-multikills")!).filter(Boolean).map((v) => v.split(",").map(Number)));
  // Rarest first: pentakills, then quadra, triple and double kills.
  const key = (m: number[]) => m[3]! * 1e9 + m[2]! * 1e6 + m[1]! * 1e3 + m[0]!;
  expect(counts.map(key)).toEqual([...counts.map(key)].sort((a, b) => b - a));
  // Together the champions are the Overview's totals: every game once.
  const total = counts.reduce((t, m) => t.map((v, i) => v + m[i]!), [0, 0, 0, 0]);
  await page.goto(`${href}?mode=solo`);
  for (const [i, [k]] of KINDS.entries()) await expect(page.getByTestId(`multikill-${k}-value`)).toHaveText(String(total[i]));
});

test("Total kills: each game's own kills over the same games as the other figures, per champion in All Champions, sortable", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}?mode=solo`);
  const number = async (testId: string) => Number((await page.getByTestId(testId).innerText()).replace(/,/g, ""));
  const total = await number("stat-total-kills-value");
  expect(total).toBeGreaterThan(0);
  // The kills of every game, not the multikills added up: more than all the kills inside them.
  const [double, triple, quadra, penta] = await Promise.all(KINDS.map(([k]) => number(`multikill-${k}-value`)));
  expect(total).toBeGreaterThan(2 * double! + 3 * triple! + 4 * quadra! + 5 * penta!);
  // Narrower filters, fewer kills; the role filter is one of them.
  await page.goto(`${href}?mode=solo&role=TOP`);
  expect(await number("stat-total-kills-value")).toBeLessThanOrEqual(total);

  // All Champions, same season and mode: each champion's kills, together the Overview's total (every game once).
  await page.goto(`${href}/champions?mode=solo`);
  const more = page.getByTestId("all-champions-more");
  if (await more.count()) await more.click();
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  const kills = async () => rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-kills")).filter((v): v is string => !!v).map(Number));
  expect((await kills()).reduce((a, b) => a + b, 0)).toBe(total);
  // Sorted by them: from the heading, or Sort by on phones.
  if (page.viewportSize()!.width < 768) await sortOnPhone(page, "kills");
  else await page.getByTestId("sort-kills").click();
  const sorted = await kills();
  expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  // The figure is in the row: its own column, or after the role on phones (the sorted figure).
  const first = rows.first();
  if (page.viewportSize()!.width < 640) await expect(first.getByTestId("champion-sorted-figure")).toContainText(`Kills ${sorted[0]!.toLocaleString("en")}`);
  else await expect(first.getByTestId("champion-kills").locator("[aria-hidden]")).toHaveText(sorted[0]!.toLocaleString("en"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("partial counts are said once, in the page's status (the ⓘ), and in each champion's row of All Champions; missing counts are never zeros", async ({ page }) => {
  const href = await profileOf(page, "Demo Support");
  await page.goto(href);
  const strip = page.getByTestId("multikills");
  await expect(strip).toHaveAttribute("data-coverage", "partial");
  // The cards carry no marks of their own, and no banner says it: the ⓘ under the title carries a
  // dot and the page's status, with both numbers (screen readers hear them with the cards too).
  await expect(strip).not.toContainText(/partial|from \d+ of/i);
  await expect(page.getByTestId("data-status")).toHaveCount(0);
  await expect(page.getByTestId("data-refresh")).toHaveAttribute("data-state", "partial");
  await expect(page.getByTestId("data-refresh-flag")).toBeVisible();
  const info = page.getByTestId("data-refresh-info");
  await expect(info).toHaveAccessibleName("Data status: Partial data");
  const games = await seasonGames(page);
  await expect(strip.getByRole("heading", { name: /^Kills and multikills/ })).toHaveText(new RegExp(`^Kills and multikills \\((kills counted in \\d+ of ${games} games; )?multikills counted in \\d+ of ${games} games\\)$`));
  if (page.viewportSize()!.width < 768) await info.tap();
  else await info.hover();
  const bubble = page.getByTestId("data-refresh-info-bubble");
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText("Partial data");
  const part = bubble.locator("[data-part=multikills]");
  const headline = (await part.locator(":scope > span").first().textContent())!;
  const [, counted, of] = /^Multikills counted in (\d+) of (\d+) games$/.exec(headline) ?? [];
  expect(Number(of)).toBe(games);
  expect(Number(counted)).toBeGreaterThan(0);
  expect(Number(counted)).toBeLessThan(games);
  // Why: still being fetched, and no longer at Riot.
  await expect(part).toContainText(/still being counted .* not complete yet/);
  await expect(part).toContainText(/\d+ games? (is|are) no longer available from Riot/);
  await page.keyboard.press("Escape");
  // The totals still show, from the games that have them, and the section fits the screen.
  for (const [key] of KINDS) await expect(strip.getByTestId(`multikill-${key}`)).toBeVisible();
  const box = (await strip.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // The cards, Refresh and its ⓘ pass axe (WCAG 2.1 A/AA): contrast, names, list structure.
  const scan = await new AxeBuilder({ page }).include("[data-testid=multikills]").include("[data-testid=data-refresh]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // All Champions: a champion whose games have no counts shows dashes, never zeros; partial ones are marked.
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId("multikill-legend")).toBeVisible();
  const none = rows.and(page.locator("[data-multikill-coverage=none]")).first();
  const partial = rows.and(page.locator("[data-multikill-coverage=partial]")).first();
  await expect(none).toHaveAttribute("data-multikills", "");
  const phone = page.viewportSize()!.width < 640;
  if (phone) {
    // Narrow rows, sorted by multikills: the rarest kind after the role, a dash where nothing is counted yet.
    await sortOnPhone(page, "multikills");
    await expect(none.getByTestId("champion-sorted-figure")).toContainText("Multikills —");
    await expect(partial.getByTestId("champion-sorted-figure")).toContainText(/Multikills (\d+ (double|triple|quadra|penta)|none)\*/);
  } else {
    // Tablets and narrower desktops: one Multikills column, the rarest kind.
    await expect(none.getByTestId("champion-multikills")).toHaveText(/^—/);
    await expect(partial.getByTestId("champion-multikills")).toContainText("*");
    // Wide: the four kinds in their own columns, dashes where nothing is counted.
    await page.setViewportSize({ width: 1680, height: 1000 });
    for (const [key] of KINDS) {
      await expect(none.getByTestId(`champion-${key}`)).toHaveText(/^—/);
      await expect(partial.getByTestId(`champion-${key}`)).toContainText(/^\d+\*/);
    }
    await expect(none.getByTestId("champion-multikills")).toBeHidden();
  }
});

test("All Champions: multikills sort from their headings (or Sort by on phones) and follow the page's filters", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  const multikills = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-multikills") ?? "").map((v) => (v ? v.split(",").map(Number) : null)));
  const phone = page.viewportSize()!.width < 640;
  const sortBy = async (key: "double" | "penta" | "multikills") => {
    if (phone) await sortOnPhone(page, key);
    else await page.getByTestId(`sort-${key}`).click();
  };
  if (!phone) await page.setViewportSize({ width: 1680, height: 1000 });
  // Double kills, most first; then the other way round. Champions without counts always last.
  await sortBy("double");
  let m = await multikills();
  const doubles = m.filter((v): v is number[] => !!v).map((v) => v[0]!);
  expect(doubles).toEqual([...doubles].sort((a, b) => b - a));
  expect(m.slice(doubles.length).every((v) => v === null)).toBe(true);
  // Pentakills: the rarest kind first, so ties go to quadra, triple and double kills.
  await sortBy(phone ? "multikills" : "penta");
  m = await multikills();
  const key = (v: number[]) => v[3]! * 1e9 + v[2]! * 1e6 + v[1]! * 1e3 + v[0]!;
  const ranked = m.filter((v): v is number[] => !!v).map(key);
  expect(ranked).toEqual([...ranked].sort((a, b) => b - a));
  // A filter of the page (the role played) narrows each champion's multikills like every other figure.
  const allRows = await rows.count();
  await page.goto(`${href}/champions?role=TOP&sort=multikills`);
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(allRows);
  for (const role of await rows.locator("[data-open-champion]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))) expect(role).toMatch(/, Top:/);
  // Never a sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("Match History marks a game's largest multikill, and nothing else", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}/matches`);
  await expect(page.getByTestId("match-card").first()).toBeVisible();
  const marks = page.getByTestId("match-multikill");
  await expect(marks.first()).toBeVisible();
  for (const text of await marks.allTextContents()) expect(text.trim()).toMatch(/^(Double kill|Triple kill|Quadra kill|Pentakill)$/);
  // The card's button names it too, for screen readers.
  const marked = page.getByTestId("match-card").filter({ has: marks.first() }).first();
  await expect(marked.getByTestId("match-row")).toHaveAttribute("aria-label", /, (double kill|triple kill|quadra kill|pentakill)\. Show the match details\.$/);
});

test("Team Matches marks each member's largest multikill beside their K/D/A", async ({ page }) => {
  await page.goto("/matches");
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  const marks = page.locator("[data-testid='together-multikill']:visible");
  await expect(marks.first()).toBeVisible();
  for (const text of await marks.allTextContents()) expect(text.trim()).toMatch(/^(Double kill|Triple kill|Quadra kill|Pentakill)$/);
  // Each one inside a member's cell, never on its own.
  expect(await page.getByTestId("together-member").locator("[data-testid='together-multikill']:visible").count()).toBe(await marks.count());
});
