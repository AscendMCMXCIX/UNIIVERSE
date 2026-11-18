import { expect, test, type Page } from "./test";
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

test("Played together lists games with two or more members on one side, with honest labels and filters", async ({ page, request }) => {
  const season = await demoSeasonLabel(request);
  // Played together is the whole page: Encounters are in each profile's Match History.
  await page.goto("/matches");
  await expect(page.getByTestId("matches-tabs")).toHaveCount(0);
  // One line of what is counted; what it proves is behind (i), never claimed as a premade party.
  const summary = page.getByTestId("matches-summary");
  await expect(summary).toContainText(new RegExp(`${season} · \\d+ games? played together`));
  await expect(summary.getByRole("button", { name: "How games played together are found" })).toHaveAccessibleDescription(/not confirmed premade parties/);
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
  await page.getByTestId("together-min").selectOption("3");
  await expect(page).toHaveURL(/min=3/);
  const three = await page.getByTestId("together-game").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(three.length).toBeGreaterThan(0);
  expect(Math.min(...three)).toBeGreaterThanOrEqual(3);
  // Ranked Solo/Duo with three: not all of them can have queued together, and the page says so.
  await showFilters(page);
  await page.getByTestId("together-queue").selectOption("solo");
  await expect(page).toHaveURL(/queue=solo/);
  // Text on the card, never only behind an (i): whole on a stacked card; in the four columns' narrow
  // result column a short line on screen, the whole sentence read out and in its title.
  const caveat = page.getByTestId("together-solo-caveat").first();
  await expect(caveat).toBeVisible();
  const full = "Ranked Solo/Duo allows parties of two at most, so not all of them queued together.";
  await expect(caveat).toHaveAttribute("title", full);
  expect(await caveat.evaluate((p) => p.textContent)).toContain(full);
  const wide = await page.getByTestId("together-list").evaluate((l) => l.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize) >= 58);
  expect(await caveat.evaluate((p) => [...p.children].filter((c) => c.getBoundingClientRect().width > 1).map((c) => c.textContent!.trim()).join(""))).toBe(wide ? "Solo/Duo: duos at most" : full);
  // All five, Clash: none in the demo, so an honest empty state, and Clear filters puts every filter back.
  await showFilters(page);
  await page.getByTestId("together-queue").selectOption("clash");
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
      return { left: Math.round(box(m).left), height: box(m).height, portrait: [portrait.width, portrait.height], badge: [badge.width, badge.height], corner: [badge.right - portrait.right, badge.bottom - portrait.bottom], gap: kda.left - name.right, sameLine: Math.abs(kda.top + kda.height / 2 - (name.top + name.height / 2)) < 6 };
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
  }
  // No line of its own for the count: the scope line counts the games, and Bookmarked ends the filter row.
  await expect(page.getByTestId("together-count")).toHaveCount(0);
  const saved = page.getByTestId("together-saved");
  await expect(saved).toBeVisible();
  const [s, list, first] = [(await saved.boundingBox())!, (await page.getByTestId("together-list").boundingBox())!, (await page.getByTestId("together-queue").boundingBox())!];
  expect(Math.abs(s.x + s.width - (list.x + list.width)), "at the row's end").toBeLessThanOrEqual(1);
  expect(Math.abs(s.y + s.height / 2 - (first.y + first.height / 2)), "on the filters' line").toBeLessThanOrEqual(2);
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
      size: [...document.querySelectorAll("[data-testid=together-size]")].map((s) => s.parentElement!.getBoundingClientRect().width),
    }));
    const forty = facts.heights.filter((h) => h <= 44).length;
    expect(forty / facts.heights.length, `${width}px: most rows about 40px (${facts.heights.join(", ")})`).toBeGreaterThanOrEqual(0.75);
    expect(Math.max(...facts.heights), `${width}px: a long name and a multikill take a third line at most`).toBeLessThanOrEqual(60);
    expect(facts.cut, `${width}px: names whole`).toEqual([]);
    for (const w of facts.size) expect(w, `${width}px: the count read out only`).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
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
