import { expect, test, type Browser, type Page } from "./test";
import { PAGES, applySetup, contextOptions, findPlayerId, openAndMeasure, overBudget, type Setup } from "../scripts/page-budgets.mjs";
import ceilings from "./page-budgets.json";

/*
  The page budgets' fixed CI subset (docs/MOBILE.md, "Page budgets"; the full matrix is
  scripts/ux-measure.mjs, run by hand). Every Player and Admin page at i15 (393 × 852, installed) at
  100% text and at se1 (320 × 568) at 150%, against the ceilings in e2e/page-budgets.json: height in
  screens, the frame's share at rest and after a 100px scroll, no sideways overflow, and touch
  targets under 44px on the first screen. Then the facts S2b and S3 hold on phones (the header
  budget, the profile band in the bar, the sliding frame, the sections sheet, Team's lineup pager,
  the whole first card, five across sideways). Chromium on the phone project: the setups need CDP.
*/

test.describe.configure({ mode: "serial" });
test.beforeEach(({ browserName }, info) => test.skip(info.project.name !== "phone" || browserName !== "chromium", "the phone project's budgets (CDP)"));

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? "3199"}`;
const CEILINGS = (ceilings as { pages: Record<string, { screens: number; frame: number; frameScrolled: number; small: number }> }).pages;
let playerId = "";

async function setupPage(browser: Browser, setup: Setup, text: number, admin = false): Promise<Page> {
  const ctx = await browser.newContext(contextOptions(setup));
  await ctx.addCookies([{ name: "uniiverse_view", value: admin ? "admin" : "player", url: BASE }]);
  const page = await ctx.newPage();
  await applySetup(page, setup, text);
  return page;
}

test.beforeAll(async ({ browser }, info) => {
  if (info.project.name !== "phone") return;
  const page = await browser.newPage();
  playerId = await findPlayerId(page, BASE);
  await page.close();
});

for (const [setup, text] of [["i15", 100], ["se1", 150]] as const) {
  test(`every page within its budget at ${setup} ${text}% text`, async ({ browser }) => {
    test.setTimeout(180_000);
    const over: string[] = [];
    for (const admin of [false, true]) {
      const page = await setupPage(browser, setup, text, admin);
      for (const key of Object.keys(PAGES).filter((k) => !!PAGES[k]!.admin === admin)) {
        const id = `${key}@${setup}-${text}`;
        const figures = await openAndMeasure(page, BASE, key, playerId);
        for (const problem of overBudget(figures, CEILINGS[id], { height: !PAGES[key]!.data })) over.push(`${id}: ${problem}`);
      }
      await page.context().close();
    }
    expect(over).toEqual([]);
  });
}

/** Boxes on the page, by test id (null where it is not drawn). */
function boxes(page: Page, ids: string[]) {
  return page.evaluate((list) => Object.fromEntries(list.map((id) => {
    const el = document.querySelector(`[data-testid=${id}]`);
    const r = el?.getBoundingClientRect();
    return [id, r && r.height ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) } : null];
  })), ids);
}

test("Team on phones: one 44px header line, five players in the pager, the whole first card at 393 × 659 and 375 × 667", async ({ browser }) => {
  for (const setup of ["i15", "i15s", "se3"] as const) {
    const page = await setupPage(browser, setup, 100);
    await page.goto(`${BASE}/team`);
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    const b = await boxes(page, ["team-header", "lineup-cell", "phone-tabbar"]);
    expect(b["team-header"]!.height, `${setup}: the header under the bar`).toBeLessThanOrEqual(56);
    expect(b["lineup-cell"]!.bottom, `${setup}: the first card ends above the tab bar`).toBeLessThanOrEqual(setup === "i15s" ? 659 : b["phone-tabbar"]!.top);
    await expect(page.getByTestId("lineup-dot-picture")).toHaveCount(5);
    await expect(page.getByTestId("team-name")).toHaveCount(1);
    expect(await page.getByTestId("team-name").evaluate((h) => h.getBoundingClientRect().width <= 1), `${setup}: the h1 read out only`).toBe(true);
    await page.context().close();
  }
});

test("Team held sideways: five cards in one row, the page within 1.3 screens; at 150% a card on the first screen", async ({ browser }) => {
  const page = await setupPage(browser, "land", 100);
  await page.goto(`${BASE}/team`);
  // Measured once the lineup is drawn (its first card's identity laid out), as the test above waits:
  // read straight after the load, a card could still be without its box (1 run in 4 here).
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("card-identity").first()).toBeVisible();
  const tops = await page.getByTestId("lineup-cell").evaluateAll((cells) => [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top)))]);
  expect(tops, "one row").toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight / innerHeight)).toBeLessThanOrEqual(1.3);
  await page.context().close();
  const large = await setupPage(browser, "land", 150);
  await large.goto(`${BASE}/team`);
  await expect(large.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  await expect(large.getByTestId("card-identity").first()).toBeVisible();
  expect((await boxes(large, ["card-identity"]))["card-identity"]!.top, "a card's name on the first screen").toBeLessThan(393);
  await large.context().close();
});

test("a profile's sections on a phone: the band rides in the bar, the section starts under the sections row; at 150% the sections fold into a sheet", async ({ browser }) => {
  for (const text of [100, 150]) {
    const page = await setupPage(browser, "i15", text);
    for (const section of ["champions", "matches", "accounts"]) {
      await page.goto(`${BASE}/players/${playerId}/${section}`);
      await expect(page.getByTestId("profile-bar-title")).toBeVisible();
      await expect(page.getByTestId("profile-header")).toBeHidden();
      const gap = await page.evaluate(() => {
        const bar = document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect().bottom;
        const first = [...document.querySelectorAll("main > *, main [data-testid=profile-header] ~ *")].map((e) => e.getBoundingClientRect()).find((r) => r.height > 8);
        // In rem: the page's own top padding (1.25rem) is all that may stand between them.
        return (first!.top - bar) / parseFloat(getComputedStyle(document.documentElement).fontSize);
      });
      expect(gap, `${section} at ${text}%: the first item right under the sections row`).toBeLessThanOrEqual(1.5);
    }
    // At 150% the four names no longer fit whole: one "Section: …" button and a sheet, nothing cut off.
    await expect(page.getByTestId("profile-chrome-tabs-fold")).toBeVisible({ visible: text === 150 });
    if (text === 150) {
      await page.getByTestId("profile-chrome-tabs-fold").click();
      await expect(page.getByTestId("profile-chrome-tabs-sheet").getByRole("link")).toHaveCount(4);
    }
    await page.context().close();
  }
});

test("the frame slides away on a 568–667px phone at 150%: at most a quarter of the screen after a 100px scroll; Match History's first game above the tab bar at 320 × 568", async ({ browser }) => {
  for (const setup of ["se1", "se3"] as const) {
    const page = await setupPage(browser, setup, 150);
    const f = await openAndMeasure(page, BASE, "p-history", playerId);
    expect(f.frameScrolled, `${setup}`).toBeLessThanOrEqual(0.25);
    await page.context().close();
  }
  const page = await setupPage(browser, "se1", 100);
  await page.goto(`${BASE}/players/${playerId}/matches`);
  await page.getByTestId("match-card").first().waitFor();
  const game = await page.getByTestId("match-card").first().boundingBox();
  const tab = (await boxes(page, ["phone-tabbar"]))["phone-tabbar"]!;
  expect(game!.y).toBeLessThan(tab.top);
  await page.context().close();
});

test("first paint within a 320px phone: the page is never wider than the screen before its code runs", async ({ browser }) => {
  const ctx = await browser.newContext({ ...contextOptions("se1"), javaScriptEnabled: false });
  const page = await ctx.newPage();
  for (const path of ["/team", "/players", `/players/${playerId}/matches`]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
  await ctx.close();
});
