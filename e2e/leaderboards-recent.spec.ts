import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "./test";

/*
  Team Leaderboards (docs/LEADERBOARDS_MODEL.md): Recent form, each member's latest 20 Summoner's
  Rift games ranked by win rate, and Records & achievements for the season. The demo viewer is the
  Owner, an administrator without a player profile. The games are synthetic demo games, never real
  Riot data: every demo member has a full 20-game window.
*/

const BOARDS = "/leaderboards";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(1);
}

async function axe(page: Page, selector: string) {
  const scan = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("Recent form is the default view, with the team's data status beside it", async ({ page }) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("leaderboards-tab-form")).toHaveAttribute("aria-current", "page");
  // Today's categories, filters and the admins' preview banner are gone.
  await expect(page.getByTestId("leaderboard-categories")).toHaveCount(0);
  await expect(page.getByTestId("leaderboards-preview")).toHaveCount(0);
  // How fresh the boards are: the team's status behind one ⓘ under the title, as on a profile.
  await expect(page.getByTestId("leaderboards-status-info")).toBeVisible();
  // An old address (today's category or filters) opens the boards, ignoring what it asked for.
  await open(page, "/leaderboards?category=combat&metric=kda&queue=solo&lineup=1");
  await expect(page.getByTestId("leaderboards-tab-form")).toHaveAttribute("aria-current", "page");
  await noOverflow(page);
});

test("Leaderboards is a Team tab between Players and Matches", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the navigation layout is covered per device in responsive.spec");
  await page.goto("/team");
  await expect(page.getByTestId("team-tabs").getByRole("link")).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
  await page.getByTestId("team-tab-leaderboards").click();
  await expect(page).toHaveURL(/\/leaderboards/);
  await expect(page.getByTestId("leaderboards")).toBeVisible();
});

test("Recent form ranks every full 20-game window by win rate, shared places and gaps in wins", async ({ page }) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("scope-label")).toHaveText(/Latest 20 games from the last 60 days/);
  const rows = await page.getByTestId("form-row").evaluateAll((els) =>
    els.map((e) => ({ place: Number(e.getAttribute("data-place") ?? NaN), status: e.getAttribute("data-status"), rate: Number(e.getAttribute("data-win-rate")), games: Number(e.getAttribute("data-games")), tied: e.hasAttribute("data-tied"), note: e.querySelector('[data-testid="form-note"]')?.textContent ?? null })),
  );
  const ranked = rows.filter((r) => r.status === "established");
  expect(ranked.length).toBeGreaterThanOrEqual(5);
  for (const r of ranked) expect(r.games).toBe(20);
  // In order: places never go down the list, win rates never go up; equal win rates share a place.
  for (let i = 1; i < ranked.length; i++) {
    expect(ranked[i]!.rate).toBeLessThanOrEqual(ranked[i - 1]!.rate);
    expect(ranked[i]!.place).toBe(ranked[i]!.rate === ranked[i - 1]!.rate ? ranked[i - 1]!.place : i + 1);
  }
  expect(ranked.filter((r) => r.tied).every((r) => ranked.some((o) => o !== r && o.place === r.place))).toBe(true);
  // First place has no note; every other place says its gap in wins, or that one win draws level.
  expect(ranked[0]!.note).toBeNull();
  for (const r of ranked.filter((x) => x.place > 1 && ranked.some((o) => o.rate > x.rate))) expect(r.note).toMatch(/^(\d+ wins? behind|Win your next game to draw level with) /);
  await expect(page.getByTestId("form-row").first().getByRole("img", { name: "First place" })).toBeVisible();
  await expect(page.getByTestId("form-footnote")).toContainText("places within 2 wins of each other are close");
  await noOverflow(page);
  await axe(page, "[data-testid=form]");
});

test("each row says what counts: the record, the dates and the main role", async ({ page }, info) => {
  await open(page, BOARDS);
  const row = page.getByTestId("form-row").first();
  const wins = Number(await row.getAttribute("data-wins"));
  const phone = (page.viewportSize()?.width ?? 1000) < 640;
  // Phones: one line under the name; wider: a column each.
  const record = phone ? row.getByTestId("form-meta") : row.getByTestId("form-record");
  await expect(record).toContainText(`${wins}W ${20 - wins}L`);
  await expect(phone ? row.getByTestId("form-meta") : row.getByTestId("form-dates")).toContainText(/\d{1,2} [A-Z][a-z]{2} – \d{1,2} [A-Z][a-z]{2}/);
  if (!phone) await expect(row.getByTestId("form-role")).toHaveText(/Top|Jungle|Mid|Bottom|Support/);
  // The columns are named from a 40rem board up (aria-hidden: each row names its figures for screen readers).
  if (info.project.name === "desktop") await expect(page.getByTestId("form-heads")).toContainText("Win rate");
});

test("Records & achievements: season records open their game, multikills rarest first, milestones", async ({ page }) => {
  await open(page, BOARDS);
  await page.getByTestId("leaderboards-tab-records").click();
  await expect(page).toHaveURL(/\/leaderboards\?view=records/);
  await expect(page.getByTestId("records-volume-note")).toContainText("reward playing more");
  await expect(page.getByTestId("season-record")).toHaveCount(7);
  const multis = await page.getByTestId("multikill-row").evaluateAll((els) => els.map((e) => ["data-penta", "data-quadra", "data-triple"].map((k) => Number(e.getAttribute(k)))));
  expect(multis.length).toBeGreaterThan(0);
  const key = (m: number[]) => m[0]! * 1e6 + m[1]! * 1e3 + m[2]!;
  for (let i = 1; i < multis.length; i++) expect(key(multis[i]!)).toBeLessThanOrEqual(key(multis[i - 1]!));
  await expect(page.getByTestId("milestones-mastery").getByTestId("milestone-member").first()).toBeVisible();
  await noOverflow(page);
  await axe(page, "[data-testid=records]");
  // A record opens its game in the holder's Match History (under its card, or in the match window).
  const kills = page.locator('[data-testid=season-record][data-record="kills"]');
  await expect(kills).toHaveAttribute("href", /^\/players\/[^/]+\/matches\?match=/);
  await kills.click();
  await expect(page).toHaveURL(/\/players\/[^/]+\/matches\?match=/);
  await expect(page.locator("[data-testid=match-detail], [data-testid=match-breakdown]").first()).toBeVisible();
});
