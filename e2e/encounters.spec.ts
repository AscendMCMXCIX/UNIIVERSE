import { expect, test, type Locator, type Page } from "./test";
import { optionLabels, pick, shownLabel } from "./select";
import { closeFilterSheet, openFilterBar } from "./filters";
import { memberContext } from "./member-account";
import { closeGame, openGame, opensFullScreen } from "./match-history";

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
/** Desktop and tablet show the column names (and, where a table is too narrow for them, a Sort by control); phones choose the order in the Filters sheet. */
const wide = async (page: Page) => (await page.getByTestId("encounter-heads").count()) > 0 && (await page.getByTestId("encounter-heads").isVisible());
/** Phones (below md) keep the list's minimum and order in the Filters sheet, as chips (owner decision D8). */
const inSheet = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
/** Chooses the list's minimum or order: in the phone's Filters sheet (then closes it), else in the list's toolbar. */
async function chooseListOption(page: Page, which: "min" | "sort", value: string) {
  if (!inSheet(page)) return pick(page.getByTestId(`encounter-${which}`), value);
  await openFilterBar(page.getByTestId("encounter-filters"));
  await page.getByTestId(`encounter-${which}-choices`).locator(`[data-value="${value}"]`).click();
  await expect(page.getByTestId(`encounter-${which}-choices`).locator(`[data-value="${value}"]`)).toHaveAttribute("aria-checked", "true");
  await closeFilterSheet(page);
}
/** The count in brackets after the game mode a Select shows ("Ranked Solo/Duo (12)"). */
const countOf = async (control: ReturnType<Page["locator"]>) => Number(/\((\d+)\)/.exec(await shownLabel(control))![1]);
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
  await expect(caveat).toHaveAccessibleDescription(/not parties or friends/);
  await expect(caveat).toHaveAccessibleDescription(/Against: other team; alongside: same team/);
  await expect(caveat).toHaveAccessibleDescription(/Grey: fewer than 5 games/);
  await expect(page.getByTestId("encounters")).not.toContainText(/premade|duo partner|\bcounters?\b|\bmixed\b/i);

  // All by default, met twice or more: both records side by side, never added together, and no win-rate order.
  await expect(page.getByTestId("encounter-relation-all")).toHaveAttribute("aria-current", "page");
  await expect(page).not.toHaveURL(/rel=/);
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  expect(await relationCount(page, "all")).toBeGreaterThanOrEqual(await rows.count());
  for (const row of (await rows.all()).slice(0, 10)) {
    for (const side of ["against", "alongside"] as const) {
      const cell = row.locator(`[data-testid='encounter-record'][data-relation='${side === "against" ? "opponent" : "ally"}']`);
      await expect(cell).toHaveAttribute("data-games", String(await sideGames(row, side)));
      if (!(await sideGames(row, side))) await expect(cell).toContainText("never");
    }
  }
  if (await wide(page)) {
    await expect(page.getByTestId("encounter-heads")).toContainText(/Player.*Games.*Against.*Games.*Record.*Win %.*Alongside.*Games.*Record.*Win %.*Last met/i);
    await expect(page.getByTestId("encounter-sort-best")).toHaveCount(0);
  } else if (inSheet(page)) {
    // A phone's orders are chips in the Filters sheet, beside the minimum.
    await openFilterBar(page.getByTestId("encounter-filters"));
    await expect(page.getByTestId("encounter-sort-choices").getByRole("radio")).toHaveText(["Most games", "Most recent"]);
    await expect(page.getByTestId("encounter-min-choices").getByRole("radio", { checked: true })).toHaveText("2+ games");
    await closeFilterSheet(page);
  } else expect(await optionLabels(page.getByTestId("encounter-sort"))).toEqual(["Most games", "Most recent"]);

  // Against: the player's own record against each, in figures.
  await page.getByTestId("encounter-relation-against").click();
  await expect(page).toHaveURL(/rel=against/);
  await expect(page.getByTestId("encounter-relation-against")).toHaveAttribute("aria-current", "page");
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

  // Back to All: the default, so the address names no relation.
  await page.getByTestId("encounter-relation-all").click();
  await expect(page).not.toHaveURL(/rel=/);
  await expect(page.getByTestId("encounter-relation-all")).toHaveAttribute("aria-current", "page");
  await expect(rows.first()).toBeVisible();

  // At least three games: every player left was met three times or more in all.
  await chooseListOption(page, "min", "3");
  await expect(page).toHaveURL(/min=3/);
  // On a phone the choice shows as a chip beside Filters, counted with the filters.
  if (inSheet(page)) {
    await expect(page.getByRole("button", { name: "3+ games: remove this filter" })).toBeVisible();
    await expect(page.getByTestId("encounter-filters").getByTestId("filter-count")).toHaveText("1");
  }
  for (const row of await rows.all()) expect((await sideGames(row, "against")) + (await sideGames(row, "alongside"))).toBeGreaterThanOrEqual(3);

  // A search that matches nobody: an honest empty state, the choices kept.
  await page.getByTestId("encounter-search").fill("Nobody Like This#NONE");
  await expect(page).toHaveURL(/q=Nobody/);
  await expect(page.getByTestId("encounters-none")).toBeVisible();
  await expect(page.getByTestId("encounter-relation-all")).toHaveAttribute("aria-current", "page");
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
      // The column names sort: the win rate's reverses on a second press. From any other order the
      // first press gives the highest first, so press it until the address says so (it already may,
      // when the highest was the last order chosen), then once more for the lowest.
      if (order === "worst" && !/[?&]sort=best\b/.test(page.url())) {
        await page.getByTestId("encounter-sort-best").click();
        await expect(page).toHaveURL(/sort=best/);
        await expect(page.locator("[data-testid='encounters'] [aria-busy='true']")).toHaveCount(0);
      }
      await page.getByTestId(`encounter-sort-${order === "worst" ? "best" : order}`).click();
    } else await chooseListOption(page, "sort", order);
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

test("one player's games: Match History's own list, both records, each side, a game under its card, and the way back", async ({ page }) => {
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=against&min=1&limit=500`);
  // A player met both ways, opened from Against: their games start with the games against them.
  const row = page.locator("[data-testid='encounter-row']:not([data-against='0']):not([data-alongside='0'])").first();
  const [against, alongside] = [await sideGames(row, "against"), await sideGames(row, "alongside")];
  const name = (await row.locator("[title]").first().getAttribute("title"))!;
  await row.getByTestId("open-encounter").click();
  // Match History itself, filtered to them: no window, Encounters still the view in the tabs.
  const panel = page.getByTestId("encounter-games");
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/met=[A-Za-z0-9_-]{16}/);
  await expect(page).toHaveURL(/side=against/);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByTestId("match-view-encounters")).toHaveAttribute("aria-current", "page");
  await expect(panel.locator("#encounter-title")).toContainText(name.split("#")[0]!);
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${against + alongside} games? with .* · last met `));
  // The two records, never added together.
  await expect(panel.locator("[data-testid='encounter-detail-record'][data-relation='opponent']")).toHaveAttribute("data-games", String(against));
  await expect(panel.locator("[data-testid='encounter-detail-record'][data-relation='ally']")).toHaveAttribute("data-games", String(alongside));
  // The side the list showed, then each side, then all of them: the list holds exactly those games.
  await expect(page.getByTestId("encounter-games-against")).toHaveAttribute("aria-current", "page");
  for (const [choice, count] of [["alongside", alongside], ["all", against + alongside], ["against", against]] as const) {
    await page.getByTestId(`encounter-games-${choice}`).click();
    if (choice === "all") await expect(page).not.toHaveURL(/side=/);
    else await expect(page).toHaveURL(new RegExp(`side=${choice}`));
    await expect(page.getByTestId(`encounter-games-${choice}`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-testid='match-history'][data-ready]")).toHaveAttribute("data-total", String(count));
  }
  // A game opens under its card, as anywhere in Match History: the same breakdown, no window (on a
  // phone, as everywhere there, the game takes the whole screen).
  const card = page.getByTestId("match-card").first();
  await openGame(card);
  if (!opensFullScreen(page)) await expect(page.getByTestId("match-detail")).toHaveCount(0);
  await closeGame(card);
  // OP.GG opens in a new tab, never in place.
  const opgg = page.getByTestId("encounter-opgg");
  if (await opgg.count()) {
    await expect(opgg).toHaveAttribute("target", "_blank");
    await expect(opgg).toHaveAttribute("href", /^https:\/\/op\.gg\/lol\/summoners\//);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  // The way back: the list as it was (Against, every player).
  await page.getByTestId("encounter-back").click();
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  await expect(page).toHaveURL(/rel=against/);
  await expect(page).toHaveURL(/min=1/);
  await expect(page).not.toHaveURL(/met=/);
  // Back and Forward follow the same addresses.
  await page.goBack();
  await expect(page.getByTestId("encounter-games")).toBeVisible();
  await page.goBack();
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  await expect(page.getByTestId("encounter-relation-against")).toHaveAttribute("aria-current", "page");
});

test("a game's scoreboard marks the players met in other games, and a mark opens their games with the same count", async ({ page }) => {
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
  // "Met N×" on screen; read as "Met N times, this game included (… against, … on the same team). Opens those games" (the same words on anyone's game).
  expect(await mark!.evaluate((el) => [...el.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("sr-only"))).map((n) => n.textContent).join(""))).toBe(`Met ${games}×`);
  await expect(mark!).toHaveAccessibleName(new RegExp(`^Met ${games} times, this game included \\((\\d+ against)?(, )?(\\d+ on the same team)?\\)\\. Opens those games$`));
  // The Riot ID the row names (its title), not the row's text: a possible group's label, read to
  // screen readers after the name, arrives with the groups and may or may not be there yet.
  const name = (await mark!.locator("xpath=ancestor::li[1]").getByTestId("participant-name").getAttribute("title"))!.split("#")[0]!;
  // Nothing scrolls sideways for it, on a phone either.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  // Their games in Match History, in the list's season and game mode: the same count.
  await mark!.click();
  const panel = page.getByTestId("encounter-games");
  await expect(panel).toBeVisible();
  await expect(panel.locator("#encounter-title")).toContainText(name);
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${games} games with `));
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toHaveAttribute("data-total", String(games));
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // Back returns to the games list it came from.
  await page.goBack();
  await expect(page.getByTestId("encounter-games")).toHaveCount(0);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
});

test("against reads warm and alongside cool, always with the word, on the list, its choice and a player's games", async ({ page }) => {
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
  // A player's games: each record's side in the same words and colours.
  await page.locator("[data-testid='encounter-row']:not([data-against='0']):not([data-alongside='0'])").first().getByTestId("open-encounter").click();
  const panel = page.getByTestId("encounter-games");
  await expect(panel).toBeVisible();
  const recordTags = await panel.getByTestId("relation-tag").evaluateAll((els) => els.map((el) => ({ relation: el.getAttribute("data-relation")!, text: el.textContent!.trim(), color: getComputedStyle(el).color })));
  expect(recordTags.map((t) => t.relation)).toEqual(["opponent", "ally"]);
  for (const t of recordTags) {
    const [r, , b] = rgb(t.color);
    expect(t.text).toBe(t.relation === "opponent" ? "Against" : "Alongside");
    if (t.relation === "opponent") expect(r).toBeGreaterThan(b);
    else expect(b).toBeGreaterThan(r);
  }
});

test("the season, game mode and account choice is the games list's, and every count follows it", async ({ page }) => {
  await openEncounters(page, `${await teammate(page)}/matches?view=encounters`);
  // Phones fold the filters behind one button.
  await openFilterBar(page.getByTestId("encounter-filters"));
  const mode = page.locator("#overview-mode");
  // Games in the view: the same number the game mode shows beside its name.
  const coverage = page.getByTestId("encounters-scope");
  const all = await countOf(mode);
  await expect(coverage).toContainText(new RegExp(`Players met in ${all} games?|of ${all} games`));
  await pick(mode, "solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).toHaveURL(/view=encounters/);
  const solo = await countOf(page.locator("#overview-mode"));
  expect(solo).toBeLessThanOrEqual(all);
  if (solo) await expect(coverage).toContainText(new RegExp(`Players met in ${solo} games?|of ${solo} games`));
  else await expect(page.getByTestId("encounters-empty")).toBeVisible();

  // Back to the games: the same game mode, and the same count beside it.
  await closeFilterSheet(page);
  await page.getByTestId("match-view-games").click();
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).not.toHaveURL(/view=encounters/);
  await expect(page.getByTestId("match-history")).toBeVisible();
  expect(await countOf(page.locator("#overview-mode"))).toBe(solo);
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
  // The old Frequent opponents is Against, named in the address (All is the default list now).
  expect(url.searchParams.get("rel")).toBe("against");
  // A new member has no stored games yet: an honest empty state, never another season.
  await expect(member.getByTestId("encounters-empty")).toBeVisible();
  await expect(member.locator("main").getByText(/Season 2025/)).toHaveCount(0);
  await context.close();
});

test("a phone keeps the list's minimum and order in the Filters sheet, as chips: chosen there, shown beside Filters, removed by a tap or by Reset", async ({ page }) => {
  test.skip(!inSheet(page), "a phone's Filters sheet (from md they are in the list's toolbar)");
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=against`);
  // Not in the list's toolbar on a phone: the list starts higher.
  await expect(page.getByTestId("encounter-min")).toBeHidden();
  await expect(page.getByTestId("encounter-sort")).toBeHidden();
  await openFilterBar(page.getByTestId("encounter-filters"));
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet.getByTestId("encounter-min-choices").getByRole("radio")).toHaveText(["Any number of games", "2+ games", "3+ games", "5+ games", "10+ games"]);
  // One side in view: every order, the win rates included; each a finger-sized chip.
  await expect(sheet.getByTestId("encounter-sort-choices").getByRole("radio")).toHaveText(["Most games", "Most recent", "Highest win rate", "Lowest win rate"]);
  for (const box of await sheet.getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(43.5);
  // Applied at once, replacing the address (Back leaves the page, as with every filter).
  const entries = await page.evaluate(() => history.length);
  await sheet.getByTestId("encounter-sort-choices").locator('[data-value="recent"]').click();
  await expect(page).toHaveURL(/sort=recent/);
  await sheet.getByTestId("encounter-min-choices").locator('[data-value="1"]').click();
  await expect(page).toHaveURL(/min=1/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await closeFilterSheet(page);
  // Both shown beside Filters and counted; a tap on a chip removes it.
  const sortChip = page.getByRole("button", { name: "Most recent: remove this filter" });
  await expect(sortChip).toBeVisible();
  await expect(page.getByRole("button", { name: "Any number of games: remove this filter" })).toBeVisible();
  await expect(page.getByTestId("encounter-filters").getByTestId("filter-count")).toHaveText("2");
  await sortChip.click();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(sortChip).toHaveCount(0);
  // Reset puts the minimum back too; the side in view stays.
  await openFilterBar(page.getByTestId("encounter-filters"));
  await page.getByTestId("filter-sheet").getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/min=/);
  await expect(page).toHaveURL(/rel=against/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("tablet and desktop: the list's minimum and order are the list's own: they never bring the filters' Reset, which leaves them as they are", async ({ page }) => {
  test.skip(inSheet(page), "from md the minimum and the order sit in the list's toolbar (a phone keeps them in its Filters sheet)");
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=against`);
  const filters = page.getByTestId("encounter-filters");
  // An order chosen from the column names and a minimum chosen in the list's toolbar narrow none of
  // the filters: no Reset.
  await page.getByTestId("encounter-sort-recent").click();
  await expect(page).toHaveURL(/sort=recent/);
  await chooseListOption(page, "min", "1");
  await expect(page).toHaveURL(/min=1/);
  await expect(filters.getByTestId("reset-filters")).toHaveCount(0);
  // A filter narrowed: Reset appears, and puts the filters back with the list's choices kept.
  await pick(filters.getByLabel("Game mode"), "solo");
  await expect(page).toHaveURL(/mode=solo/);
  const reset = filters.getByTestId("reset-filters");
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(page).not.toHaveURL(/mode=/);
  await expect(page).toHaveURL(/sort=recent/);
  await expect(page).toHaveURL(/min=1/);
  await expect(page).toHaveURL(/rel=against/);
  await expect(filters.getByTestId("reset-filters")).toHaveCount(0);
});

test("tablet and desktop: the column names stay pinned under the profile's section tabs while the list scrolls; a short window pins nothing", async ({ page }) => {
  test.skip(inSheet(page), "a phone's list has no column names");
  await page.goto("/team");
  const top = `/players/${await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id")}`;
  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: 600 });
  await openEncounters(page, `${top}/matches?view=encounters&rel=against&min=1&limit=500`);
  const heads = page.getByTestId("encounter-heads");
  await expect(heads).toBeVisible();
  const rest = (await heads.boundingBox())!.y + (await page.evaluate(() => window.scrollY));
  await page.evaluate((y) => window.scrollTo(0, y + 1500), rest);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(rest);
  const tabs = page.getByTestId("profile-tabs");
  const bar = width < 1024 ? (await page.getByTestId("mobile-topbar").boundingBox())!.y + (await page.getByTestId("mobile-topbar").boundingBox())!.height : 0;
  const [t, h] = [(await tabs.boundingBox())!, (await heads.boundingBox())!];
  expect(Math.abs(t.y - bar), "the section tabs pinned").toBeLessThanOrEqual(1);
  expect(Math.abs(h.y - (t.y + t.height)), "the column names right under them").toBeLessThanOrEqual(1);
  // Still the list's own: sorting from there works.
  await page.getByTestId("encounter-sort-recent").click();
  await expect(page).toHaveURL(/sort=recent/);
  // A short window (480px tall or shorter) keeps its height for the page.
  await page.setViewportSize({ width, height: 420 });
  expect(await heads.evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
});
