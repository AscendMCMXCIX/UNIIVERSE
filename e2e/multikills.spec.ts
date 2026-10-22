import { expect, test, type Page } from "./test";
import { AxeBuilder } from "@axe-core/playwright";

/*
  Multikills (domain/multikills): the profile's Season performance adds up Riot's multikill counts
  over the same games as its other figures, as four plain cards, and its status (the ⓘ beside
  Refresh) says how many of those games have them; Match History marks each game's largest
  multikill. Demo games are synthetic. Every game of Demo Top
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
  // Four cards like the season's other figures: each named, its total, how often it came.
  for (const [key, label] of KINDS) await expect(strip.getByTestId(`multikill-${key}`)).toHaveText(new RegExp(`^${label}\\s*\\d+\\s*(1 every [\\d,]+ games|About every game|Every game|None yet)$`));
  // No heading of their own on screen (each card names its kind); screen readers keep one.
  const heading = strip.getByRole("heading", { name: /^Multikills/ });
  await expect(heading).toHaveCount(1);
  expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(1);
  // One group: every count (a zero too) in the colour, size and weight of the season's other
  // figures, on the same cards, none highlighted for its kind.
  const look = (testId: string, part: "value" | "card") =>
    page.getByTestId(part === "value" ? `${testId}-value` : testId).evaluate((el, p) => {
      const s = getComputedStyle(el);
      return p === "value" ? [s.color, s.fontSize, s.fontWeight] : [s.borderTopColor, s.backgroundColor, s.borderTopWidth];
    }, part);
  for (const [key] of KINDS) {
    expect(await look(`multikill-${key}`, "value"), `${key}: its count`).toEqual(await look("stat-games", "value"));
    expect(await look(`multikill-${key}`, "card"), `${key}: its card`).toEqual(await look("stat-games", "card"));
  }
  const width = page.viewportSize()!.width;
  // Two by two on a phone, one row wider.
  const tops = await strip.getByTestId("multikill-tiles").locator(":scope > div").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(width < 640 ? 2 : 1);
  // Straight under the season's figures, as far from them as their own rows are from each other.
  const spacing = await page.evaluate(() => {
    const figures = document.querySelector<HTMLElement>("[data-testid=season-figures]")!;
    const tiles = document.querySelector<HTMLElement>("[data-testid=multikill-tiles]")!;
    return { gap: tiles.getBoundingClientRect().top - figures.getBoundingClientRect().bottom, rowGap: parseFloat(getComputedStyle(figures).rowGap) };
  });
  expect(Math.abs(spacing.gap - spacing.rowGap)).toBeLessThanOrEqual(1);
  // A compact section: no per-champion or per-account lists of its own, and no filters of its own.
  await expect(strip.locator("details, ul, select, [role=radiogroup]")).toHaveCount(0);
  expect((await strip.boundingBox())!.height).toBeLessThan(width < 640 ? 260 : 150);
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
  await expect(strip.getByRole("heading", { name: /^Multikills/ })).toHaveText(new RegExp(`^Multikills, counted in \\d+ of ${games} games$`));
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
  await expect(part).toContainText(/still being fetched from Riot .* not complete yet/);
  await expect(part).toContainText(/Riot no longer provides the records? of \d+ games?/);
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
    await expect(none.getByTestId("champion-summary")).toContainText("multikills not counted yet");
    await expect(partial.getByTestId("champion-summary")).toContainText(/(\d+ (double|triple|quadra|penta)|no multikills)\*/);
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
    if (phone) await page.locator("#all-champions-sort-by").selectOption(key);
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

test("a champion's window shows its multikills in the same games as its other figures", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}/champions`);
  const row = page.getByTestId("top-champion").first();
  const counts = (await row.getAttribute("data-multikills"))!.split(",");
  await row.getByTestId("open-champion").click();
  const summary = page.getByTestId("champion-detail").getByTestId("champion-multikills-summary");
  await expect(summary).toBeVisible();
  for (const [i, [k]] of KINDS.entries()) await expect(summary.getByTestId(`multikill-${k}`).locator("dd")).toHaveText(counts[i]!);
  await expect(summary.getByTestId("multikill-sample")).toHaveText(`From all ${await row.getAttribute("data-games")} games`);
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
  await expect(marked.getByTestId("match-row")).toHaveAttribute("aria-label", /, (double kill|triple kill|quadra kill|pentakill)\. Open the match details\.$/);
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

test("Match History links the account's history on OP.GG, named as such, never as the game", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}/matches`);
  const link = page.getByTestId("match-history-opgg");
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/^View Match History on OP\.GG · Demo Top \(opens in a new tab\)$/);
  await expect(link).toHaveAttribute("href", "https://op.gg/lol/summoners/euw/Demo%20Top-DEMO");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  // A demo game's own window has no OP.GG link (no real Riot match id): see detail-panel.spec.ts.
});
