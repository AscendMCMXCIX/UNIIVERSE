import { expect, test, type Locator, type Page } from "./test";
import { closeGame, opensFullScreen, openGame, pastGameHeader } from "./match-history";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";
import { optionsOf, pick } from "./select";
import { AxeBuilder } from "@axe-core/playwright";

/*
  A game's post-game view under its Match History card (demo data, in memory; on phones the window):
  one view without subtabs and without folds (the player inspected: the loadout, six figure tiles
  with each of their figures once, Build Path | Skill Order | Runes, the lane; and the compact
  scoreboard with every player's performance score), the open card folded into a header with
  Previous, Next and Close, and one history rule (Back closes the game, however many games were
  stepped through). The match timeline is asked for once as the game opens: the lane's 10:00 and
  15:00, the build path, the skill order and the scores read it, for every player. Several demo
  games have no stored timeline (and the demo has no Riot key to fetch it). Since 23 Nov 2026 (the
  owner's request) the view has no notes (Went well, Went wrong, Focus next) and no gold curve: the
  tests below check they stay gone. Release 16: any of the ten players inspected from the
  scoreboard, with nothing more fetched (match-breakdown's last tests).
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

/** On a phone (its window held to two screens) the support figures and the score's why, tiles and chart sit behind one fold each (Release 16); elsewhere there are none. */
async function expectPhoneFoldsOnly(page: Page, breakdown: Locator) {
  if (opensFullScreen(page)) {
    await expect(breakdown.locator("details")).toHaveCount(await breakdown.locator("details[data-testid=more-fold], details[data-testid=performance-fold]").count());
    expect(await breakdown.locator("details[data-testid=performance-fold]").count()).toBeLessThanOrEqual(1);
  } else await expect(breakdown.locator("details")).toHaveCount(0);
}

/** The score's fold open, where there is one (a phone). */
async function openScoreFold(breakdown: Locator) {
  const fold = breakdown.locator("details[data-testid=performance-fold]");
  if ((await fold.count()) && !(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await fold.locator("summary").click();
}

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

/** The removed sections' names: none of them is in an open game. */
const REMOVED = ["Went well", "Went wrong", "Focus next", "Gold over the game", "Build and skill order"];
/* "Build and skill order" was the removed fold's name; the headings that came back are "Build Path" and "Skill Order". */

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
  await expectPhoneFoldsOnly(page, breakdown);
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
  await expect(breakdown.locator("[data-testid^=post-game-note], [data-testid^=notes-], [data-testid^=fold-], [data-testid=post-game-folds], [data-testid=gold-chart]")).toHaveCount(0);
  for (const word of REMOVED) expect(text, `no "${word}"`).not.toContain(word);
  // The lane names the opponent or says it is not clear; both teams in the scoreboard.
  await expect(breakdown.getByTestId("post-game-lane")).toBeVisible();
  await expect(breakdown.getByTestId("participant")).toHaveCount(10);
  // The game's patch by its public, year-based name, as everywhere else ("Patch 26.20", never the client's "16.20"; the review of Release 13, finding 10).
  const when = breakdown.getByTestId("match-breakdown-when");
  if (await when.isVisible()) {
    await expect(when).toContainText(/Patch \d+\.\d+/);
    await expect(when).not.toContainText(/Patch 1\d\./);
  } else await expect(page.getByTestId("match-detail")).not.toContainText(/Patch 1\d\./);
  await fitsWidth(page, "post-game view");
});

test("one set of Previous, Next and Close at a time: the footer shows its own only once the card's have gone up", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open the game as a window, with one bar of steps");
  await openHistory(page, "TOP");
  await openGame(page.getByTestId("match-card").nth(1));
  const header = page.locator("li[data-expanded] [data-game-step][data-where=header]");
  const footer = page.locator("li[data-expanded] [data-testid=match-footer]");
  // The card's own on screen: the footer keeps its place and shows nothing (nor can the keyboard reach it).
  await expect(header).toBeInViewport();
  await expect(footer).toHaveAttribute("data-hidden", "true");
  await expect(footer.getByTestId("match-close")).toBeHidden();
  // Scrolled until the card's have gone up under the pinned bars: the footer's show.
  await pastGameHeader(page);
  await expect(footer).not.toHaveAttribute("data-hidden", "true");
  await expect(footer.getByTestId("match-close")).toBeVisible();
  await expect(footer.getByTestId("game-next")).toBeVisible();
});

test("an iPhone 12 (390 × 844, its insets told): the opened game's header is at most 112px with the inset, and the result, the player inspected, the loadout, the figures and the Build Path | Skill Order | Runes headings are on the first screen", async ({ page }, info) => {
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
    await expectPhoneFoldsOnly(page, breakdown);
    const f = await page.evaluate(() => {
      const box = (id: string) => document.querySelector(`[data-testid=match-detail] [data-testid=${id}]`)?.getBoundingClientRect() ?? null;
      // Release 16: the three headings above the lane (the owner's request) take the lane's place on the first screen.
      const parts = Object.fromEntries(["match-result", "inspected", "post-game-loadout", "post-game-figures", "panel-tabs"].map((id) => [id, box(id)?.bottom ?? null]));
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

test("a game without a timeline says so once, under its lane, which shows the end alone (no columns of dashes at 10:00 and 15:00)", async ({ page }) => {
  await openHistory(page, "TOP");
  for (let i = 0; i < 8; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    const lane = breakdown.getByTestId("post-game-lane");
    if ((await breakdown.getAttribute("data-timeline")) !== "ok" && (await lane.getAttribute("data-state")) === "clear") {
      await expect(breakdown.getByTestId("timeline-missing")).toHaveCount(1);
      await expect(lane.getByTestId("timeline-missing")).toHaveText("Timeline not available for this game");
      // No 10:00 and 15:00 columns of dashes (the review of Release 13, finding 10): the end alone, from the record.
      await expect(lane.locator("thead th")).toHaveCount(2);
      await expect(lane.locator("thead th").last()).toHaveText("End");
      await expect(lane).not.toContainText("10:00");
      const cells = await lane.locator("tbody tr").evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent?.trim())));
      for (const row of cells) {
        expect(row).toHaveLength(1);
        expect(row[0]).toMatch(/^([+−±][\d,]+|—)$/);
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

/** The first of the newest games whose stored timeline answered `ok` (want true) or not (false), opened. */
async function openGameWithTimeline(page: Page, want: boolean, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    if (((await breakdown.getAttribute("data-timeline")) === "ok") === want) return { card, breakdown };
    await closeGame(card);
  }
  throw new Error(`no demo game ${want ? "with" : "without"} a timeline among the newest ${tries}`);
}

test("every player has a performance score 0–10 beside their row, one MVP on the winning side and one ACE on the losing side, and the panel says why", async ({ page }) => {
  await openHistory(page, "MID");
  const { breakdown } = await openGameWithTimeline(page, true);
  const scores = breakdown.locator("[data-testid=participant-score][data-score]");
  await expect(scores).toHaveCount(10);
  for (const s of await scores.evaluateAll((els) => els.map((e) => e.getAttribute("data-score")))) {
    expect(s).toMatch(/^\d+(\.\d)?$/);
    expect(Number(s)).toBeGreaterThanOrEqual(0);
    expect(Number(s)).toBeLessThanOrEqual(10);
  }
  await expect(breakdown.getByTestId("participant-mvp")).toHaveCount(1);
  await expect(breakdown.getByTestId("participant-ace")).toHaveCount(1);
  // MVP on the side that won, ACE on the side that lost (the team's band says which, in words).
  const sideOf = (id: string) => breakdown.getByTestId(id).locator("xpath=ancestor::section[starts-with(@data-testid,'team-')]").getAttribute("aria-label");
  expect(await sideOf("participant-mvp")).toMatch(/victory$/);
  expect(await sideOf("participant-ace")).toMatch(/defeat$/);
  // Each rank once, 1st to 10th.
  const ranks = await scores.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-rank"))).sort((a, b) => a - b));
  expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const panel = breakdown.getByTestId("performance");
  await expect(panel.getByTestId("performance-value")).toHaveText(/^\d+\.\d$/);
  await expect(panel.getByTestId("performance-rank")).toHaveText(/^\d+(st|nd|rd|th) of 10$/);
  // The score through the game: points every five minutes and the end, its figures in a table for screen readers (on a phone, in the score's fold).
  await openScoreFold(breakdown);
  const chart = panel.getByTestId("score-chart");
  await expect(chart).toBeVisible();
  expect(Number(await chart.getAttribute("data-points"))).toBeGreaterThanOrEqual(3);
  await expect(chart.getByTestId("score-chart-table").locator("tbody tr").last().locator("th")).toHaveText(/^End \(\d+:\d\d\)$/);
  // Each team's mean on one bar, the winners first, and the ten scores as tiles: a tile inspects its player.
  // In the scoreboard's order, each with its side and result in words (never a result told by the side's colour).
  const sides = await breakdown.locator("section[data-testid^=team-]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.replace(/ team, /, " · ").replace(/victory|defeat/, (w) => w[0]!.toUpperCase() + w.slice(1))));
  await expect(panel.getByTestId("performance-teams")).toContainText(new RegExp(`^${sides[0]} \\d+\\.\\d.*\\d+\\.\\d ${sides[1]}`));
  const tiles = panel.getByTestId("performance-tile");
  await expect(tiles).toHaveCount(10);
  const tile = panel.locator('[data-testid=performance-tile]:not([aria-current="true"])').first();
  const slot = (await tile.getAttribute("data-slot"))!;
  await tile.click();
  await expect(breakdown).toHaveAttribute("data-selected", slot);
  await expect(panel.locator(`[data-testid=performance-tile][data-slot="${slot}"]`)).toHaveAttribute("aria-current", "true");
  // Never the other site's name for its score.
  expect(await breakdown.innerText()).not.toMatch(/OP Score/i);
});

test("Build Path, Skill Order and Runes above the lane: purchases with their times, a grid of skill points, and the rune page; a game without a timeline says so plainly", async ({ page }) => {
  await openHistory(page, "MID");
  const { card, breakdown } = await openGameWithTimeline(page, true);
  const panels = breakdown.getByTestId("participant-panels");
  // Above the lane, in order, one shown at a time (radios, not tabs).
  const lane = breakdown.getByTestId("post-game-lane");
  expect((await panels.boundingBox())!.y).toBeLessThan((await lane.boundingBox())!.y);
  await expect(panels.getByTestId("panel-tabs").getByRole("radio")).toHaveText(["Build Path", "Skill Order", "Runes"]);
  await expect(panels.getByTestId("panel-build")).toHaveAttribute("aria-checked", "true");
  // The build path: shop visits in order, each with its game time, the first at the start of the game.
  const visits = panels.getByTestId("build-visit");
  expect(await visits.count()).toBeGreaterThan(2);
  const times = await visits.evaluateAll((els) => els.map((e) => e.textContent!.match(/(\d+):(\d\d)$/)!).map((m) => Number(m[1]) * 60 + Number(m[2])));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(times[0]).toBeLessThan(60);
  await expect(panels.getByTestId("build-legend")).toContainText("Undone purchases are left out.");
  // The skill order: Q, W, E and R by level, one point a level.
  await panels.getByTestId("panel-skills").click();
  const grid = panels.getByTestId("skill-grid");
  await expect(grid).toBeVisible();
  const levels = Number(await grid.getAttribute("data-levels"));
  expect(levels).toBeGreaterThanOrEqual(6);
  expect(levels).toBeLessThanOrEqual(18);
  // The rune page: both paths and the shards.
  await panels.getByTestId("panel-runes").click();
  await expect(panels.getByTestId("rune-page").locator("section")).toHaveCount(2);
  await expect(panels.getByTestId("rune-shards")).toBeVisible();
  // The choice stays while another player is inspected.
  await breakdown.getByTestId("participant-select").nth(6).click();
  await expect(panels.getByTestId("panel-runes")).toHaveAttribute("aria-checked", "true");
  await closeGame(card);
  // A game without a timeline: one plain line in the build path's place.
  const none = await openGameWithTimeline(page, false);
  const p2 = none.breakdown.getByTestId("participant-panels");
  await expect(p2.getByTestId("panel-timeline-missing")).toHaveText(/^Timeline not available for this game/);
  await expect(p2.getByTestId("build-visit")).toHaveCount(0);
  await openScoreFold(none.breakdown);
  await expect(none.breakdown.getByTestId("performance-timeline-missing")).toBeVisible();
  // Its final scores still stand, from the record.
  await expect(none.breakdown.locator("[data-testid=participant-score][data-score]")).toHaveCount(10);
});

test("a press on any scoreboard row inspects that player at once, with nothing fetched and the page where it was; arrows and Enter do the same; Back to returns", async ({ page }) => {
  await openHistory(page, "MID");
  const { breakdown } = await openGameWithTimeline(page, true);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) posts.push(r.url());
  });
  await page.waitForTimeout(800);
  posts.length = 0;
  const rows = breakdown.getByTestId("participant-select");
  await expect(rows).toHaveCount(10);
  const own = Number(await breakdown.getAttribute("data-selected"));
  await expect(breakdown.locator(`[data-testid=participant-select][data-slot="${own}"]`)).toHaveAttribute("aria-current", "true");
  const name = breakdown.getByTestId("inspected-name");
  const first = await name.innerText();
  const address = page.url();
  // An enemy's row: everything follows it.
  const slot = (await breakdown.locator('[data-testid=participant-select]:not([aria-current="true"])').nth(5).getAttribute("data-slot"))!;
  const target = breakdown.locator(`[data-testid=participant-select][data-slot="${slot}"]`);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  // Where the row is on the screen: it stays under the pointer (stacked, the browser's scroll anchoring keeps it there as the player above changes height).
  const y = (await target.boundingBox())!.y;
  const rowName = (await breakdown.locator(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-name]`).innerText()).trim();
  await target.click();
  await expect(breakdown).toHaveAttribute("data-selected", slot);
  await expect(target).toHaveAttribute("aria-current", "true");
  await expect(breakdown.locator('[data-testid=participant-select][aria-current="true"]')).toHaveCount(1);
  await expect(name).toHaveText(rowName);
  await expect(breakdown.locator(`[data-testid=participant][data-slot="${slot}"]`)).toHaveAttribute("data-selected", "true");
  await expect(breakdown.getByTestId("inspect-back")).toBeVisible();
  await expect(breakdown.getByTestId("post-game-yours")).not.toHaveAttribute("data-own", "true");
  // Nothing fetched and nothing moved: the record and the timeline already hold all ten.
  expect(posts, "no request on switching").toEqual([]);
  expect(Math.abs((await target.boundingBox())!.y - y), "the row pressed stays where it was (sub-pixel anchoring aside)").toBeLessThanOrEqual(2);
  // Not in the address: Back would still close the game.
  expect(page.url()).toBe(address);
  // The keyboard: Down to the next row, Enter inspects it.
  await target.focus();
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-slot"));
  expect(focused).toBeTruthy();
  expect(focused).not.toBe(slot);
  await page.keyboard.press("Enter");
  await expect(breakdown).toHaveAttribute("data-selected", focused!);
  // Back to the profile's player.
  await breakdown.getByTestId("inspect-back").click();
  await expect(breakdown).toHaveAttribute("data-selected", String(own));
  await expect(name).toHaveText(first);
  expect(posts, "no request on switching back").toEqual([]);
  await fitsWidth(page, "an inspected player");
});

test("compare: a second player's line on the same chart and their key figures side by side", async ({ page }) => {
  await openHistory(page, "MID");
  const { breakdown } = await openGameWithTimeline(page, true);
  const panel = breakdown.getByTestId("performance");
  await expect(panel.getByTestId("score-chart")).toHaveAttribute("data-series", "1");
  // The lane opponent first in the list (after "No comparison"), in whichever form the Select has here.
  const compare = panel.getByTestId("performance-compare");
  const options = await optionsOf(compare);
  expect(options[0]!.label).toBe("No comparison");
  expect(options[1]!.label).toContain("(lane opponent)");
  await pick(compare, { label: options[1]!.label });
  await expect(panel.getByTestId("score-chart")).toHaveAttribute("data-series", "2");
  await expect(panel.getByTestId("score-chart-legend")).toHaveCount(2);
  const table = panel.getByTestId("performance-compare-table");
  await expect(table.locator("tbody tr")).toHaveCount(7);
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText([/^\d+\.\d$/, /^\d+\.\d$/]);
  // Each of the inspected player's figures still once in the view ("/ min" and "KDA" captions only in their tiles).
  const text = await breakdown.innerText();
  const cspm = (await breakdown.getByTestId("figure-cs").innerText()).match(/(\d+\.\d) \/ min/)![1]!;
  expect(text.split(`${cspm} / min`).length - 1).toBe(1);
  await fitsWidth(page, "the comparison");
});

test("a 320px phone at 200% text: the open game, its three headings, the scoreboard and the comparison never scroll sideways or cut anything off, and every rank stays whole", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone's large text (CDP's font sizes)");
  await page.setViewportSize({ width: 320, height: 568 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  await openHistory(page, "MID");
  const { breakdown } = await openGameWithTimeline(page, true);
  /** Sideways scroll anywhere, an element cut off by a box that clips it (text ending in its own ellipsis and a segmented group's own scroll aside), and ranks shortened. */
  const faults = () =>
    page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page ${document.documentElement.scrollWidth - innerWidth}px wider`);
      for (const el of document.querySelectorAll("[data-testid=match-breakdown] *")) {
        const b = el.getBoundingClientRect();
        if (!b.width || el.closest(".sr-only") || el.closest("[role=radiogroup]")) continue;
        if (b.right > innerWidth + 1 && !el.parentElement?.closest(".truncate")) out.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] past the screen`);
        let p = el.parentElement;
        while (p && !/(hidden|clip|auto|scroll)/.test(getComputedStyle(p).overflowX)) p = p.parentElement;
        if (p && !p.classList.contains("truncate") && p.closest("[data-testid=match-breakdown]") && b.right > p.getBoundingClientRect().right + 1) out.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] cut off`);
      }
      const ranks = [...document.querySelectorAll("[data-testid=match-breakdown] [data-testid=participant-rank-text]")].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
      if (ranks) out.push(`${ranks} ranks shortened`);
      return [...new Set(out)];
    });
  expect(await faults(), "the open game").toEqual([]);
  for (const k of ["skills", "runes"]) {
    await breakdown.getByTestId(`panel-${k}`).click();
    expect(await faults(), k).toEqual([]);
  }
  await breakdown.getByTestId("participant-select").nth(6).click();
  const compare = breakdown.getByTestId("performance-compare");
  await pick(compare, { label: (await optionsOf(compare))[1]!.label });
  await expect(breakdown.getByTestId("performance-compare-table")).toBeVisible();
  expect(await faults(), "another player inspected, compared").toEqual([]);
});
