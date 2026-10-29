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

/** The games a row's record covers: those on the list's side, or every game on Everyone. */
const gamesOf = async (row: Locator) => Number(await row.getByTestId("encounter-record").getAttribute("data-games"));

/**
 * A row says what the player was (Opponent, Ally, or Mixed when both), the games on each side
 * ("Against 7", "Alongside 2"), and the record: right after the side the list is about, or after
 * both sides on Everyone.
 */
async function expectRow(row: Locator, relation: "opponents" | "allies" | "everyone") {
  const against = row.getByTestId("encounter-count-opponent");
  const alongside = row.getByTestId("encounter-count-ally");
  const [a, b] = [await against.count(), await alongside.count()];
  const kind = a && b ? "mixed" : a ? "opponent" : "ally";
  await expect(row).toHaveAttribute("data-kind", kind);
  await expect(row.getByTestId("encounter-kind")).toHaveText({ mixed: "Mixed", opponent: "Opponent", ally: "Ally" }[kind]);
  if (a) await expect(against).toHaveText(`Against ${await against.getAttribute("data-games")}`);
  if (b) await expect(alongside).toHaveText(`Alongside ${await alongside.getAttribute("data-games")}`);
  await expect(row.getByTestId("encounter-record")).toHaveText(/^\d+W \d+L( · \d+%)?$/);
  const order = await row.locator("[data-testid^='encounter-count-'], [data-testid='encounter-record']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  if (relation === "everyone") expect(order.at(-1)).toBe("encounter-record");
  else {
    const side = relation === "opponents" ? against : alongside;
    expect(order.slice(0, 2)).toEqual([relation === "opponents" ? "encounter-count-opponent" : "encounter-count-ally", "encounter-record"]);
    expect(await gamesOf(row)).toBe(Number(await side.getAttribute("data-games")));
  }
}
const countOf = async (option: ReturnType<Page["locator"]>) => Number(/\((\d+)\)/.exec((await option.textContent()) ?? "")![1]);

test("Encounters lists the opponents and allies a player keeps meeting, with honest wording", async ({ page }) => {
  // One switch away from the games; the season and game mode come along. (Once the games list
  // is interactive: it fits its page size to the screen on arrival, which would overtake a link
  // followed before then.)
  await page.goto(`${await teammate(page)}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  await page.getByTestId("match-view-encounters").click();
  await expect(page).toHaveURL(/view=encounters/);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  await expect(page.getByTestId("match-view-encounters")).toHaveAttribute("aria-current", "page");
  // What encounters prove is behind (i); never premade, duo-partner or "counter" language.
  await expect(page.getByRole("button", { name: "How encounters are counted" })).toHaveAccessibleDescription(/not parties, friendships/);
  await expect(page.getByTestId("encounters")).not.toContainText(/premade|duo partner|\bcounters?\b/i);

  // Opponents by default, met twice or more, the player's own record against them.
  await expect(page.getByTestId("encounter-relation-opponents")).toHaveAttribute("aria-current", "page");
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expectRow(row, "opponents");
    const games = await gamesOf(row);
    expect(games).toBeGreaterThanOrEqual(2);
    // Fewer than five games is labelled a small sample, and only then.
    await expect(row.getByTestId("encounter-small-sample")).toHaveCount(games < 5 ? 1 : 0);
  }

  // Allies, then everyone met.
  await page.getByTestId("encounter-relation-allies").click();
  await expect(page).toHaveURL(/rel=allies/);
  await expect(page.getByTestId("encounter-relation-allies")).toHaveAttribute("aria-current", "page");
  for (const row of await rows.all()) await expectRow(row, "allies");
  await page.getByTestId("encounter-relation-everyone").click();
  await expect(page).toHaveURL(/rel=everyone/);
  await expect(page.getByTestId("encounter-relation-everyone")).toHaveAttribute("aria-current", "page");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expectRow(row, "everyone");

  // At least three games: every player left was met three times or more.
  await page.getByTestId("encounter-min").selectOption("3");
  await expect(page).toHaveURL(/min=3/);
  for (const row of await rows.all()) expect(await gamesOf(row)).toBeGreaterThanOrEqual(3);

  // A search that matches nobody: an honest empty state, the choices kept.
  await page.getByTestId("encounter-search").fill("Nobody Like This#NONE");
  await expect(page).toHaveURL(/q=Nobody/);
  await expect(page.getByTestId("encounters-none")).toBeVisible();
  await expect(page).toHaveURL(/rel=everyone/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("one player's window: the record, every recorded game, and the match with Back", async ({ page }) => {
  await openEncounters(page, `${await teammate(page)}/matches?view=encounters&rel=everyone`);
  const row = page.getByTestId("encounter-row").first();
  const total = await gamesOf(row);
  const kind = (await row.getAttribute("data-kind"))!;
  const side = async (r: "opponent" | "ally") => ((await row.getByTestId(`encounter-count-${r}`).count()) ? Number(await row.getByTestId(`encounter-count-${r}`).getAttribute("data-games")) : 0);
  const [against, alongside] = [await side("opponent"), await side("ally")];
  await row.click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${total} recorded games? with `));
  // What they were, as on the row, and the games against them, then those alongside them.
  await expect(detail.getByTestId("encounter-kind")).toHaveAttribute("data-kind", kind);
  const sections = detail.getByTestId("encounter-games-section");
  expect(await sections.evaluateAll((els) => els.map((e) => [e.getAttribute("data-relation"), Number(e.getAttribute("data-games"))]))).toEqual([...(against ? [["opponent", against]] : []), ...(alongside ? [["ally", alongside]] : [])]);
  for (const section of await sections.all()) {
    const relation = (await section.getAttribute("data-relation"))!;
    for (const r of await section.getByTestId("encounter-game").evaluateAll((els) => els.map((e) => e.getAttribute("data-relation")))) expect(r).toBe(relation);
  }
  // Each game once, newest first.
  const games = page.getByTestId("encounter-game");
  await expect(games).toHaveCount(Math.min(total, 100));
  await expect(page.getByTestId("encounter-detail-note")).toContainText(/not parties/);
  // OP.GG opens in a new tab, never in place.
  const opgg = page.getByTestId("encounter-opgg");
  if (await opgg.count()) {
    await expect(opgg).toHaveAttribute("target", "_blank");
    await expect(opgg).toHaveAttribute("href", /^https:\/\/op\.gg\/lol\/summoners\//);
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

  // Their Encounters window, in the list's season and game mode: the same count, and their games.
  await mark!.click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail).toBeVisible();
  await expect(detail.locator("#encounter-title")).toContainText(name);
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${games} recorded games with `));
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

test("an opponent reads warm, an ally cool and Mixed split, on the rows, the filter and the window", async ({ page }) => {
  // The Support player's Encounters (the demo has every member meet one player on both sides).
  await page.goto("/team");
  const support = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  await openEncounters(page, `${support}/matches?view=encounters&rel=everyone&min=1&limit=500`);
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  // Each row's colour rail and badge: one red for every opponent, one blue for every ally, Mixed both.
  const look = await rows.evaluateAll((els) =>
    els.map((row) => {
      const rail = getComputedStyle(row.firstElementChild!);
      const rgb = (c: string): [number, number, number] => {
        const [r = 0, g = 0, b = 0] = c.match(/[\d.]+/g)!.map(Number);
        return [r, g, b];
      };
      return { kind: row.getAttribute("data-kind")!, rail: rail.backgroundImage === "none" ? rgb(rail.backgroundColor) : "split", badge: rgb(getComputedStyle(row.querySelector("[data-testid=encounter-kind]")!).color) };
    }),
  );
  const of = (kind: string) => look.filter((l) => l.kind === kind);
  expect(of("opponent").length).toBeGreaterThan(0);
  for (const l of of("opponent")) {
    const [r, , b] = l.rail as [number, number, number];
    expect(r).toBeGreaterThan(b);
    expect(l.badge[0]).toBeGreaterThan(l.badge[2]);
  }
  for (const l of of("ally")) {
    const [r, , b] = l.rail as [number, number, number];
    expect(b).toBeGreaterThan(r);
    expect(l.badge[2]).toBeGreaterThan(l.badge[0]);
  }
  expect(of("ally").length).toBeGreaterThan(0);
  expect(of("mixed").length).toBeGreaterThan(0);
  for (const l of of("mixed")) expect(l.rail).toBe("split");
  // A Mixed player's window: the games against them, then those alongside them, as many as the row's chips say.
  const mixed = page.locator("[data-testid='encounter-row'][data-kind='mixed']").first();
  const gamesOn = async (r: "opponent" | "ally") => Number(await mixed.getByTestId(`encounter-count-${r}`).getAttribute("data-games"));
  const [against, alongside] = [await gamesOn("opponent"), await gamesOn("ally")];
  await mixed.click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail.getByTestId("encounter-kind")).toHaveText("Mixed");
  await expect(detail.getByTestId("encounter-games-section")).toHaveCount(2);
  for (const [relation, games] of [["opponent", against], ["ally", alongside]] as const) {
    const section = detail.locator(`[data-testid='encounter-games-section'][data-relation='${relation}']`);
    await expect(section).toHaveAttribute("data-games", String(games));
    await expect(section.locator("h3")).toContainText(relation === "opponent" ? "Against them" : "Alongside them");
    await expect(section.getByTestId("encounter-game")).toHaveCount(games);
  }
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  // The filter's choices carry the same colour keys.
  for (const r of ["opponents", "allies", "everyone"]) await expect(page.getByTestId(`encounter-relation-${r}`).locator("span[aria-hidden]")).toHaveCount(1);
  // Nothing scrolls sideways, no name is cut short for the badge (on a phone the badge, chips and
  // record go on the line under the name), and the badge leads the chips on their line.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  for (const row of [...(await rows.all()).slice(0, 8), ...(await page.locator("[data-testid='encounter-row'][data-kind='mixed']").all())]) {
    expect(await row.locator("[title]").first().evaluate((name) => name.scrollWidth - name.clientWidth)).toBeLessThanOrEqual(1);
    const [badge, chip] = [(await row.getByTestId("encounter-kind").boundingBox())!, (await row.locator("[data-testid^='encounter-count-']").first().boundingBox())!];
    expect(Math.abs(badge.y + badge.height / 2 - (chip.y + chip.height / 2))).toBeLessThanOrEqual(2);
    expect(badge.x).toBeLessThan(chip.x);
    // The record stays on that line (phones: the date ends the name's line), and so does a small
    // sample's mark, except on a Mixed row on the narrowest phones (both sides' chips): there the mark
    // alone starts the next line.
    const record = (await row.getByTestId("encounter-record").boundingBox())!;
    expect(Math.abs(record.y + record.height / 2 - (chip.y + chip.height / 2))).toBeLessThanOrEqual(2);
    const mark = row.getByTestId("encounter-small-sample");
    if (await mark.count()) {
      const m = (await mark.boundingBox())!;
      if (Math.abs(m.y + m.height / 2 - (chip.y + chip.height / 2)) > 2) {
        expect(await row.getAttribute("data-kind")).toBe("mixed");
        expect(m.y).toBeGreaterThanOrEqual(record.y + record.height);
      }
    }
  }
});

test("the season, game mode and account choice is the games list's, and every count follows it", async ({ page }) => {
  await openEncounters(page, `${await teammate(page)}/matches?view=encounters`);
  // Phones fold the filters behind one button.
  await openFilterBar(page.getByTestId("encounter-filters"));
  const mode = page.locator("#overview-mode");
  // Games in the view: the same number the game mode shows beside its name.
  const coverage = page.getByTestId("encounter-count");
  const all = await countOf(mode.locator("option:checked"));
  await expect(coverage).toContainText(new RegExp(`From ${all} recorded games?|of ${all} games`));
  await mode.selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).toHaveURL(/view=encounters/);
  const solo = await countOf(page.locator("#overview-mode option:checked"));
  expect(solo).toBeLessThanOrEqual(all);
  if (solo) await expect(coverage).toContainText(new RegExp(`From ${solo} recorded games?|of ${solo} games`));
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
  await expect(member.getByTestId("encounter-relation-opponents")).toHaveAttribute("aria-current", "page");
  // A new member has no stored games yet: an honest empty state, never another season.
  await expect(member.getByTestId("encounters-empty")).toBeVisible();
  await expect(member.locator("main").getByText(/Season 2025/)).toHaveCount(0);
  await context.close();
});
