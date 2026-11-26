import { expect, test, type Locator, type Page } from "./test";
import { closeGame, opensFullScreen, openGame, pastGameHeader, showGamePage } from "./match-history";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";
import { AxeBuilder } from "@axe-core/playwright";

/*
  A game's post-game view under its Match History card (demo data, in memory; on phones the window):
  one integrated view (the owner's brief of 24 Nov 2026): the player inspected (name, score with its
  place, the loadout, six figures, the other figures in three groups, Build Path | Skill Order |
  Runes over one fixed area, the lane) and both teams as one scoreboard with every player's score;
  nothing in it scrolls, and on a desktop the card and its game fit the window at 100% text. A
  phone's window shows one of three pages at a time (Player, Build, Scoreboard), each within its
  screen. The match timeline is asked for once as the game opens: the lane's 10:00 and 15:00, the
  build path, the skill order and the scores read it, for every player. Several demo games have no
  stored timeline (and the demo has no Riot key to fetch it). Removed and asserted gone: the notes
  (23 Nov 2026), the comparison select and table, the written "why", the team averages and the ten
  score tiles, the build path's legend and sideways row, the skill grid's sentence, and the grey
  notes under the scoreboard (24 Nov 2026).
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

/** The open game once the timeline, the possible groups and the rank check have answered: the view a reader looks at. */
async function settled(breakdown: Locator) {
  await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
  await expect(breakdown.getByTestId("possible-groups-note")).not.toHaveAttribute("data-state", "loading", { timeout: 15_000 });
  await expect(breakdown.getByTestId("ranks-note")).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  await expect(breakdown.locator("[data-testid=participant-rank][data-state=checking]")).toHaveCount(0, { timeout: 15_000 });
}

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

/**
 * What scrolls or is cut inside the open game (the owner's brief, §2): any element that is a scroll
 * container with more than it shows (overflow auto or scroll, and its content past its box), and any
 * element cut off sideways by an ancestor that clips (text ending in its own ellipsis aside).
 */
async function insideFaults(breakdown: Locator): Promise<string[]> {
  return breakdown.evaluate((bd) => {
    const out: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}]`;
    for (const el of [bd, ...bd.querySelectorAll("*")]) {
      const cs = getComputedStyle(el);
      if ((/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)) out.push(`${name(el)} scrolls`);
      const b = el.getBoundingClientRect();
      if (!b.width || el.closest(".sr-only") || el.closest("[hidden]")) continue;
      let p = el.parentElement;
      while (p && p !== bd.parentElement && !/(hidden|clip|auto|scroll)/.test(getComputedStyle(p).overflowX)) p = p.parentElement;
      if (p && p !== bd.parentElement && !p.classList.contains("truncate") && !p.closest(".truncate") && b.right > p.getBoundingClientRect().right + 1) out.push(`${name(el)} cut off`);
    }
    return [...new Set(out)];
  });
}

/** The open card and its game against the window: its height from the card's top to the game's end, and the room under what is pinned above the page. */
const openedFit = (page: Page) =>
  page.locator("li[data-expanded]").evaluate((li) => {
    const top = li.querySelector("[data-testid=match-card]")!.getBoundingClientRect().top;
    const height = Math.round(li.querySelector("[data-testid=match-expanded]")!.getBoundingClientRect().bottom - top);
    const pinned = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    return { height, room: Math.floor(innerHeight - pinned) };
  });

/** The removed parts, by their test ids, and their words. */
const REMOVED_PARTS = "[data-testid^=post-game-note], [data-testid^=notes-], [data-testid^=fold-], [data-testid=post-game-folds], [data-testid=gold-chart], [data-testid=performance-compare], [data-testid=performance-compare-table], [data-testid=performance-why], [data-testid=performance-trend], [data-testid=performance-teams], [data-testid=performance-strip], [data-testid=performance-tile], [data-testid=build-legend], [data-testid=build-row], [data-testid=score-chart-legend], [data-testid=inspected-jump], [data-testid=more-fold], [data-testid=performance-fold], [data-testid=performance], [data-testid=performance-chart-area], [data-testid=performance-chart-info], [data-testid=performance-timeline-missing], [data-testid=score-chart], [data-testid=score-chart-table]";
const REMOVED_WORDS = ["Went well", "Went wrong", "Focus next", "Gold over the game", "Build and skill order", "No comparison", "Compare with", "Stood out", "Held back", "Ranks around the time of this game", "not enough recorded history", "no other players to assess", "inferred from", "skill points in this game", "Maxed ", "Score through the game", "About the score through the game"];

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

test("one view: the loadout names itself, each figure once, the other figures in three groups, the lane and the scoreboard; no notes, narrative, comparison or folds", async ({ page }) => {
  await openHistory(page, "TOP");
  const breakdown = await openGame(page.getByTestId("match-card").nth(1));
  await settled(breakdown);
  await expect(breakdown.locator("[role=tab]")).toHaveCount(0);
  // No folds (a possible group's evidence aside, which opens under its line).
  await expect(breakdown.locator("details:not([data-testid=possible-group])")).toHaveCount(0);
  // The inventory: six slots and the trinket; an icon names itself on focus (and on a tap), inside the screen.
  await expect(breakdown.getByTestId("post-game-items").locator(":scope > *")).toHaveCount(7);
  const icon = breakdown.getByTestId("post-game-items").getByTestId("loadout-icon").first();
  await icon.focus();
  const name = breakdown.getByTestId("loadout-name").first();
  await expect(name).toHaveText((await icon.getAttribute("aria-label"))!);
  const box = (await name.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // Each of the player's figures once in the whole view: CS/min, KDA and damage share.
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
  expect(await tiles.locator(".truncate").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent)), "the figures' captions whole").toEqual([]);
  // The other figures (§7): three groups of aligned rows, every row there, a figure, "0" or "—", never a sentence.
  const more = breakdown.getByTestId("post-game-more");
  await expect(more.locator("section")).toHaveCount(3);
  await expect(more.locator("dl > div")).toHaveCount(8);
  for (const v of await more.locator("dd").allInnerTexts()) expect(v).toMatch(/^(—|[\d,.]+k?( s)?)$/);
  // The removed parts (23 and 24 Nov 2026), by their test ids and their words.
  await expect(breakdown.locator(REMOVED_PARTS)).toHaveCount(0);
  for (const word of REMOVED_WORDS) expect(text, `no "${word}"`).not.toContain(word);
  // The lane names the opponent or says it is not clear; both teams in the scoreboard.
  await showGamePage(breakdown, "build");
  await expect(breakdown.getByTestId("post-game-lane")).toBeVisible();
  await expect(breakdown.getByTestId("participant")).toHaveCount(10);
  // The game's patch by its public, year-based name, as everywhere else ("Patch 26.20", never the client's "16.20").
  const when = breakdown.getByTestId("match-breakdown-when");
  await showGamePage(breakdown, "board");
  if (await when.isVisible()) {
    await expect(when).toContainText(/Patch \d+\.\d+/);
    await expect(when).not.toContainText(/Patch 1\d\./);
  } else await expect(page.getByTestId("match-detail")).not.toContainText(/Patch 1\d\./);
  await fitsWidth(page, "post-game view");
  expect(await insideFaults(breakdown)).toEqual([]);
});

test("the other figures are ordered by role: a support's utility first, a jungler's objectives, a laner's combat", async ({ page }) => {
  for (const [role, first] of [["SUPPORT", "utility"], ["JUNGLE", "objectives"], ["TOP", "combat"]] as const) {
    await openHistory(page, role);
    const card = page.getByTestId("match-card").nth(0);
    const breakdown = await openGame(card);
    await expect(breakdown.getByTestId("post-game-more")).toHaveAttribute("data-order", new RegExp(`^${first} `));
    await closeGame(card);
  }
});

test("the footer's Previous, Next and Close exist only where the game is taller than the screen, and then show only once the card's have gone up", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open the game as a window, with one bar of steps");
  await openHistory(page, "TOP");
  await openGame(page.getByTestId("match-card").nth(1));
  const header = page.locator("li[data-expanded] [data-game-step][data-where=header]");
  const footer = page.locator("li[data-expanded] [data-testid=match-footer]");
  await expect(header).toBeInViewport();
  const fit = await openedFit(page);
  if (fit.height <= fit.room) {
    // A game that fits the screen spends no line on a footer: its card's steps are in view with all of it.
    await expect(footer).not.toHaveAttribute("data-needed", "true");
    await expect(footer.getByTestId("match-close")).toBeHidden();
  }
  // A window too short for the game: the footer is there, and shows its steps once the card's have gone up.
  // (Not under 481px: a window that short opens its games as the match window, posture.ts.)
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
  await expect(footer).toHaveAttribute("data-needed", "true");
  await page.locator("li[data-expanded] [data-testid=match-card]").evaluate((c) => c.scrollIntoView({ block: "center" }));
  await page.evaluate(() => window.scrollBy({ top: -2000, behavior: "instant" }));
  await page.locator("li[data-expanded] [data-testid=match-card]").scrollIntoViewIfNeeded();
  await expect(header).toBeInViewport();
  await expect(footer).toHaveAttribute("data-hidden", "true");
  await expect(footer.getByTestId("match-close")).toBeHidden();
  await pastGameHeader(page);
  await expect(footer).not.toHaveAttribute("data-hidden", "true");
  await expect(footer.getByTestId("match-close")).toBeVisible();
  await expect(footer.getByTestId("game-next")).toBeVisible();
});

test("phones: the game's window shows Player, Build and Scoreboard one at a time, each page within the screen at 100% text (375 × 667, 390 × 844 with its insets, 430 × 932)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone's game window");
  test.setTimeout(240_000);
  const cdp = await page.context().newCDPSession(page);
  for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844, insets: true }, { width: 430, height: 932 }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    // The status bar and the home indicator of an iPhone 12 in Safari's installed app (CSS px).
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: size.insets ? { top: 47, topMax: 47, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } : { top: 0, topMax: 0, bottom: 0, bottomMax: 0, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
    await openHistory(page, "MID");
    for (let i = 0; i < 3; i++) {
      const card = page.getByTestId("match-card").nth(i);
      const breakdown = await openGame(card);
      await settled(breakdown);
      const label = `${size.width}×${size.height} game ${i + 1}`;
      // (The three newest games, one with the demo's possible duo, at 375 × 667; the newest elsewhere.)
      if (i > 0 && size.width !== 375) {
        await closeGame(card);
        continue;
      }
      // The pages, the shared segmented control; the player's page first.
      await expect(breakdown.getByTestId("post-game-pages").getByRole("radio")).toHaveText(["Player", "Build", "Scoreboard"]);
      await expect(breakdown).toHaveAttribute("data-page", "player");
      if (size.insets) expect((await page.getByTestId("match-detail-header").boundingBox())!.y + (await page.getByTestId("match-detail-header").boundingBox())!.height, `${label}: the header with the inset`).toBeLessThanOrEqual(112);
      for (const p of ["player", "build", "board"] as const) {
        await showGamePage(breakdown, p);
        // Every panel of the build page too (each in the same area). A game without a timeline has
        // only Runes to show: Build Path and Skill Order are disabled there (the review of Release 17, finding 3).
        for (const panel of p === "build" ? ["build", "skills", "runes"] : [null]) {
          if (panel && !(await breakdown.getByTestId(`panel-${panel}`).isEnabled())) continue;
          if (panel) await breakdown.getByTestId(`panel-${panel}`).click();
          const f = await page.getByTestId("match-detail-body").evaluate((b) => ({ scroll: b.scrollHeight - b.clientHeight }));
          expect(f.scroll, `${label}, ${p}${panel ? ` (${panel})` : ""}: the window's body needs no scroll`).toBeLessThanOrEqual(1);
        }
        expect(await insideFaults(breakdown), `${label}, ${p}`).toEqual([]);
      }
      // A tap on a row inspects that player and shows their page.
      await showGamePage(breakdown, "board");
      const slot = (await breakdown.locator('[data-testid=participant-select]:not([aria-current="true"])').nth(3).getAttribute("data-slot"))!;
      const row = breakdown.locator(`[data-testid=participant-select][data-slot="${slot}"]`);
      const b = (await row.boundingBox())!;
      await page.touchscreen.tap(b.x + b.width - 50, b.y + b.height / 2);
      await expect(breakdown).toHaveAttribute("data-selected", slot);
      await expect(breakdown).toHaveAttribute("data-page", "player");
      await expect(breakdown.getByTestId("inspect-back")).toBeVisible();
      await closeGame(card);
    }
  }
});

test("a game without a timeline says so once, in the build path's place, and its lane shows the end alone (no columns of dashes at 10:00 and 15:00)", async ({ page }) => {
  await openHistory(page, "TOP");
  for (let i = 0; i < 8; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    const lane = breakdown.getByTestId("post-game-lane");
    if ((await breakdown.getAttribute("data-timeline")) !== "ok" && (await lane.getAttribute("data-state")) === "clear") {
      await showGamePage(breakdown, "build");
      await expect(breakdown.getByTestId("panel-timeline-missing")).toHaveText("Timeline not available for this game");
      await expect(lane.getByText(/timeline/i)).toHaveCount(0);
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
      await expect(breakdown.getByTestId("panel-timeline-missing")).toHaveCount(0);
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
  await settled(await openGame(cards.nth(1)));
  const header = () => page.locator("li[data-expanded] [data-testid=match-card]");
  // Opening moves the page once the game has grown open, just enough to show all of it (the review of
  // Release 17, finding 2): the header's place is read once that move has ended.
  await expect.poll(async () => { const a = await page.evaluate(() => scrollY); await page.waitForTimeout(400); return (await page.evaluate(() => scrollY)) - a; }, { timeout: 10_000 }).toBe(0);
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

test("every player has a performance score 0–10 beside their row with one place badge, one MVP (gold, the winning team) and one ACE (violet, the losing team); the player inspected shows theirs with its place and its (i); the score through the game is gone", async ({ page }) => {
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
  // The inspected player's score beside their name: the same figure and place as their row.
  const mine = breakdown.getByTestId("inspected-score");
  await expect(mine.getByTestId("performance-value")).toHaveText(/^\d+\.\d$/);
  await expect(mine.getByTestId("performance-rank")).toHaveText(/^\d+(st|nd|rd|th) of 10$/);
  const own = await breakdown.getAttribute("data-selected");
  const row = breakdown.locator(`[data-testid=participant][data-slot="${own}"] [data-testid=participant-score]`);
  expect(Number(await mine.getByTestId("performance-value").innerText())).toBe(Number(await row.getAttribute("data-score")));
  const n = Number(await row.getAttribute("data-rank"));
  const ordinal = `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
  await expect(mine.getByTestId("performance-rank")).toHaveText(`${ordinal} of 10`);
  // Its place badge, the shared one: MVP or ACE in place of the ordinal, the ordinal otherwise.
  const badge = mine.getByTestId("performance-mark");
  const word = (await row.getAttribute("data-mvp")) ? "MVP" : (await row.getAttribute("data-ace")) ? "ACE" : ordinal;
  await expect(badge.locator("[aria-hidden]")).toHaveText(word);
  // One (i) on the score, saying how it is worked out and that it is UNIIVERSE's own score, not another site's.
  const info = mine.getByTestId("performance-info");
  await expect(info).toHaveAccessibleName("About the performance score");
  await expect(info).toHaveAccessibleDescription(/^UNIIVERSE's own score, not OP\.GG's/);
  // Every row's badge: one look per kind (the fixed gold and violet tokens; other places the secondary text), the same size on every row.
  const looks = await breakdown.locator("[data-testid=participant-score] [data-placement]").evaluateAll((els) => {
    const probe = (token: string) => {
      const el = document.createElement("span");
      el.style.color = `var(${token})`;
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    const [gold, violet, muted] = [probe("--color-gold"), probe("--color-violet"), probe("--color-fg-muted")];
    return els.map((e) => ({ kind: e.getAttribute("data-placement"), colour: getComputedStyle(e).color === gold ? "gold" : getComputedStyle(e).color === violet ? "violet" : getComputedStyle(e).color === muted ? "muted" : getComputedStyle(e).color, h: Math.round(e.getBoundingClientRect().height), text: e.textContent }));
  });
  expect(looks).toHaveLength(10);
  for (const l of looks) expect(l.colour, `${l.kind}: ${l.text}`).toBe(l.kind === "mvp" ? "gold" : l.kind === "ace" ? "violet" : "muted");
  expect(new Set(looks.map((l) => l.h)).size, "one height for every badge").toBe(1);
  expect(looks.filter((l) => l.kind === "mvp").map((l) => l.text)).toEqual(["MVP"]);
  expect(looks.filter((l) => l.kind === "ace").map((l) => l.text)).toEqual(["ACE"]);
  // The score through the game is gone: no chart, no heading, no (i).
  await expect(breakdown.locator("[data-testid=performance], [data-testid=score-chart], [data-testid=performance-chart-info]")).toHaveCount(0);
  expect(await breakdown.innerText()).not.toMatch(/score through the game/i);
  // Never the other site's name for its score.
  expect(await breakdown.innerText()).not.toMatch(/OP Score/i);
});

test("Build Path, Skill Order and Runes: one segmented control over one fixed area; the build path wraps in game order with every purchase reachable, nothing scrolling; a game without a timeline says so plainly", async ({ page }) => {
  await openHistory(page, "MID");
  const { card, breakdown } = await openGameWithTimeline(page, true);
  await showGamePage(breakdown, "build");
  const panels = breakdown.getByTestId("participant-panels");
  await expect(panels.getByTestId("panel-tabs").getByRole("radio")).toHaveText(["Build Path", "Skill Order", "Runes"]);
  await expect(panels.getByTestId("panel-build")).toHaveAttribute("aria-checked", "true");
  // The build path: shop visits in game order, each with its time, the first at the start of the game, wrapping onto rows.
  const visits = panels.getByTestId("build-visit");
  expect(await visits.count()).toBeGreaterThan(2);
  const times = await visits.evaluateAll((els) => els.map((e) => e.textContent!.match(/(\d+):(\d\d)$/)!).map((m) => Number(m[1]) * 60 + Number(m[2])));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(times[0]).toBeLessThan(60);
  // Every purchase in the page, each item once; no legend under it, one (i) at most.
  const path = panels.getByTestId("build-path");
  expect(await panels.getByTestId("build-item").count()).toBe(Number(await path.getAttribute("data-path")));
  await expect(panels.getByTestId("build-legend")).toHaveCount(0);
  await expect(panels.getByTestId("build-info")).toHaveCount(1);
  expect(await insideFaults(breakdown)).toEqual([]);
  // The three share one area: switching moves nothing under it and keeps the panels' height.
  const under = breakdown.getByTestId("post-game-lane");
  const at = async () => ({ panels: Math.round((await panels.boundingBox())!.height), under: Math.round((await under.boundingBox())!.y) });
  const first = await at();
  // The skill order: Q, W, E and R by level, one point a level, and nothing written under the grid.
  await panels.getByTestId("panel-skills").click();
  const grid = panels.getByTestId("skill-grid");
  await expect(grid).toBeVisible();
  const levels = Number(await grid.getAttribute("data-levels"));
  expect(levels).toBeGreaterThanOrEqual(6);
  expect(levels).toBeLessThanOrEqual(18);
  await expect(grid.locator("p")).toHaveCount(0);
  expect(await at(), "the skill order in the same area").toEqual(first);
  // The rune page: both paths and the shards.
  await panels.getByTestId("panel-runes").click();
  await expect(panels.getByTestId("rune-page").locator("section")).toHaveCount(2);
  await expect(panels.getByTestId("rune-shards")).toBeVisible();
  expect(await at(), "the runes in the same area").toEqual(first);
  // The choice stays while another player is inspected.
  await showGamePage(breakdown, "board");
  await breakdown.getByTestId("participant-select").nth(6).click();
  await showGamePage(breakdown, "build");
  await expect(panels.getByTestId("panel-runes")).toHaveAttribute("aria-checked", "true");
  await panels.getByTestId("panel-build").click();
  // The area is sized per game (the review of Release 17, finding 3): as tall as the taller of the
  // skill grid and the rune page, both laid out in it, never a constant that leaves a band.
  const area = await panels.getByTestId("panel-body").evaluate((b) => ({ body: b.getBoundingClientRect().height, views: [...b.querySelectorAll(":scope > [data-view=runes], :scope > [data-view=skills]")].map((v) => v.getBoundingClientRect().height) }));
  expect(area.views).toHaveLength(2);
  expect(Math.abs(area.body - Math.max(...area.views)), "the area as tall as the skill grid or the rune page").toBeLessThanOrEqual(1);
  // A path too long for its area is split into pages of whole rows: every purchase is still in the
  // page, each page shown whole. Here the area is made short and narrow, as a long game's twenty
  // visits fill it: the two views that set its height are taken out and it is given 6rem (the area
  // is no longer a fixed min-height of its own since it is sized per game, so the min-height alone
  // no longer shortens it).
  await panels.locator("[data-testid=panel-body] > [data-view=runes], [data-testid=panel-body] > [data-view=skills]").evaluateAll((els) => els.forEach((el) => ((el as HTMLElement).style.display = "none")));
  await panels.getByTestId("panel-body").evaluate((el) => ((el as HTMLElement).style.minHeight = "6rem"));
  await panels.evaluate((el) => ((el as HTMLElement).style.width = "9rem"));
  const box = panels.getByTestId("build-path-box");
  await expect.poll(async () => Number(await box.getAttribute("data-pages"))).toBeGreaterThan(1);
  const pages = Number(await box.getAttribute("data-pages"));
  const total = Number(await path.getAttribute("data-path"));
  expect(await panels.getByTestId("build-item").count()).toBe(total);
  let seen = 0;
  for (let p = 0; p < pages; p++) {
    await panels.getByTestId("build-page").nth(p).click();
    await expect(box).toHaveAttribute("data-page", String(p));
    seen += await panels.locator("[data-testid=build-visit]:not([hidden]) [data-testid=build-item]").count();
    expect(await insideFaults(breakdown), `page ${p + 1}`).toEqual([]);
    // Each page within the area it was given.
    expect(await panels.getByTestId("panel-body").evaluate((b) => b.scrollHeight <= b.getBoundingClientRect().height + 1 && b.getBoundingClientRect().height <= parseFloat(getComputedStyle(b).minHeight) + 1), `page ${p + 1} within its area`).toBe(true);
  }
  expect(seen, "every purchase on one of the pages").toBe(total);
  await panels.evaluate((el) => (el as HTMLElement).style.removeProperty("width"));
  await panels.getByTestId("panel-body").evaluate((el) => (el as HTMLElement).style.removeProperty("min-height"));
  await panels.locator("[data-testid=panel-body] > [data-view]").evaluateAll((els) => els.forEach((el) => (el as HTMLElement).style.removeProperty("display")));
  await closeGame(card);
  // A game without a timeline opens on Runes: Build Path and Skill Order are disabled, with one quiet
  // phrase saying why beside the control, and no empty band (the area is the rune page's height).
  const none = await openGameWithTimeline(page, false);
  await showGamePage(none.breakdown, "build");
  const p2 = none.breakdown.getByTestId("participant-panels");
  await expect(p2.getByTestId("panel-timeline-missing")).toHaveText("Timeline not available for this game");
  await expect(p2.getByTestId("build-visit")).toHaveCount(0);
  await expect(p2).toHaveAttribute("data-panel", "runes");
  await expect(p2.getByTestId("panel-runes")).toHaveAttribute("aria-checked", "true");
  for (const k of ["build", "skills"]) {
    await expect(p2.getByTestId(`panel-${k}`)).toBeDisabled();
    await expect(p2.getByTestId(`panel-${k}`)).toHaveAccessibleDescription("Timeline not available for this game");
  }
  await expect(p2.getByTestId("rune-page")).toBeVisible();
  const runesArea = await p2.getByTestId("panel-body").evaluate((b) => b.getBoundingClientRect().height - b.querySelector("[data-testid=rune-page]")!.getBoundingClientRect().height);
  expect(runesArea, "no band under the rune page").toBeLessThanOrEqual(1);
  // Its final scores still stand, from the record (and no chart says the timeline is missing: it is gone).
  await expect(none.breakdown.getByTestId("performance-timeline-missing")).toHaveCount(0);
  await expect(none.breakdown.locator("[data-testid=participant-score][data-score]")).toHaveCount(10);
});

test("the longest demo build path is whole: every purchase in the page and shown, nothing scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the path's pages at every width: the Build Path test above");
  test.setTimeout(150_000);
  let best = { role: "", index: -1, path: 0 };
  for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]) {
    await openHistory(page, role);
    const cards = page.getByTestId("match-card");
    for (let i = 0; i < Math.min(await cards.count(), 6); i++) {
      const breakdown = await openGame(cards.nth(i));
      await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
      const path = breakdown.getByTestId("build-path");
      const n = (await path.count()) ? Number(await path.getAttribute("data-path")) : 0;
      if (n > best.path) best = { role, index: i, path: n };
      await closeGame(cards.nth(i));
    }
  }
  expect(best.path).toBeGreaterThan(10);
  await openHistory(page, best.role);
  const breakdown = await openGame(page.getByTestId("match-card").nth(best.index));
  await settled(breakdown);
  await showGamePage(breakdown, "build");
  const panels = breakdown.getByTestId("participant-panels");
  expect(await panels.getByTestId("build-item").count()).toBe(best.path);
  const pages = Number(await panels.getByTestId("build-path-box").getAttribute("data-pages"));
  let seen = 0;
  for (let p = 0; p < pages; p++) {
    if (pages > 1) await panels.getByTestId("build-page").nth(p).click();
    seen += await panels.locator("[data-testid=build-visit]:not([hidden]) [data-testid=build-item]").count();
    expect(await insideFaults(breakdown)).toEqual([]);
  }
  expect(seen).toBe(best.path);
});

test("a press on any scoreboard row inspects that player at once, with nothing fetched and nothing above the rows moving; arrows and Enter do the same; Back to returns", async ({ page }) => {
  test.skip(opensFullScreen(page), "a phone's rows show the player's page (the phone test above)");
  await openHistory(page, "MID");
  const { breakdown } = await openGameWithTimeline(page, true);
  await settled(breakdown);
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
  /** Where the rows, the panels and the lane are, and the view's height. */
  const layout = () =>
    breakdown.evaluate((bd) => {
      const y = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top * 2) / 2 : null);
      return {
        rows: [...bd.querySelectorAll("[data-testid=participant]")].map(y),
        panels: y(bd.querySelector("[data-testid=participant-panels]")),
        body: y(bd.querySelector("[data-testid=panel-body]")),
        lane: y(bd.querySelector("[data-testid=post-game-lane]")),
        height: Math.round(bd.getBoundingClientRect().height),
      };
    });
  const before = await layout();
  // An enemy's row: everything follows it.
  const slot = (await breakdown.locator('[data-testid=participant-select]:not([aria-current="true"])').nth(5).getAttribute("data-slot"))!;
  const target = breakdown.locator(`[data-testid=participant-select][data-slot="${slot}"]`);
  const rowName = (await breakdown.locator(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-name]`).innerText()).trim();
  await target.click();
  await expect(breakdown).toHaveAttribute("data-selected", slot);
  await expect(target).toHaveAttribute("aria-current", "true");
  await expect(breakdown.locator('[data-testid=participant-select][aria-current="true"]')).toHaveCount(1);
  await expect(name).toHaveText(rowName);
  await expect(breakdown.locator(`[data-testid=participant][data-slot="${slot}"]`)).toHaveAttribute("data-selected", "true");
  await expect(breakdown.getByTestId("inspect-back")).toBeVisible();
  await expect(breakdown.getByTestId("post-game-yours")).not.toHaveAttribute("data-own", "true");
  // Nothing fetched; the rows, the panels' area and the view's height where they were (±1px).
  expect(posts, "no request on switching").toEqual([]);
  const after = await layout();
  for (const [k, v] of Object.entries(before)) {
    const w = after[k as keyof typeof after];
    if (Array.isArray(v)) (v as Array<number | null>).forEach((y, i) => expect(Math.abs((w as Array<number | null>)[i]! - y!), `${k} ${i}`).toBeLessThanOrEqual(1));
    else expect(Math.abs((w as number) - (v as number)), k).toBeLessThanOrEqual(1);
  }
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

test("the names in the open game are the ones its card shows: a team member's profile name, else the Riot name", async ({ page }) => {
  test.skip(opensFullScreen(page), "a phone's card leaves both teams to the game's screen");
  await openHistory(page, "MID");
  const card = page.getByTestId("match-card").nth(0);
  // The card's names, before it folds into the open game's header.
  // The name's own line (its screen-reader words, the champion and the rank, follow it).
  const shown = (await card.getByTestId("team-slot-name").allInnerTexts()).map((t) => t.split("\n")[0]!.trim()).filter(Boolean).sort();
  const breakdown = await openGame(card);
  const rows = (await breakdown.locator("[data-testid=participant]:not([data-removed]) [data-testid=participant-name]").allInnerTexts()).map((t) => t.trim()).sort();
  expect(rows).toEqual(shown);
});

test("long names (a Riot name at its 16 characters with a long tag's worth of width, a long profile name) keep every row on its height, nothing cut off but by its own ellipsis", async ({ page }) => {
  await openHistory(page, "MID");
  const breakdown = await openGame(page.getByTestId("match-card").nth(1));
  await settled(breakdown);
  await showGamePage(breakdown, "board");
  const rows = breakdown.locator("[data-testid=participant]");
  const before = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  // The longest names a scoreboard can hold, written into the page (demo names are short).
  await breakdown.evaluate((bd) => {
    for (const a of bd.querySelectorAll("[data-testid=participant-name] [data-testid=player-link], [data-testid=participant-name] > span:not(.sr-only)")) a.textContent = "Wwwwwwwwwwwwwwww Mmmmmmmmmmmmmmmmmmmm";
    const name = bd.querySelector("[data-testid=inspected-name]");
    if (name) name.textContent = "Wwwwwwwwwwwwwwww Mmmmmmmmmmmmmmmmmmmm";
  });
  expect(await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))).toEqual(before);
  expect(await insideFaults(breakdown)).toEqual([]);
  await fitsWidth(page, "long names");
});

test("a 320px phone at 200% text: the open game's pages, its three panels and the scoreboard never scroll sideways or cut anything off, and every rank stays whole", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone's large text (CDP's font sizes)");
  await page.setViewportSize({ width: 320, height: 568 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  await openHistory(page, "MID");
  const { breakdown } = await openGameWithTimeline(page, true);
  const faults = async () => {
    const out = await insideFaults(breakdown);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (wide > 1) out.push(`page ${wide}px wider`);
    const ranks = await breakdown.locator("[data-testid=participant-rank-text]").evaluateAll((els) => els.filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).length);
    if (ranks) out.push(`${ranks} ranks shortened`);
    return out;
  };
  expect(await faults(), "the player").toEqual([]);
  await showGamePage(breakdown, "build");
  for (const k of ["build", "skills", "runes"]) {
    await breakdown.getByTestId(`panel-${k}`).click();
    expect(await faults(), k).toEqual([]);
  }
  await showGamePage(breakdown, "board");
  expect(await faults(), "the scoreboard").toEqual([]);
  // Another player inspected (their page shown).
  await breakdown.getByTestId("participant-select").nth(6).click();
  expect(await faults(), "another player inspected").toEqual([]);
});

test("the keyboard: Build Path | Skill Order | Runes is one tab stop, arrows move within; Escape from it closes the game", async ({ page }) => {
  test.skip(opensFullScreen(page), "the game under its card (a phone's window closes on its own Escape)");
  await openHistory(page, "MID");
  const { card, breakdown } = await openGameWithTimeline(page, true);
  const radios = breakdown.getByTestId("panel-tabs").getByRole("radio");
  expect(await radios.evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
  await breakdown.getByTestId("panel-build").focus();
  await page.keyboard.press("ArrowRight");
  await expect(breakdown.getByTestId("panel-skills")).toHaveAttribute("aria-checked", "true");
  await expect(breakdown.getByTestId("panel-skills")).toBeFocused();
  // Escape closes the game (the closed list keeps no Escape for itself).
  await page.keyboard.press("Escape");
  await expect(page.locator("li[data-expanded]")).toHaveCount(0);
  await expect(card.getByTestId("match-row")).toBeFocused();
});

// The review of Release 17, finding 2: with animations on, a game opened from a card in the upper part
// of the screen was measured while it was still growing open, so its end stayed 155–237px below the
// fold. Most specs here run with reduced motion; this one runs with motion on.
test("desktop with motion on: a game opened from a card in the upper half of the screen ends within the window, under the pinned bars", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop's one-screen post-game view");
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(size);
    await openHistory(page, "MID");
    // A card whose top can sit at about half the screen's height (the upper 55% is left where it is
    // as it opens; a short list on a tall screen cannot scroll its first cards that far down).
    let card = page.getByTestId("match-card").first();
    let before = 0;
    for (let i = 1; i < 8; i++) {
      card = page.getByTestId("match-card").nth(i);
      before = await card.evaluate((c) => {
        window.scrollBy({ top: c.getBoundingClientRect().top - innerHeight / 2, behavior: "instant" });
        return c.getBoundingClientRect().top;
      });
      if (before > size.height * 0.45 && before < size.height * 0.55) break;
    }
    expect(before, `${size.width}: the card in the upper part of the screen`).toBeLessThan(size.height * 0.55);
    expect(before).toBeGreaterThan(size.height * 0.45);
    const breakdown = await openGame(card);
    await settled(breakdown);
    const label = `${size.width}×${size.height}`;
    // The game is taller than what was left under the card: the page has to move for it to end within the window.
    expect(before + (await openedFit(page)).height, `${label}: the game ran past the window as it opened`).toBeGreaterThan(size.height);
    await expect
      .poll(
        () =>
          page.locator("li[data-expanded]").evaluate((li) => {
            const top = li.querySelector("[data-testid=match-card]")!.getBoundingClientRect().top;
            const end = li.querySelector("[data-testid=match-expanded]")!.getBoundingClientRect().bottom;
            const pinned = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            return end <= innerHeight + 1 && top >= pinned - 1;
          }),
        { message: `${label}: the card under the pinned bars and the game's end within the window`, timeout: 5_000 },
      )
      .toBe(true);
    await closeGame(card);
  }
});

// The review of Release 17, finding 1: on a phone at 200% text the window's body scrolled sideways on
// the Player page (580px of content in 388), labels and figures ended in an ellipsis, the title lost
// the champion's name and the footer took 225px with Previous and Next stacked. Large text may
// reflow and scroll vertically (the brief, §2); it must never scroll sideways or cut a label short.
test("a phone at 200% text (390 × 844, 375 × 667): the game window never scrolls sideways, keeps the champion in its title, cuts no label or figure short, and keeps Previous, Next and the position on one compact row", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone's large text (CDP's font sizes)");
  test.setTimeout(150_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(size);
    await openHistory(page, "MID");
    const { breakdown } = await openGameWithTimeline(page, true);
    const win = page.getByTestId("match-detail");
    const label = `${size.width}×${size.height}`;
    const faults = () =>
      win.evaluate((w) => {
        const out: string[] = [];
        const body = w.querySelector<HTMLElement>("[data-testid=match-detail-body]")!;
        if (body.scrollWidth > body.clientWidth + 1) out.push(`body ${body.scrollWidth}px wide in ${body.clientWidth}`);
        for (const el of w.querySelectorAll<HTMLElement>("[data-testid=match-breakdown] *, [data-testid=match-detail-header] *")) {
          if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden" || el.closest("[data-testid=participant-name]")) continue;
          if (getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) out.push(`"${el.textContent?.trim()}" shortened`);
        }
        const title = w.querySelector<HTMLElement>("#match-detail-title")!;
        const champion = w.querySelector<HTMLElement>("[data-testid=match-detail-champion]")!;
        if (champion.getBoundingClientRect().width < 20 || champion.getBoundingClientRect().right > title.getBoundingClientRect().right + 1) out.push("the champion cut from the title");
        return out;
      });
    for (const p of ["player", "build", "board"] as const) {
      await showGamePage(breakdown, p);
      expect(await faults(), `${label}, ${p}`).toEqual([]);
    }
    await showGamePage(breakdown, "build");
    for (const k of ["skills", "runes", "build"]) {
      await breakdown.getByTestId(`panel-${k}`).click();
      expect(await faults(), `${label}, ${k}`).toEqual([]);
    }
    // The footer: one row of 44px buttons and the position between them.
    const nav = await win.getByTestId("match-detail-nav").evaluate((n) => {
      const mid = (id: string) => {
        const b = n.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect();
        return b.top + b.height / 2;
      };
      return { height: n.getBoundingClientRect().height, prev: mid("match-detail-prev"), at: mid("match-detail-position"), next: mid("match-detail-next") };
    });
    expect(nav.height, `${label}: the footer's row`).toBeLessThanOrEqual(64);
    expect(Math.abs(nav.prev - nav.next), `${label}: Previous and Next side by side`).toBeLessThanOrEqual(1);
    expect(Math.abs(nav.prev - nav.at), `${label}: the position between them`).toBeLessThanOrEqual(1);
    await expect(win.getByTestId("match-detail-next")).toHaveAccessibleName("Next game");
    await win.getByTestId("match-detail-close").click();
    await expect(win).toHaveCount(0);
  }
});

// The owner's brief of 24 Nov 2026, §2: on a desktop the opened game (its card with Previous, Next
// and Close, and the breakdown) fits the window at 100% text, with nothing inside it scrolling, at
// every common desktop size, the sidebar open or collapsed. Every role's first games, read once the
// timeline, the groups and the ranks have settled (with reduced motion every style change still runs
// for 0.01ms, globals.css). The Production check holds 1440 × 900 and 1280 × 720 on real games.
for (const sidebar of ["expanded", "collapsed"] as const) {
  test(`desktop, the sidebar ${sidebar}: every opened game and its card fit the window with nothing inside scrolling, at 1280 × 720, 1366 × 768, 1440 × 900 and 1920 × 1080`, async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "the desktop's one-screen post-game view");
    test.setTimeout(420_000);
    await page.context().addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: baseURL! }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    let grouped = 0;
    for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      // Every role at the smallest size; one role each at the others.
      for (const role of size.width === 1280 ? ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] : [["MID", "SUPPORT", "TOP"][size.width % 3]!]) {
        await openHistory(page, role);
        const cards = page.getByTestId("match-card");
        for (let i = 0; i < Math.min(await cards.count(), size.width === 1280 ? 6 : 3); i++) {
          const card = cards.nth(i);
          const breakdown = await openGame(card);
          await settled(breakdown);
          grouped += (await breakdown.getByTestId("possible-group").count()) > 0 ? 1 : 0;
          const label = `${size.width}×${size.height}, ${role} game ${i + 1}`;
          await expect.poll(async () => { const f = await openedFit(page); return f.height - f.room; }, { message: `${label}: the card and its game within the room under the pinned bars`, timeout: 5_000 }).toBeLessThanOrEqual(0);
          expect(await insideFaults(breakdown), label).toEqual([]);
          await closeGame(card);
        }
      }
    }
    // The demo's recurring pair is in some of these games: a possible group's line is covered.
    expect(grouped).toBeGreaterThan(0);
  });
}
