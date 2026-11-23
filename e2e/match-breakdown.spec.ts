import { expect, test, type Page } from "./test";
import { closeGame, opensFullScreen, openGame } from "./match-history";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";
import { AxeBuilder } from "@axe-core/playwright";

/*
  A game's post-game view under its Match History card (demo data, in memory; on phones the window):
  one view without subtabs and without folds (the loadout, the rune page, six figure tiles with each
  of the player's figures once, the lane and the compact scoreboard), the open card folded into a
  header with Previous, Next and Close, and one history rule (Back closes the game, however many
  games were stepped through). The match timeline is asked for once as the game opens: the lane's
  10:00 and 15:00 read it. Every sixth demo game has no stored timeline (and the demo has no Riot key
  to fetch it). Since 23 Nov 2026 (the owner's request) the view has no notes (Went well, Went wrong,
  Focus next) and no folds (Gold over the game, Build and skill order): the tests below check they
  stay gone.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function openHistory(page: Page, role = "MID") {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
}

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

/** The removed sections' names: none of them is in an open game. */
const REMOVED = ["Went well", "Went wrong", "Focus next", "Gold over the game", "Build and skill order"];

test("while the timeline loads, the view passes axe, and it says when the timeline has answered", async ({ page }) => {
  await openHistory(page, "TOP");
  // The game's own requests in order: the record, then the timeline (which the lane reads).
  const actions: string[] = [];
  page.on("request", (r) => {
    const id = r.headers()["next-action"];
    if (r.method() === "POST" && id) actions.push(id);
  });
  const first = page.getByTestId("match-card").nth(0);
  const opened = await openGame(first);
  await expect(opened).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
  const timelineAction = actions[1];
  expect(timelineAction).toBeTruthy();
  await closeGame(first);
  // The next game's timeline held back, so the view stays waiting for it while axe reads it.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"] === timelineAction) await held;
    await route.fallback();
  });
  const breakdown = await openGame(page.getByTestId("match-card").nth(1));
  await expect(breakdown).toHaveAttribute("data-timeline", "loading");
  const scan = await new AxeBuilder({ page }).include("[data-testid=match-breakdown]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  release();
  await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
});

test("one view without subtabs or folds: the loadout names itself, each figure once, the lane and the scoreboard, and no notes", async ({ page }) => {
  await openHistory(page, "TOP");
  const breakdown = await openGame(page.getByTestId("match-card").nth(1));
  await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
  await expect(breakdown.locator("[role=tab]")).toHaveCount(0);
  await expect(breakdown.locator("details")).toHaveCount(0);
  // The inventory: six slots and the trinket; an icon names itself on focus (and on a tap), inside the screen.
  await expect(breakdown.getByTestId("post-game-items").locator(":scope > *")).toHaveCount(7);
  const icon = breakdown.getByTestId("post-game-items").getByTestId("loadout-icon").first();
  await icon.focus();
  const name = breakdown.getByTestId("loadout-name").first();
  await expect(name).toHaveText((await icon.getAttribute("aria-label"))!);
  const box = (await name.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // Each of the player's figures once in the whole view: CS/min, KDA, kill participation and damage share.
  const text = await breakdown.innerText();
  const tiles = breakdown.getByTestId("post-game-figures");
  const cspm = (await tiles.getByTestId("figure-cs").innerText()).match(/(\d+\.\d) \/ min/)![1]!;
  const kda = (await tiles.getByTestId("figure-kda").innerText()).match(/(\d+\.\d\d) KDA/)?.[1];
  const share = (await tiles.getByTestId("figure-damage").innerText()).match(/(\d+%) of team/)![1]!;
  const count = (needle: string) => text.split(needle).length - 1;
  expect(count(`${cspm} / min`), "CS per minute once").toBe(1);
  if (kda) expect(count(`${kda} KDA`), "KDA once").toBe(1);
  expect(count(`${share} of team`), "damage share once").toBe(1);
  expect(await breakdown.getByTestId("participant-kda").filter({ hasText: /KDA|%/ }).count(), "scoreboard rows carry no ratio or share").toBe(0);
  // Every tile's caption whole ("18% of team" was cut six across in the 33rem column: the design review's G2-2).
  expect(await tiles.locator(".truncate").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent)), "the figures' captions whole").toEqual([]);
  // The removed sections (the owner's request, 23 Nov 2026): no notes and no folds, by their parts or their names.
  await expect(breakdown.locator("[data-testid^=post-game-note], [data-testid^=notes-], [data-testid^=fold-], [data-testid=post-game-folds], [data-testid=gold-chart], [data-testid=skill-order]")).toHaveCount(0);
  for (const word of REMOVED) expect(text, `no "${word}"`).not.toContain(word);
  // The lane names the opponent or says it is not clear; both teams in the scoreboard.
  await expect(breakdown.getByTestId("post-game-lane")).toBeVisible();
  await expect(breakdown.getByTestId("participant")).toHaveCount(10);
  await fitsWidth(page, "post-game view");
});

test("an iPhone 12 (390 × 844, its insets told): the opened game's header is at most 112px with the inset, and the result, loadout, runes, figures and lane are on the first screen", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone's game window (S6c's acceptance)");
  await page.setViewportSize({ width: 390, height: 844 });
  // The status bar and the home indicator of an iPhone 12 in Safari's installed app (CSS px).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, topMax: 47, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
  await openHistory(page, "MID");
  // The three newest games, one with a two-line lane (measured on main on the demo: the header 101px
  // with the 47px inset, 54px without).
  for (let i = 0; i < 3; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    await expect(breakdown.locator("details")).toHaveCount(0);
    const f = await page.evaluate(() => {
      const box = (id: string) => document.querySelector(`[data-testid=match-detail] [data-testid=${id}]`)?.getBoundingClientRect() ?? null;
      const parts = Object.fromEntries(["match-result", "post-game-loadout", "rune-page", "post-game-figures", "post-game-lane"].map((id) => [id, box(id)?.bottom ?? null]));
      // The first screen ends where the window's steps (Previous, Next) begin, or at the screen's foot.
      return { header: box("match-detail-header")!.bottom, end: box("match-detail-nav")?.top ?? innerHeight, parts };
    });
    expect(f.header, `game ${i}: the header with the inset`).toBeLessThanOrEqual(112);
    for (const [id, bottom] of Object.entries(f.parts)) {
      expect(bottom, `game ${i}: ${id} shown`).not.toBeNull();
      // 4px to spare: Chrome 156 (CI) lays text out wider than the container's Chromium.
      expect(bottom!, `game ${i}: ${id} on the first screen`).toBeLessThanOrEqual(f.end - 4);
    }
    await closeGame(card);
  }
});

test("a game without a timeline says so once, under its lane, whose 10:00 and 15:00 stay empty", async ({ page }) => {
  await openHistory(page, "TOP");
  for (let i = 0; i < 8; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    const lane = breakdown.getByTestId("post-game-lane");
    if ((await breakdown.getAttribute("data-timeline")) !== "ok" && (await lane.getAttribute("data-state")) === "clear") {
      await expect(breakdown.getByTestId("timeline-missing")).toHaveCount(1);
      await expect(lane.getByTestId("timeline-missing")).toHaveText("Timeline not available for this game");
      // Its 10:00 and 15:00 columns say nothing they cannot back; the end (from the record) stays.
      const cells = await lane.locator("tbody tr").evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent?.trim())));
      for (const [ten, fifteen, end] of cells) {
        expect([ten, fifteen]).toEqual(["—", "—"]);
        expect(end).toMatch(/^([+−±][\d,]+|—)$/);
      }
      return;
    }
    await closeGame(card);
  }
  throw new Error("no demo game without a timeline (and with a clear lane) among the newest eight");
});

test("a game with a timeline reads its lane at 10:00 and 15:00, says nothing missing, and asks for the timeline once", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) posts.push(r.headers()["next-action"]!);
  });
  await openHistory(page, "MID");
  for (let i = 0; i < 6; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const before = posts.length;
    const breakdown = await openGame(card);
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    const lane = breakdown.getByTestId("post-game-lane");
    if ((await breakdown.getAttribute("data-timeline")) === "ok" && (await lane.getAttribute("data-state")) === "clear") {
      await expect(breakdown.getByTestId("timeline-missing")).toHaveCount(0);
      const ten = await lane.locator("tbody tr").evaluateAll((rows) => rows.map((r) => r.querySelectorAll("td")[0]?.textContent?.trim()));
      expect(ten.some((c) => c !== "—"), "a figure at 10:00").toBe(true);
      // The game's requests settle (its record, the timeline, the groups and the rank check): the timeline once.
      await page.waitForTimeout(500);
      const mine = posts.slice(before);
      expect(new Set(mine).size, "no request asked twice").toBe(mine.length);
      await fitsWidth(page, "the lane");
      return;
    }
    await closeGame(card);
  }
  throw new Error("no demo game with a timeline and a clear lane among the newest six");
});
test("Previous and Next keep the open game's header in place; Escape closes and Back closes after three Nexts", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open the window (mobile-nav covers it)");
  await openHistory(page, "TOP");
  const cards = page.getByTestId("match-card");
  await openGame(cards.nth(1));
  const header = () => page.locator("li[data-expanded] [data-testid=match-card]");
  const y0 = (await header().boundingBox())!.y;
  const length = await page.evaluate(() => history.length);
  for (let i = 0; i < 3; i++) {
    const before = new URL(page.url()).searchParams.get("match");
    await page.getByTestId("game-header-next").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("match")).not.toBe(before);
    await expect(page.locator("li[data-expanded] [data-testid=match-breakdown]")).toBeVisible({ timeout: 15_000 });
    expect(Math.abs((await header().boundingBox())!.y - y0), "the header keeps its place").toBeLessThanOrEqual(2);
    // The focus stays on Next, in the game now open.
    await expect(page.locator("li[data-expanded] [data-testid=game-header-next]")).toBeFocused();
  }
  // Switching replaced the one entry the opening added.
  expect(await page.evaluate(() => history.length)).toBe(length);
  // Scrolled to the open game's end, its pinned strip leaves with it, never lying over the next card (G2-3).
  const region = page.locator("li[data-expanded] [data-testid=match-expanded]");
  await page.waitForTimeout(400);
  await page.evaluate((y) => window.scrollTo(0, y), await region.evaluate((e) => e.getBoundingClientRect().bottom + window.scrollY - 60));
  await expect(page.locator("li[data-expanded] [data-testid=match-unfold-header]")).toHaveAttribute("data-stuck", "true");
  const [strip, end] = await Promise.all([page.locator("li[data-expanded] [data-testid=match-unfold-header]").boundingBox(), region.boundingBox()]);
  expect(strip!.y + strip!.height, "the strip ends with its game").toBeLessThanOrEqual(end!.y + end!.height + 1);
  const last = new URL(page.url()).searchParams.get("match")!;
  await page.goBack();
  await expect(page.locator("li[data-expanded]")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("match")).toBeNull();
  await expect(page.locator(`[data-testid=match-row][data-match="${last}"]`)).toBeFocused();
  // Escape, with the focus in the open game, closes it and returns the focus to its card.
  await openGame(cards.nth(2));
  await page.locator("li[data-expanded] [data-testid=game-header-next]").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("li[data-expanded]")).toHaveCount(0);
  await expect(cards.nth(2).getByTestId("match-row")).toBeFocused();
});

test("a window 640–767px wide with a mouse (the phone's frame): a game opens as the window, its Close and Next in reach, nothing under the bars", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a narrow window: the desktop project, resized");
  for (const size of NARROW_MOUSE_WINDOWS) {
    await page.setViewportSize(size);
    await openHistory(page, "TOP");
    await openGame(page.getByTestId("match-card").nth(1));
    const win = page.locator("dialog[open][data-testid=match-detail]");
    await expect(win, `${size.width}×${size.height}`).toBeVisible();
    // Not under its card, where the pinned header and footer sat under the top bar and the tab bar.
    await expect(page.locator("li[data-expanded]")).toHaveCount(0);
    await expectInReach(page, [win.getByTestId("match-detail-close"), win.getByTestId("match-detail-next")]);
    await win.getByTestId("match-detail-close").click();
    await expect(win).toHaveCount(0);
  }
});
