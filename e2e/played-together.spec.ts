import { expect, test, type Page } from "./test";
import { pick } from "./select";
import { openTogether } from "./match-history";
import { openFilterBar } from "./filters";
import { demoSeasonLabel } from "./demo-season";

/*
  Team → Matches → Played together on the demo roster. The shared games are synthetic demo games
  (demo mode only, match ids DEMO_9…), never real Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phones fold the filters behind one button (shared helper: waits for the bar, retries the toggle). */
async function showFilters(page: Page) {
  await openFilterBar(page.getByTestId("together-filters"), "together-filters-toggle");
}

/** A member's CS and damage as the card writes them ("212 CS · 23.4k dmg", "— CS" without a record). */
const CS_AND_DAMAGE = /^(\d+|—) CS( · \d+\.\dk dmg)?$/;

test("Played together lists games with two or more members on one side, with honest labels and filters", async ({ page, request }) => {
  const season = await demoSeasonLabel(request);
  // Played together is the whole page: Encounters are in each profile's Match History.
  await page.goto("/matches");
  await expect(page.getByTestId("matches-tabs")).toHaveCount(0);
  // One line of what is counted; what it proves is behind (i), never claimed as a premade party.
  const summary = page.getByTestId("matches-summary");
  await expect(summary).toContainText(new RegExp(`${season} · \\d+ games? played together`));
  await expect(summary.getByRole("button", { name: "How games played together are found" })).toHaveAccessibleDescription(/Riot doesn't say who queued together, so not necessarily a party/);
  // No "played together most" ranking: the games come right after the toolbar.
  await expect(page.getByTestId("together-pairs")).toHaveCount(0);
  await expect(page.getByText("Played together most")).toHaveCount(0);
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  // The first game starts within the first screen on wide screens and about one screen on phones.
  const top = await games.first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  expect(top).toBeLessThan((page.viewportSize()?.width ?? 0) < 640 ? 640 : 500);
  // Phones: the filters are folded behind one summary button.
  if ((page.viewportSize()?.width ?? 0) < 640) {
    await expect(page.getByTestId("together-queue")).toBeHidden();
    await expect(page.getByTestId("together-filters-toggle")).toContainText(`${season} · All supported games · 2+ members`);
  }
  // The demo's season is the only one here (its games are all in it, nothing before Season 2026 is
  // offered and there is no "All seasons"), so there is nothing to choose.
  await expect(page.getByTestId("together-season")).toHaveCount(0);
  await expect(page.getByText("All seasons")).toHaveCount(0);
  // Every game shows at least two members, each with a champion and a role.
  const sizes = await games.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
  await expect(games.first().getByTestId("together-member").first()).toContainText(/\d+\/\d+\/\d+/);
  // The rule is said once for the page, not repeated on every game.
  await expect(page.getByText("party not verified")).toHaveCount(0);
  // Every game shows both teams: five a side, the members' side tinted, and a member who played
  // on the other team marked there (no need to open the match). Phones keep them for the game's own
  // screen, out of the card.
  const teams = games.first().getByTestId("match-teams");
  await expect(teams.locator("[data-side=blue] [data-testid=team-slot]")).toHaveCount(5);
  await expect(teams.locator("[data-side=red] [data-testid=team-slot]")).toHaveCount(5);
  await expect(teams.locator("[data-own]")).toHaveCount(1);
  await expect(page.getByTestId("together-game").locator("[data-side]:not([data-own]) [data-member]").first()).toBeAttached();

  // Three or more members only.
  await showFilters(page);
  await pick(page.getByTestId("together-min"), "3");
  await expect(page).toHaveURL(/min=3/);
  const three = await page.getByTestId("together-game").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(three.length).toBeGreaterThan(0);
  expect(Math.min(...three)).toBeGreaterThanOrEqual(3);
  // Ranked Solo/Duo with three: not all of them can have queued together, and the page says so.
  await showFilters(page);
  await pick(page.getByTestId("together-queue"), "solo");
  await expect(page).toHaveURL(/queue=solo/);
  // Text on the card, never only behind an (i): whole on a stacked card; in the four columns' narrow
  // result column a short line on screen that keeps the point, under the queue's own "Ranked
  // Solo/Duo", the whole sentence in its title and read out. The accessibility tree is what is read
  // out: the sentence alone, whichever line is on screen (the short line is hidden from it; a
  // sentence hidden from it, or not drawn at all, fails here).
  const caveat = page.getByTestId("together-solo-caveat").first();
  await expect(caveat).toBeVisible();
  const full = "Ranked Solo/Duo allows parties of two at most, so not all of them queued together.";
  await expect(caveat).toHaveAttribute("title", full);
  await expect(caveat).toMatchAriaSnapshot(`- paragraph: ${full}`);
  const wide = await page.getByTestId("together-list").evaluate((l) => l.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize) >= 58);
  const shown = await caveat.evaluate((p) => {
    const drawn = [...p.children].filter((c) => c.getBoundingClientRect().width > 1);
    return { text: drawn.map((c) => c.textContent!.trim()).join(""), lines: drawn.length === 1 ? drawn[0]!.getClientRects().length : null };
  });
  expect(shown.text, "the line on screen").toBe(wide ? "Not all queued together" : full);
  if (wide) expect(shown.lines, "one line in the 8.5rem result column").toBe(1);
  // All five, Clash: none in the demo, so an honest empty state, and Clear filters puts every filter back.
  await showFilters(page);
  await pick(page.getByTestId("together-queue"), "clash");
  await expect(page).toHaveURL(/queue=clash/);
  await expect(page.getByTestId("together-empty")).toBeVisible();
  await expect(page.getByTestId("matches-summary")).toContainText("0 games");
  await showFilters(page);
  await page.getByTestId("together-filters").getByTestId("reset-filters").click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("teammate combinations: choose members in the searchable picker, see only their shared games and how they do together", async ({ page }) => {
  await page.goto("/matches");
  // Two members of the first game, chosen from the picker (search, then pick).
  const firstGame = page.getByTestId("together-game").first();
  const ids = await firstGame.getByTestId("together-member").evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")!));
  const names = await firstGame.getByTestId("together-member").evaluateAll((els) => els.map((e) => e.querySelector("a")?.textContent?.trim() ?? ""));
  const pick = async (i: number) => {
    await showFilters(page);
    const picker = page.getByTestId("together-with");
    if (!(await picker.getByTestId("together-with-panel").isVisible())) await picker.getByTestId("together-with-button").click();
    await picker.getByTestId("together-with-search").fill(names[i]!.slice(0, 4));
    await picker.locator(`[data-testid=together-with-option][data-player-id="${ids[i]}"]`).click();
  };
  // At rest Played with carries the control edge of the dropdowns beside it (the design review's G1-5).
  if (!(await page.getByTestId("together-with-button").isVisible())) await showFilters(page);
  const edge = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(await edge("together-with-button")).toBe(await edge("together-queue"));
  await pick(0);
  await expect(page).toHaveURL(new RegExp(`with=${ids[0]}`));
  await pick(1);
  await expect(page).toHaveURL(/with=[^&]+%2C|with=[^&]+,/);
  const chosen = ids.slice(0, 2);
  // The picker says who is chosen, and Escape closes it.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("together-with-button")).toContainText(names[0]!);
  // Every listed game has both chosen members on the same team.
  const games = page.getByTestId("together-game");
  const n = await games.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const members = await games.nth(i).getByTestId("together-member").evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")));
    for (const id of chosen) expect(members).toContain(id);
  }
  // The summary agrees with the list: games and record.
  const summary = page.getByTestId("together-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(`${n}`);
  const wins = await page.locator("[data-testid=together-game] >> text=Victory").count();
  await expect(summary).toContainText(`${wins}W ${n - wins}L`);
  await expect(summary.getByTestId("together-most-played")).toBeVisible();
  // "Anyone" clears the choice.
  await showFilters(page);
  await page.getByTestId("together-with-button").click();
  await page.getByTestId("together-with-clear").click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("together-summary")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});


test("a Team Matches card opens its game under it, as Match History does; names and the bookmark keep their own action", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, "phones open a game as a whole screen: e2e/mobile-nav.spec.ts");
  await page.goto("/matches");
  const game = page.getByTestId("together-game").first();
  await expect(game).toBeVisible();
  const matchId = (await game.getAttribute("data-match-id"))!;
  const open = game.getByTestId("together-open");
  const expanded = game.getByTestId("match-expanded");
  // The bookmark toggles without opening the match.
  const bookmark = game.getByTestId("bookmark-game");
  if ((await bookmark.count()) && (await bookmark.getAttribute("data-bookmarked")) !== "true") {
    await bookmark.click();
    await expect(bookmark).toHaveAttribute("data-bookmarked", "true");
    await expect(expanded).toHaveCount(0);
    await bookmark.click();
    await expect(bookmark).not.toHaveAttribute("data-bookmarked", "true");
  }
  // A click on the card (not on a name) opens the game under it: the breakdown Match History opens,
  // with both teams and the members marked; no window, so the page scrolls as one.
  const breakdown = await openTogether(game);
  await expect(breakdown).toHaveAttribute("data-variant", "inline");
  await expect(breakdown.getByTestId("team-blue")).toBeVisible();
  await expect(breakdown.getByTestId("team-red")).toBeVisible();
  expect(await breakdown.locator("[data-player]").count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("match-detail")).toHaveCount(0);
  // The open game is in the address, and the filters are not touched.
  await expect(page).toHaveURL(new RegExp(`/matches\\?match=${matchId}$`));
  // "Close this game" closes it and puts the focus back on the card.
  await expanded.getByTestId("match-close").click();
  await expect(expanded).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/matches$/);
  // The keyboard opens and closes it too (the card is a toggle button).
  await page.keyboard.press("Enter");
  await expect(expanded.getByTestId("match-breakdown")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(expanded).toHaveCount(0);
  // Opening another game closes the first: one at a time.
  const second = page.getByTestId("together-game").nth(1);
  if (await second.count()) {
    await openTogether(game);
    await openTogether(second);
    await expect(expanded).toHaveCount(0);
    await second.getByTestId("match-close").click();
  }
  // A link to the game opens it under its card.
  await page.goto(`/matches?match=${matchId}`);
  const linked = page.locator(`[data-testid="together-game"][data-match-id="${matchId}"]`).first();
  await expect(linked.getByTestId("match-expanded").getByTestId("match-breakdown")).toBeVisible();
  await expect(linked.getByTestId("together-open")).toHaveAttribute("aria-expanded", "true");
  // A member's name opens their profile, not the match.
  const name = linked.getByTestId("together-member").first().getByRole("link").first();
  await name.click();
  await expect(page).toHaveURL(/\/players\/[0-9a-f-]+$/);
});

test("Team Matches follows the one history rule: a game opened under its card adds one entry, another game replaces it, and Back closes it", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, "phones open a game as a whole screen, with its own entry: e2e/mobile-nav.spec.ts");
  await page.goto("/team");
  await page.goto("/matches");
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  const entries = await page.evaluate(() => history.length);
  await openTogether(games.first());
  await expect(page).toHaveURL(/\/matches\?match=/);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  if ((await games.count()) > 1) {
    await openTogether(games.nth(1));
    await expect(games.first().getByTestId("match-expanded")).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  }
  // Back closes the game and stays on Team Matches, as Match History's games do.
  await page.goBack();
  await expect(page.getByTestId("match-expanded")).toHaveCount(0);
  await expect(page).toHaveURL(/\/matches$/);
  // The next Back leaves Team Matches for the page before it.
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
});

test("Team Matches' open game steps with Next and Previous: the address replaced (no new entry), the first game's Previous disabled, and which game it is said once", async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, "the desktop project: the steps work the same at every width the game opens in place");
  await page.goto("/matches");
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  test.skip((await games.count()) < 2, "two games to step between");
  const entries = await page.evaluate(() => history.length);
  await openTogether(games.first());
  await expect(games.first().getByTestId("game-prev").first()).toBeDisabled();
  const first = new URL(page.url()).searchParams.get("match");
  await games.first().getByTestId("game-next").first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get("match")).not.toBe(first);
  await expect(games.nth(1).getByTestId("match-expanded")).toBeVisible();
  await expect(games.first().getByTestId("match-expanded")).toHaveCount(0);
  await expect(page.getByTestId("together-said")).toHaveText(/^Game 2 of \d+/);
  await games.nth(1).getByTestId("game-prev").first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get("match")).toBe(first);
  await expect(games.first().getByTestId("match-expanded")).toBeVisible();
  expect(await page.evaluate(() => history.length), "one entry for the whole visit").toBe(entries + 1);
});

test("wide cards follow their list's width, not the window's: four columns exactly from a 58rem list, every name keeps its room and no member runs into the teams", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop windows, with the sidebar open and folded");
  // Four columns (the result, the members, both teams, the bookmark) once the list is 58rem wide,
  // whatever the window: the sidebar beside it takes 4.5 or 16rem. Sized by the window (lg), they
  // came at 1024px beside the open sidebar too, where the members' column was too narrow for a
  // name and each member's figures ran into the teams. These windows put the list on both sides of
  // 58rem, with the sidebar open and folded (at 1080, 47.5rem open and 59rem folded), and none
  // within a pixel of it (1248 open, 1064 folded).
  for (const sidebar of ["expanded", "collapsed"] as const) {
    await context.addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: baseURL! }]);
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1080, height: 810 }, { width: 1133, height: 744 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
      const where = `${viewport.width} × ${viewport.height}, the sidebar ${sidebar}`;
      await page.setViewportSize(viewport);
      await page.goto("/matches");
      await expect(page.getByTestId("together-card").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const facts = await page.evaluate(() => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const listRem = document.querySelector("[data-testid=together-list]")!.getBoundingClientRect().width / rem;
        const cards = [...document.querySelectorAll("[data-testid=together-card]")];
        let wide = 0;
        const squeezed: string[] = [];
        let intoTeams = 0;
        for (const card of cards) {
          const grid = card.querySelector(":scope > div.grid");
          const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
          if (columns >= 4) wide++;
          const teams = card.querySelector("[data-testid=match-teams]")?.parentElement;
          const teamsLeft = teams && columns >= 4 ? teams.getBoundingClientRect().left : Infinity;
          for (const member of card.querySelectorAll("[data-testid=together-member]")) {
            const name = member.querySelector<HTMLElement>("a[href^='/players/']");
            // A name is whole, or cut with at least 4rem of it shown.
            if (name && name.scrollWidth > name.clientWidth + 1 && name.getBoundingClientRect().width < 4 * rem) squeezed.push(name.textContent ?? "");
            let right = 0;
            for (const part of member.querySelectorAll("*")) {
              const box = part.getBoundingClientRect();
              if (box.width) right = Math.max(right, box.right);
            }
            if (right > teamsLeft) intoTeams++;
          }
        }
        return { cards: cards.length, wide, squeezed, intoTeams, listRem };
      });
      expect(facts.cards, `${where}: cards to measure`).toBeGreaterThan(0);
      expect(facts.wide, `${where}: four columns exactly when the list is 58rem or wider (it is ${facts.listRem.toFixed(1)}rem)`).toBe(facts.listRem >= 58 ? facts.cards : 0);
      expect(facts.squeezed, `${where}: every name whole or at least 4rem of it shown`).toEqual([]);
      expect(facts.intoTeams, `${where}: no member's row runs into the teams`).toBe(0);
    }
  }
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });
  test("four-column cards give the result its whole column: the room kept clear of the corner bookmark goes with the corner", async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "a large tablet held sideways, with the sidebar open");
    // On a touch screen the corner bookmark is larger, so stacked cards keep 3rem clear of it. On
    // four columns the bookmark has a column of its own; keeping the 3rem there cut "Ranked Solo/Duo"
    // to "Ranked Solo/D…" in the 9rem result column.
    await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.goto("/matches");
    await expect(page.getByTestId("together-card").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const facts = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-testid=together-card]")];
      let wide = 0;
      const cut: string[] = [];
      const queues = new Set<string>();
      for (const card of cards) {
        const grid = card.querySelector(":scope > div.grid");
        if (grid && getComputedStyle(grid).gridTemplateColumns.split(" ").length >= 4) wide++;
        const result = grid?.firstElementChild;
        if (!result) continue;
        // The queue and the date: each one line, cut with an ellipsis when it does not fit.
        for (const line of result.querySelectorAll<HTMLElement>("span.truncate")) {
          queues.add(line.textContent ?? "");
          if (line.scrollWidth > line.clientWidth + 0.5) cut.push(line.textContent ?? "");
        }
      }
      return { coarse: matchMedia("(pointer: coarse)").matches, cards: cards.length, wide, cut, solo: queues.has("Ranked Solo/Duo") };
    });
    expect(facts.coarse, "a touch screen").toBe(true);
    expect(facts.wide, "four columns beside the open sidebar (a 65.4rem list)").toBe(facts.cards);
    expect(facts.solo, "the demo's Team Matches include a Ranked Solo/Duo game, the longest queue name").toBe(true);
    expect(facts.cut, "every queue name and date whole").toEqual([]);
  });
});

test("old addresses for Season 2025 or all seasons open the current season", async ({ page, request }) => {
  const season = await demoSeasonLabel(request);
  for (const q of ["season=15", "season=2025", "season=all"]) {
    await page.goto(`/matches?${q}`);
    await expect(page.getByTestId("matches-summary")).toContainText(season);
  }
});

test("each member's row ends with their performance score and place badge, the opened game's own; MVP only on a won game, ACE only on a lost one, each place once", async ({ page }) => {
  await page.goto("/matches");
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const read = await games.evaluateAll((cards) => {
    const probe = (token: string) => {
      const el = document.createElement("span");
      el.style.color = `var(${token})`;
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    const [gold, violet] = [probe("--color-gold"), probe("--color-violet")];
    return cards.map((card) => ({
      result: card.getAttribute("data-result"),
      members: [...card.querySelectorAll("[data-testid=together-member]")].map((m) => {
        // One of the row's two places is shown: the end of the role's line, or a column at the row's end.
        const shown = [...m.querySelectorAll("[data-testid=together-score], [data-testid=together-score-empty]")].filter((e) => e.getBoundingClientRect().width > 0);
        const mark = shown.find((e) => e.getAttribute("data-testid") === "together-score") ?? null;
        const badge = mark?.querySelector("[data-testid=together-placement]");
        const row = m.getBoundingClientRect();
        const slot = shown[0]?.getBoundingClientRect();
        return {
          slots: shown.length,
          score: mark ? Number(mark.getAttribute("data-score")) : null,
          rank: mark ? Number(mark.getAttribute("data-rank")) : null,
          kind: badge?.getAttribute("data-placement") ?? null,
          text: badge?.textContent ?? null,
          colour: badge ? (getComputedStyle(badge).color === gold ? "gold" : getComputedStyle(badge).color === violet ? "violet" : "neutral") : null,
          // At the row's right edge (its line's end, or the row's own end), inside it.
          atEnd: !!slot && slot.right <= row.right + 0.5 && row.right - slot.right < 2 && slot.top >= row.top - 0.5 && slot.bottom <= row.bottom + 0.5,
          height: row.height,
        };
      }),
    }));
  });
  expect(read.length).toBeGreaterThan(2);
  let scored = 0;
  for (const [i, g] of read.entries()) {
    const ranks = g.members.flatMap((m) => (m.rank === null ? [] : [m.rank]));
    expect(new Set(ranks).size, `game ${i}: each place once`).toBe(ranks.length);
    for (const m of g.members) {
      expect(m.slots, `game ${i}: one score or dash a row`).toBe(1);
      expect(m.atEnd, `game ${i}: at the row's end`).toBe(true);
      expect(m.height, `game ${i}: a member's row`).toBeLessThanOrEqual(56);
      if (m.score === null) continue;
      scored += 1;
      expect(m.kind, `game ${i}`).toMatch(/^(mvp|ace|place)$/);
      if (m.kind === "mvp") expect([g.result, m.text, m.colour], `game ${i}: MVP on a win, gold`).toEqual(["W", "MVP", "gold"]);
      if (m.kind === "ace") expect([g.result, m.text, m.colour], `game ${i}: ACE on a loss, violet`).toEqual(["L", "ACE", "violet"]);
      if (m.kind === "place") expect(m.colour, `game ${i}: other places restrained`).toBe("neutral");
    }
  }
  // The demo's games have full records: every member is scored (no timeline: the record alone, as their card and the opened game).
  expect(scored, "members scored").toBe(read.reduce((n, g) => n + g.members.length, 0));
  // The opened game's own score and place for the member it opens on.
  const first = games.first();
  const member = first.getByTestId("together-member").first();
  const mark = member.getByTestId("together-score").filter({ visible: true });
  const [score, rank] = [await mark.getAttribute("data-score"), await mark.getAttribute("data-rank")];
  const breakdown = await openTogether(first);
  await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
  const slot = await breakdown.getAttribute("data-selected");
  const cell = breakdown.locator(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-score]`).first();
  await expect(cell).toHaveAttribute("data-score", score!);
  await expect(cell).toHaveAttribute("data-rank", rank!);
});

test("members two to a row from a 34rem column: a 36px portrait with the member's 16px picture on its corner, the K/D/A right after the name; Bookmarked ends the filter row", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name === "phone", "a phone lists the members one to a row");
  // The tablet's stacked card (a 45rem list), and four columns beside the open sidebar at 1440 (the
  // members' column 35rem). A game of four takes two rows of two.
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  await page.goto("/matches");
  const four = page.locator("[data-testid=together-game][data-members='4']").first();
  await expect(four).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const members = await four.evaluate((card) =>
    [...card.querySelectorAll<HTMLElement>("[data-testid=together-member]")].map((m) => {
      const box = (el: Element) => el.getBoundingClientRect();
      const portrait = box(m.firstElementChild!.firstElementChild!);
      const badge = box(m.querySelector("[data-testid=together-member-avatar]")!.firstElementChild!);
      const name = box(m.querySelector("a[href^='/players/']")!);
      const kda = box(m.querySelector("[data-testid=together-kda]")!);
      const extra = m.querySelector("[data-testid=together-member-extra]")!;
      const role = box(m.querySelector("[data-testid=together-member-role]")!);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        left: Math.round(box(m).left),
        height: box(m).height,
        rowRem: box(m).width / rem,
        portrait: [portrait.width, portrait.height],
        badge: [badge.width, badge.height],
        corner: [badge.right - portrait.right, badge.bottom - portrait.bottom],
        gap: kda.left - name.right,
        sameLine: Math.abs(kda.top + kda.height / 2 - (name.top + name.height / 2)) < 6,
        extra: getComputedStyle(extra).display === "none" ? null : { text: extra.textContent!.replace("·", "").trim(), onRoleLine: Math.abs(box(extra).top + box(extra).height / 2 - (role.top + role.height / 2)) < 2 },
        title: m.querySelector("[data-testid=together-kda]")!.getAttribute("title"),
      };
    }),
  );
  expect(members.length).toBe(4);
  expect(new Set(members.map((m) => m.left)).size, "two columns").toBe(2);
  for (const m of members) {
    expect(m.portrait.map(Math.round), "a 36px portrait").toEqual([36, 36]);
    expect(m.badge.map(Math.round), "a 16px picture").toEqual([16, 16]);
    // On the portrait's lower right corner, 4px past it (-bottom-1 -right-1).
    for (const d of m.corner) expect(Math.abs(d - 4)).toBeLessThanOrEqual(1);
    expect(m.sameLine && m.gap >= 0 && m.gap <= 12, "the K/D/A right after the name").toBe(true);
    expect(m.height, "a member's row").toBeLessThanOrEqual(56);
    // The CS and damage: the K/D/A's title always has them. On the tablet's two-up rows (20.9rem) they
    // are on the row too, beside the role and champion (the demo's are short); beside the open
    // sidebar at 1440 the rows are about 17rem, short of 19rem, so the title (and the game's
    // breakdown) is where they are.
    expect(m.title, "the K/D/A's title").toMatch(CS_AND_DAMAGE);
    if (info.project.name === "tablet") {
      expect(m.rowRem, "the tablet's rows reach 19rem").toBeGreaterThanOrEqual(19);
      expect(m.extra, "the CS and damage on the row, beside the role and champion").toEqual({ text: m.title, onRoleLine: true });
    } else {
      expect(m.rowRem, "beside the open sidebar at 1440 the rows stay under 19rem").toBeLessThan(19);
      expect(m.extra, "no CS and damage on the row").toBeNull();
    }
  }
  // No line of its own for the count: the scope line counts the games, and Bookmarked ends the filter row.
  await expect(page.getByTestId("together-count")).toHaveCount(0);
  const saved = page.getByTestId("together-saved");
  await expect(saved).toBeVisible();
  const [s, list, first] = [(await saved.boundingBox())!, (await page.getByTestId("together-list").boundingBox())!, (await page.getByTestId("together-queue").boundingBox())!];
  expect(Math.abs(s.x + s.width - (list.x + list.width)), "at the row's end").toBeLessThanOrEqual(1);
  expect(Math.abs(s.y + s.height / 2 - (first.y + first.height / 2)), "on the filters' line").toBeLessThanOrEqual(2);
});

test("a member's CS and damage come in at a 19rem row and never cut the champion's name: beside the role and champion where both fit whole, on a line of their own under them otherwise", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "tablet widths, where the rows cross 19rem");
  await page.goto("/matches");
  await expect(page.getByTestId("together-member").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const shown = () => page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=together-member-extra]")!).display !== "none");
  const rowRem = () => page.evaluate(() => document.querySelector("[data-testid=together-member]")!.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize));
  // The narrowest window at which they show: its rows are 19rem, one pixel less and they are not.
  let threshold = 0;
  for (let width = 680; width <= 768 && !threshold; width++) {
    await page.setViewportSize({ width, height: 1024 });
    if (await shown()) threshold = width;
  }
  expect(threshold, "the CS and damage show by the tablet's 768px").toBeGreaterThan(680);
  expect(await rowRem(), `${threshold}px: rows of 19rem`).toBeGreaterThanOrEqual(19);
  await page.setViewportSize({ width: threshold - 1, height: 1024 });
  expect(await shown(), `${threshold - 1}px: not under 19rem`).toBe(false);
  expect(await rowRem()).toBeLessThan(19);
  await page.setViewportSize({ width: threshold, height: 1024 });
  // At that width, the widest role and champion the game can show, "Role unknown · Nunu & Willump"
  // (180px at 12px; a role's icon only comes with a shorter role), here beside an icon too, so wider
  // than any real pair. It stays whole and the CS and damage take a line of their own, whole, not
  // starting with their "·"; a short pair keeps them beside it with the "·" between.
  const facts = await page.getByTestId("together-member").evaluateAll((rows) => {
    const withIcon = rows.find((r) => r.querySelector("[data-testid=together-member-role] [data-role-icon]"))!;
    const pair = withIcon.querySelector<HTMLElement>("[data-testid=together-member-role] .truncate")!;
    pair.textContent = "Role unknown · Nunu & Willump";
    const read = (row: Element) => {
      const role = row.querySelector("[data-testid=together-member-role]")!.getBoundingClientRect();
      const extra = row.querySelector<HTMLElement>("[data-testid=together-member-extra]")!;
      const line = extra.parentElement!;
      const [e, l] = [extra.getBoundingClientRect(), line.getBoundingClientRect()];
      const dot = extra.firstElementChild!.getBoundingClientRect();
      const text = row.querySelector<HTMLElement>("[data-testid=together-member-role] .truncate")!;
      return {
        layout: {
          pairWhole: text.scrollWidth <= text.clientWidth + 1,
          extraWhole: extra.scrollWidth <= extra.clientWidth + 1,
          under: e.top >= role.bottom - 1,
          beside: Math.abs(e.top + e.height / 2 - (role.top + role.height / 2)) < 2,
          // On a line of their own the "·" is outside the line's clipped box; beside the pair, in the gap.
          dotShown: getComputedStyle(line).overflow === "hidden" ? dot.right > l.left + 0.5 && dot.left >= role.right - 0.5 : true,
          startsLine: Math.abs(e.left - l.left) < 0.5,
          // The role's line: one line, or two with the CS and damage under the pair.
          lines: Math.round(l.height / parseFloat(getComputedStyle(line).lineHeight)),
        },
        height: row.getBoundingClientRect().height,
      };
    };
    // A short real pair, set as the long one is: since 25 Nov 2026 the row ends with the member's score and place, so at
    // the 19rem threshold the role's line is about 40px shorter than it was, and a pair of 17 characters no longer leaves
    // the CS and damage room beside it (they then take their own line, as the long pair's do).
    const short = rows.find((r) => r !== withIcon && r.querySelector("[data-testid=together-member-role] [data-role-icon]"))!;
    short.querySelector<HTMLElement>("[data-testid=together-member-role] .truncate")!.textContent = "Mid · Ahri";
    return { long: read(withIcon), short: read(short) };
  });
  expect(facts.long.layout, "the long pair whole; the CS and damage whole on the next line, at its start, without the \"·\"").toEqual({ pairWhole: true, extraWhole: true, under: true, beside: false, dotShown: false, startsLine: true, lines: 2 });
  expect(facts.long.height, "the name's line and two more: the row still at most 56px").toBeLessThanOrEqual(56);
  expect(facts.short.layout, "a short pair: the CS and damage beside it, the \"·\" between").toEqual({ pairWhole: true, extraWhole: true, under: false, beside: true, dotShown: true, startsLine: false, lines: 1 });
});

test("on a phone each member is a row of about 40px with the name whole, the count of members read out only", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phones");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/matches");
    await expect(page.getByTestId("together-member").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const facts = await page.evaluate(() => ({
      heights: [...document.querySelectorAll("[data-testid=together-member]")].map((m) => Math.round(m.getBoundingClientRect().height)),
      cut: [...document.querySelectorAll<HTMLElement>("[data-testid=together-member] a[href^='/players/']")].filter((a) => a.scrollWidth > a.clientWidth + 1).map((a) => a.textContent),
      // Drawn as a 1px box (sr-only), but there: display none would also be 0px wide, and silent.
      size: [...document.querySelectorAll("[data-testid=together-size]")].map((s) => ({ width: s.parentElement!.getBoundingClientRect().width, display: getComputedStyle(s.parentElement!).display })),
      // The CS and damage stay off a phone's rows: the K/D/A's title carries them (and the game's breakdown).
      extra: [...document.querySelectorAll("[data-testid=together-member]")].map((m) => ({ shown: getComputedStyle(m.querySelector("[data-testid=together-member-extra]")!).display !== "none", title: m.querySelector("[data-testid=together-kda]")!.getAttribute("title") })),
    }));
    const forty = facts.heights.filter((h) => h <= 44).length;
    expect(forty / facts.heights.length, `${width}px: most rows about 40px (${facts.heights.join(", ")})`).toBeGreaterThanOrEqual(0.75);
    expect(Math.max(...facts.heights), `${width}px: a long name and a multikill take a third line at most`).toBeLessThanOrEqual(60);
    expect(facts.cut, `${width}px: names whole`).toEqual([]);
    for (const s of facts.size) {
      expect(s.width, `${width}px: the count not on screen`).toBeLessThanOrEqual(1);
      expect(s.display, `${width}px: the count still there to be read out`).not.toBe("none");
    }
    for (const e of facts.extra) {
      expect(e.shown, `${width}px: no CS and damage on a phone's row`).toBe(false);
      expect(e.title, `${width}px: the K/D/A's title has them`).toMatch(CS_AND_DAMAGE);
    }
    // Read out: the accessibility tree has the count (the rows under it are the members).
    const first = page.getByTestId("together-game").first();
    const n = await first.getAttribute("data-members");
    expect(await first.ariaSnapshot(), `${width}px: the count read out`).toContain(`${n} team members`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
});

test("the scope line's (i) never takes a line alone: where the line does not fit, the record goes to the next line with it", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone's narrow line");
  await page.goto("/matches");
  const summary = page.getByTestId("matches-summary");
  await expect(summary).toContainText(/\d+W \d+L/);
  await page.evaluate(() => document.fonts.ready);
  // The line's own width, then every width from 60px under it to 30px over: wherever it breaks, the
  // (i) shares its line with the record ("4W 2L"), and the record is never split.
  const alone = await summary.evaluate((s) => {
    const line = s.parentElement!;
    const tip = s.querySelector("button")!.closest("span.inline-flex")!;
    const words: Text[] = [];
    const walk = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n && !tip.contains(n); n = walk.nextNode()) if (n.textContent!.trim()) words.push(n as Text);
    const last = words.at(-1)!;
    const record = document.createRange();
    const text = last.textContent!.trimEnd();
    record.setStart(last, text.search(/\d+W \d+L$/));
    record.setEnd(last, text.length);
    line.style.width = "max-content";
    const natural = line.getBoundingClientRect().width;
    const out: { width: number; alone: boolean; split: boolean }[] = [];
    for (let w = Math.floor(natural) - 60; w <= Math.ceil(natural) + 30; w++) {
      line.style.width = `${w}px`;
      const [b, r] = [tip.getBoundingClientRect(), record.getBoundingClientRect()];
      out.push({ width: w, alone: Math.abs(b.top + b.height / 2 - (r.top + r.height / 2)) > 6, split: record.getClientRects().length > 1 });
    }
    line.style.width = "";
    return out.filter((o) => o.alone || o.split);
  });
  expect(alone, "no width leaves the (i) alone or splits the record").toEqual([]);
});

test("while it loads, Team Matches shows the list's shape, read out as one Loading status", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one device is enough for the loading states");
  const loading = page.locator("main [role=status][aria-label=Loading]");
  // From another of Team's sections: the router goes to Team Matches once its prefetch, which brings
  // the loading state, has finished; then the page itself is held back.
  await page.goto("/players");
  await expect(page.locator("main h1").first()).toBeAttached();
  await page.evaluate(() => (window as unknown as { next: { router: { prefetch(href: string): void } } }).next.router.prefetch("/matches"));
  await page.waitForLoadState("networkidle");
  await page.route(
    (url) => url.pathname === "/matches",
    async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    },
  );
  await page.evaluate(() => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push("/matches"));
  // The list's shape, its cards hidden from screen readers, which hear the status alone (no empty lists).
  await expect(loading).toHaveAttribute("data-testid", "matches-skeleton");
  await expect(loading).toMatchAriaSnapshot(`
    - status "Loading":
      - /children: equal
      - paragraph: Loading…
  `);
  await expect(page.getByTestId("together-game").first()).toBeVisible({ timeout: 20_000 });
});

test("Team Insights is gone for good: no link in Team Matches' header for anyone, the Owner included, and its old address is not found", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one device is enough");
  // The demo's viewer is the Owner, who saw the administrators' preview link until Release 16.
  await page.goto("/matches");
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  await expect(page.getByTestId("team-insights-link")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/insights/i);
  const gone = await page.goto("/matches/insights");
  expect(gone?.status(), "the old address answers Not Found, never a redirect").toBe(404);
  await expect(page.getByTestId("team-insights")).toHaveCount(0);
});

test("at 200% text on a 320px phone, Team Matches is no wider than the phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a 320px phone");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/matches");
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: "the page as wide as the phone" }).toBeLessThanOrEqual(0);
});
