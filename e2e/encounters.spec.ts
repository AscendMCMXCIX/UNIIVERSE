import { expect, test, type Locator, type Page } from "./test";
import { openFilterBar } from "./filters";
import { memberContext } from "./member-account";
import { closeGame, openGame } from "./match-history";

/*
  A profile's Match History → Encounters on the demo roster: a teammate's profile (the in-memory
  demo's local owner has no profile of their own). The recurring players are synthetic demo
  players placed in the synthetic demo games (demo mode only, server/demo/encounters-fixture),
  never real Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The Mid laner's profile. */
async function teammate(page: Page): Promise<string> {
  await page.goto("/team");
  return `/players/${await page.getByTestId("lineup-row-MID").getAttribute("data-player-id")}`;
}

/** Encounters once its controls work (they wait for the page to be interactive). */
async function openEncounters(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
}

/** A row's record on one side: its games (0 when never met that way). */
const sideGames = async (row: Locator, side: "against" | "alongside") => Number(await row.getAttribute(`data-${side}`));
/** The record a row shows for the list's side: games, wins and losses, and its win rate's text. */
async function recordOf(row: Locator, relation: "opponent" | "ally") {
  const cell = row.locator(`[data-testid='encounter-record'][data-relation='${relation}']`);
  const games = Number(await cell.getAttribute("data-games"));
  const text = (await cell.innerText()).replace(/\s+/g, " ");
  const m = /(\d+)W (\d+)L/.exec(text);
  return { cell, games, wins: m ? Number(m[1]) : 0, losses: m ? Number(m[2]) : 0, rate: m ? await cell.getByTestId("encounter-rate").innerText() : null };
}
/** Desktop and tablet show the column names; phones a Sort by control. */
const wide = async (page: Page) => (await page.getByTestId("encounter-heads").count()) > 0 && (await page.getByTestId("encounter-heads").isVisible());
const countOf = async (option: ReturnType<Page["locator"]>) => Number(/\((\d+)\)/.exec((await option.textContent()) ?? "")![1]);
const relationCount = async (page: Page, r: "against" | "alongside" | "all") => Number(await page.getByTestId(`encounter-relation-${r}`).getByTestId("encounter-relation-count").innerText());

test("Encounters: Against, Alongside and All, each side with its own record, in honest words", async ({ page }) => {
  // One switch away from the games; the season and game mode come along. (Once the games list
  // is interactive: it fits its page size to the screen on arrival, which would overtake a link
  // followed before then.)
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  await page.getByTestId("match-view-encounters").click();
  await expect(page).toHaveURL(/view=encounters/);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  await expect(page.getByTestId("match-view-encounters")).toHaveAttribute("aria-current", "page");
  // What encounters prove is behind (i); never premade, duo-partner or "counter" language, and no "Mixed".
  const caveat = page.getByRole("button", { name: "How encounters are counted" });
  await expect(caveat).toHaveAccessibleDescription(/not parties, friendships/);
  await expect(caveat).toHaveAccessibleDescription(/met both ways has both records and is listed under Against and Alongside/);
  await expect(caveat).toHaveAccessibleDescription(/fewer than 5 games with a result are a small sample/);
  await expect(page.getByTestId("encounters")).not.toContainText(/premade|duo partner|\bcounters?\b|\bmixed\b/i);

  // Against by default, met twice or more, the player's own record against each, in figures.
  await expect(page.getByTestId("encounter-relation-against")).toHaveAttribute("aria-current", "page");
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  if (await wide(page)) await expect(page.getByTestId("encounter-heads")).toContainText(/Players met against.*Games.*Record.*Win rate.*Last game/i);
  const rowsAgainst = await rows.count();
  expect(await relationCount(page, "against")).toBeGreaterThanOrEqual(rowsAgainst);
  for (const row of await rows.all()) {
    const r = await recordOf(row, "opponent");
    expect(r.games).toBeGreaterThanOrEqual(2);
    expect(r.games).toBe(await sideGames(row, "against"));
    // A win rate from the wins and losses; grey and said to be a small sample under five, and only then.
    const decided = r.wins + r.losses;
    // (A small sample's figure is followed by those words for screen readers.)
    await expect(r.cell.getByTestId("encounter-rate")).toHaveText(decided ? new RegExp(`^${Math.round((r.wins / decided) * 100)}%( \\(small sample\\))?$`) : "—");
    if (decided && decided < 5) await expect(r.cell.getByTestId("encounter-rate")).toHaveAttribute("data-small", "true");
    else await expect(r.cell.getByTestId("encounter-rate")).not.toHaveAttribute("data-small");
    // Met the other way too: said under the name.
    const alongside = await sideGames(row, "alongside");
    await expect(row.getByTestId("encounter-also")).toHaveCount(alongside ? 1 : 0);
  }

  // Alongside: every record is the record alongside.
  await page.getByTestId("encounter-relation-alongside").click();
  await expect(page).toHaveURL(/rel=alongside/);
  await expect(page.getByTestId("encounter-relation-alongside")).toHaveAttribute("aria-current", "page");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) expect((await recordOf(row, "ally")).games).toBe(await sideGames(row, "alongside"));

  // All: both records side by side, never added together, and no win-rate order.
  await page.getByTestId("encounter-relation-all").click();
  await expect(page).toHaveURL(/rel=all/);
  await expect(rows.first()).toBeVisible();
  for (const row of (await rows.all()).slice(0, 10)) {
    for (const side of ["against", "alongside"] as const) {
      const cell = row.locator(`[data-testid='encounter-record'][data-relation='${side === "against" ? "opponent" : "ally"}']`);
      await expect(cell).toHaveAttribute("data-games", String(await sideGames(row, side)));
      if (!(await sideGames(row, side))) await expect(cell).toContainText("never");
    }
  }
  if (await wide(page)) await expect(page.getByTestId("encounter-sort-best")).toHaveCount(0);
  else await expect(page.getByTestId("encounter-sort").locator("option")).toHaveText(["Most games", "Most recent"]);

  // At least three games: every player left was met three times or more in all.
  await page.getByTestId("encounter-min").selectOption("3");
  await expect(page).toHaveURL(/min=3/);
  for (const row of await rows.all()) expect((await sideGames(row, "against")) + (await sideGames(row, "alongside"))).toBeGreaterThanOrEqual(3);

  // A search that matches nobody: an honest empty state, the choices kept.
  await page.getByTestId("encounter-search").fill("Nobody Like This#NONE");
  await expect(page).toHaveURL(/q=Nobody/);
  await expect(page.getByTestId("encounters-none")).toBeVisible();
  await expect(page).toHaveURL(/rel=all/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("a player met both ways is found under Against and under Alongside, each with that side's record", async ({ page }) => {
  // The Support player's encounters: the demo has every member meet one player on both sides.
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=all&min=1&limit=500`);
  const both = page.locator("[data-testid='encounter-row']:not([data-against='0']):not([data-alongside='0'])").first();
  await expect(both).toBeVisible();
  const [against, alongside] = [await sideGames(both, "against"), await sideGames(both, "alongside")];
  const name = (await both.locator("[title]").first().getAttribute("title"))!;
  for (const [relation, side, games] of [["against", "opponent", against], ["alongside", "ally", alongside]] as const) {
    await openEncounters(page, `${support}/matches?view=encounters&rel=${relation}&min=1&q=${encodeURIComponent(name)}`);
    const row = page.getByTestId("encounter-row").filter({ has: page.locator(`[title="${name}"]`) });
    await expect(row).toHaveCount(1);
    expect((await recordOf(row, side)).games).toBe(games);
    await expect(row.getByTestId("encounter-also")).toContainText(relation === "against" ? `${alongside} game` : `${against} game`);
  }
});

test("each order follows the side in view: most games, the most recent, the highest and lowest win rates", async ({ page }) => {
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=against&min=1&limit=500`);
  const rows = page.getByTestId("encounter-row");
  const choose = async (order: "games" | "recent" | "best" | "worst") => {
    if (await wide(page)) {
      // The column names sort: the win rate's reverses on a second press.
      if (order === "worst") {
        await page.getByTestId("encounter-sort-best").click();
        await expect(page).toHaveURL(/sort=best/);
      }
      await page.getByTestId(`encounter-sort-${order === "worst" ? "best" : order}`).click();
    } else await page.getByTestId("encounter-sort").selectOption(order);
    if (order === "games") await expect(page).not.toHaveURL(/sort=/);
    else await expect(page).toHaveURL(new RegExp(`sort=${order}`));
    await expect(page.locator("[data-testid='encounters'] [aria-busy='true']")).toHaveCount(0);
  };
  await choose("recent");
  const dates = await rows.getByTestId("encounter-last").allInnerTexts();
  const times = dates.map((d) => Date.parse(d.replace(/^Last game against\s*/, "").trim()));
  for (let i = 1; i < times.length; i++) expect(times[i]!).toBeLessThanOrEqual(times[i - 1]!);
  for (const order of ["best", "worst"] as const) {
    await choose(order);
    // Win rates from five or more games first, in order; the small samples after them, in order too.
    const rates = await rows.evaluateAll((els) =>
      els.map((row) => {
        const rate = row.querySelector("[data-relation='opponent'] [data-testid='encounter-rate']")!;
        return { small: rate.hasAttribute("data-small"), pct: Number.parseInt(rate.textContent ?? "", 10) };
      }),
    );
    const firstSmall = rates.findIndex((r) => r.small);
    if (firstSmall >= 0) expect(rates.slice(firstSmall).every((r) => r.small)).toBe(true);
    for (const group of [rates.filter((r) => !r.small), rates.filter((r) => r.small)]) {
      for (let i = 1; i < group.length; i++) {
        if (order === "best") expect(group[i]!.pct).toBeLessThanOrEqual(group[i - 1]!.pct);
        else expect(group[i]!.pct).toBeGreaterThanOrEqual(group[i - 1]!.pct);
      }
    }
  }
  await choose("games");
  const games = await rows.evaluateAll((els) => els.map((row) => Number(row.getAttribute("data-against"))));
  for (let i = 1; i < games.length; i++) expect(games[i]!).toBeLessThanOrEqual(games[i - 1]!);
});

test("one player's window: both records, every recorded game with the side and the champions, and the match with Back", async ({ page }) => {
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=against&min=1&limit=500`);
  // A player met both ways, opened from Against: the games start with the games against them.
  const row = page.locator("[data-testid='encounter-row']:not([data-against='0']):not([data-alongside='0'])").first();
  const [against, alongside] = [await sideGames(row, "against"), await sideGames(row, "alongside")];
  await row.getByTestId("open-encounter").click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail.getByTestId("encounter-detail-records")).toBeVisible();
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${against + alongside} games? with .* · last met `));
  // The two records, never added together.
  await expect(detail.locator("[data-testid='encounter-detail-record'][data-relation='opponent']")).toHaveAttribute("data-games", String(against));
  await expect(detail.locator("[data-testid='encounter-detail-record'][data-relation='ally']")).toHaveAttribute("data-games", String(alongside));
  // The games: filtered to the side the list was showing, then each side, then all of them, newest first.
  const games = detail.getByTestId("encounter-game");
  await expect(detail.getByTestId("encounter-games-against")).toHaveAttribute("aria-checked", "true");
  for (const [choice, relation, count] of [["against", "opponent", against], ["alongside", "ally", alongside], ["all", null, against + alongside]] as const) {
    await detail.getByTestId(`encounter-games-${choice}`).click();
    await expect(games).toHaveCount(Math.min(count, 100));
    for (const g of (await games.all()).slice(0, 6)) {
      const side = (await g.getAttribute("data-relation"))!;
      if (relation) expect(side).toBe(relation);
      // Each game says the side in words, both champions with whose they were, and the result.
      await expect(g.getByTestId("relation-tag")).toHaveText(side === "opponent" ? "Against" : "Alongside");
      await expect(g).toContainText(/Victory|Defeat|—/);
    }
  }
  const played = await games.getByTestId("encounter-game-date").evaluateAll((els) => els.map((e) => Date.parse(e.textContent ?? "")));
  for (let i = 1; i < played.length; i++) expect(played[i]!).toBeLessThanOrEqual(played[i - 1]!);
  await expect(page.getByTestId("encounter-detail-note")).toContainText(/not parties/);
  // OP.GG opens in a new tab, never in place.
  const opgg = page.getByTestId("encounter-opgg");
  if (await opgg.count()) {
    await expect(opgg).toHaveAttribute("target", "_blank");
    await expect(opgg).toHaveAttribute("href", /^https:\/\/op\.gg\/lol\/summoners\//);
  }
  // As tall as its content on wider screens: no empty band under the games.
  if (page.viewportSize()!.width >= 640) {
    const [win, body] = [(await page.locator("dialog[open]").boundingBox())!, (await detail.getByTestId("encounter-detail-note").boundingBox())!];
    expect(win.y + win.height - (body.y + body.height)).toBeLessThan(80);
  }

  // A game opens the shared match window; Back returns to the player.
  await games.first().click();
  await expect(page.getByTestId("match-detail")).toBeVisible();
  await page.getByTestId("match-detail-back").click();
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
});

test("a game's scoreboard marks the players met in other games, and a mark opens their window with the same count", async ({ page }) => {
  await page.goto(`${await teammate(page)}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  // The first game on the page whose scoreboard marks someone (about two demo games in five meet a
  // recurring demo player). The marks follow the scoreboard: the breakdown says how many once known.
  let mark: Locator | null = null;
  for (const card of (await page.getByTestId("match-card").all()).slice(0, 12)) {
    const breakdown = await openGame(card);
    await expect(breakdown).toHaveAttribute("data-met", /^\d+$/);
    const marked = Number(await breakdown.getAttribute("data-met"));
    await expect(breakdown.getByTestId("participant-met")).toHaveCount(marked);
    if (marked) {
      mark = breakdown.getByTestId("participant-met").first();
      break;
    }
    await closeGame(card);
  }
  expect(mark, "a game on the first page meets a recurring player").not.toBeNull();
  const games = Number(await mark!.getAttribute("data-games"));
  expect(games).toBeGreaterThanOrEqual(2);
  // "Met N×" on screen; read as "Met N times, this game included (… against, … alongside)".
  expect(await mark!.evaluate((el) => [...el.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("sr-only"))).map((n) => n.textContent).join(""))).toBe(`Met ${games}×`);
  await expect(mark!).toHaveAccessibleName(new RegExp(`^Met ${games} times, this game included \\((\\d+ against)?(, )?(\\d+ alongside)?\\)\\. Open their encounters$`));
  // The Riot ID the row names (its title), not the row's text: a possible group's label, read to
  // screen readers after the name, arrives with the groups and may or may not be there yet.
  const name = (await mark!.locator("xpath=ancestor::li[1]").getByTestId("participant-name").getAttribute("title"))!.split("#")[0]!;
  // Nothing scrolls sideways for it, on a phone either.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  // Their Encounters window, in the list's season and game mode: the same count, and their games (both sides).
  await mark!.click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail).toBeVisible();
  await expect(detail.locator("#encounter-title")).toContainText(name);
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${games} games with `));
  await expect(page.getByTestId("encounter-game")).toHaveCount(games);
  // A game from there opens the match window, which marks no one (no window opens another); Back returns.
  await page.getByTestId("encounter-game").first().click();
  const matchWindow = page.getByTestId("match-detail");
  await expect(matchWindow.getByTestId("participant").first()).toBeVisible();
  await expect(matchWindow.getByTestId("participant-met")).toHaveCount(0);
  await page.getByTestId("match-detail-back").click();
  await expect(detail).toBeVisible();
  // Closing it returns to the mark that opened it.
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(mark!).toBeFocused();
});

test("against reads warm and alongside cool, always with the word, on the list, its choice and the window", async ({ page }) => {
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=all&min=1&limit=500`);
  await expect(page.getByTestId("encounter-row").first()).toBeVisible();
  const rgb = (c: string): [number, number, number] => {
    const [r = 0, g = 0, b = 0] = c.match(/[\d.]+/g)!.map(Number);
    return [r, g, b];
  };
  // Every side mark on the page (phones: on each row; wider: the column names and the highlights): the word and its colour.
  const tags = await page.getByTestId("relation-tag").evaluateAll((els) => els.map((el) => ({ relation: el.getAttribute("data-relation")!, text: el.textContent!.trim(), color: getComputedStyle(el).color })));
  expect(tags.length).toBeGreaterThan(0);
  for (const t of tags) {
    const [r, , b] = rgb(t.color);
    expect(t.text).toBe(t.relation === "opponent" ? "Against" : "Alongside");
    if (t.relation === "opponent") expect(r).toBeGreaterThan(b);
    else expect(b).toBeGreaterThan(r);
  }
  // The choice: Against and Alongside carry the same colour keys, All none.
  for (const [r, dots] of [["against", 1], ["alongside", 1], ["all", 0]] as const) await expect(page.getByTestId(`encounter-relation-${r}`).locator("span[aria-hidden].rounded-full")).toHaveCount(dots);
  // Nothing scrolls sideways and no name is cut short.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  for (const row of (await page.getByTestId("encounter-row").all()).slice(0, 8)) expect(await row.locator("[title]").first().evaluate((name) => name.scrollWidth - name.clientWidth)).toBeLessThanOrEqual(1);
  // In the window, each game's side in the same words and colours.
  await page.locator("[data-testid='encounter-row']:not([data-against='0']):not([data-alongside='0'])").first().getByTestId("open-encounter").click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail.getByTestId("encounter-game").first()).toBeVisible();
  for (const t of await detail.getByTestId("relation-tag").evaluateAll((els) => els.map((el) => ({ relation: el.getAttribute("data-relation")!, color: getComputedStyle(el).color })))) {
    const [r, , b] = rgb(t.color);
    if (t.relation === "opponent") expect(r).toBeGreaterThan(b);
    else expect(b).toBeGreaterThan(r);
  }
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
});

test("the season, game mode and account choice is the games list's, and every count follows it", async ({ page }) => {
  await openEncounters(page, `${await teammate(page)}/matches?view=encounters`);
  // Phones fold the filters behind one button.
  await openFilterBar(page.getByTestId("encounter-filters"));
  const mode = page.locator("#overview-mode");
  // Games in the view: the same number the game mode shows beside its name.
  const coverage = page.getByTestId("encounters-scope");
  const all = await countOf(mode.locator("option:checked"));
  await expect(coverage).toContainText(new RegExp(`Players in ${all} recorded games?|of ${all} games`));
  await mode.selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).toHaveURL(/view=encounters/);
  const solo = await countOf(page.locator("#overview-mode option:checked"));
  expect(solo).toBeLessThanOrEqual(all);
  if (solo) await expect(coverage).toContainText(new RegExp(`Players in ${solo} recorded games?|of ${solo} games`));
  else await expect(page.getByTestId("encounters-empty")).toBeVisible();

  // Back to the games: the same game mode, and the same count beside it.
  await page.getByTestId("match-view-games").click();
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).not.toHaveURL(/view=encounters/);
  await expect(page.getByTestId("match-history")).toBeVisible();
  expect(await countOf(page.locator("#overview-mode option:checked"))).toBe(solo);
});

test("your own Encounters: the old Team Matches address opens them with its game mode and list", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "one member account, on the desktop project");
  // A member with a profile of their own (the local owner has none: the address opens Played together for them).
  await page.goto("/matches?view=encounters");
  await expect(page).toHaveURL(/\/matches$/);
  const { context, page: member } = await memberContext(browser, page);
  await member.goto("/matches?view=encounters&queue=solo&rel=opponents&season=15");
  await expect(member).toHaveURL(/\/overview\/matches\?/);
  const url = new URL(member.url());
  expect(url.searchParams.get("view")).toBe("encounters");
  expect(url.searchParams.get("mode")).toBe("solo");
  await expect(member.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  await expect(member.getByTestId("match-view-encounters")).toHaveAttribute("aria-current", "page");
  // Against (the old Frequent opponents) is the default list: no rel in the address.
  expect(url.searchParams.has("rel")).toBe(false);
  // A new member has no stored games yet: an honest empty state, never another season.
  await expect(member.getByTestId("encounters-empty")).toBeVisible();
  await expect(member.locator("main").getByText(/Season 2025/)).toHaveCount(0);
  await context.close();
});
