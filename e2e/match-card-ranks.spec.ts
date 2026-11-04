import { expect, test, type Locator, type Page } from "./test";
import { createMember } from "./member-account";
import { cardOf, closeGame, openGame } from "./match-history";

/*
  Ranks on the collapsed match cards (components/match-history/team-composition.tsx and
  rank-short.tsx, server/players/match-history.ts): everyone's but the player's current or
  last-checked rank in a few letters ("E2", "GM", "Unr"), in its tier's colour, read from storage
  with the page and never asked of Riot while the list is browsed. The check an opened game makes
  (the browser tests' Riot stand-in, server/riot/browser-test.ts) shows on its card at once, and on
  every later visit. Wide cards put the rank on the name's line without the card growing; phones
  stack it under the icon. And a member's OP.GG profile: a small link beside their profile link,
  for a mouse and the keyboard.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** A tier's letter and division (E2, P1), an apex tier (M, GM, C), either marked f or s for the other queue; or Unr. */
const RANK_TEXT = /^(?:[IBSGPED][1-4]|M|GM|C)[fs]?$|^Unr$/;

/**
 * The server actions the page calls (requests carrying Next's action header), a rank check among
 * them. Counted by request: on phones Chromium does not always keep an action's answer to read.
 */
function watchActions(page: Page) {
  const actions: string[] = [];
  page.on("request", (r) => {
    const id = r.headers()["next-action"];
    if (r.method() === "POST" && id) actions.push(id);
  });
  return actions;
}

async function openHistory(page: Page, role: string) {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`, { waitUntil: "networkidle" });
}

/** A game on the page whose players show no rank yet: one no opened game has checked. */
async function uncheckedGame(page: Page): Promise<string> {
  const cards = page.getByTestId("match-card");
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    if ((await card.getByTestId("match-teams").count()) && !(await card.getByTestId("slot-rank").count())) return (await card.getByTestId("match-row").getAttribute("data-match"))!;
  }
  throw new Error("every game on the page already shows ranks");
}

/** Opens a game under its card and waits for its rank check to answer. */
async function openMatch(card: Locator) {
  const breakdown = await openGame(card);
  const note = breakdown.getByTestId("ranks-note");
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  return breakdown;
}

/** Each rank shown on a card: what it says and its whole statement, in order. */
const ranksOn = (card: Locator) =>
  card.getByTestId("slot-rank").evaluateAll((els) => els.map((e) => ({ text: e.textContent ?? "", title: e.getAttribute("title") ?? "", state: e.getAttribute("data-state"), tier: e.getAttribute("data-tier"), timing: e.getAttribute("data-timing"), classes: e.className })));

test("a player's rank shows on the card once the opened game has checked it, and on every later visit, without asking Riot again", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, "a phone's card leaves both teams and their ranks to the game's own screen (docs/MOBILE.md)");
  const actions = watchActions(page);
  await openHistory(page, "ADC");
  // Listing the games calls nothing: no rank check, so nothing asked of Riot.
  expect(actions).toEqual([]);
  const matchId = await uncheckedGame(page);
  const card = cardOf(page, matchId);
  const before = (await card.boundingBox())!;
  const breakdown = await openMatch(card);
  // What the breakdown says of each player, in full.
  const statements = await breakdown.getByTestId("participant-rank").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  await closeGame(card);

  // Without reloading: the card shows what the check found, for everyone but the player.
  await expect(card.getByTestId("slot-rank").first()).toBeVisible();
  const shown = await ranksOn(card);
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.length).toBeLessThanOrEqual(9);
  await expect(card.locator("[data-you] [data-testid='slot-rank']")).toHaveCount(0);
  for (const r of shown) {
    expect(r.text, r.title).toMatch(RANK_TEXT);
    // The same statement as the breakdown's badge: the queue, the rank, and when it was read against this game.
    expect(statements).toContain(r.title);
    const around = r.timing === "before" || r.timing === "after";
    if (r.state === "ranked") {
      expect(r.title).toMatch(/^Ranked (Solo\/Duo|Flex): .+, (the last rank recorded before this game|checked \d+ (min|h) after this game|checked \d{1,2} [A-Z][a-z]{2} \d{4}, (\d+ days? after|before) this game: their rank then, not at the time of this game)$/);
      // Read around the game: in its tier's colour; read later (just now, for an older game): the caption colour.
      expect(r.classes).toContain(around ? `text-tier-${r.tier!.toLowerCase()}` : "text-fg-subtle");
    } else {
      expect(r.state).toBe("unranked");
      expect(r.text).toBe("Unr");
      expect(r.title).toMatch(/^Unranked(:| before this game:) no Ranked Solo\/Duo or Flex entry/);
    }
  }
  // Screen readers hear them in the card's description.
  const described = (await card.getByTestId("match-row").getAttribute("aria-describedby"))!;
  await expect(page.locator(`#${described}`)).toContainText(shown.some((r) => r.state === "unranked") ? "unranked" : /Iron|Bronze|Silver|Gold|Plat|Emerald|Diamond|Master|GM|Chall/);

  // Laid out without collisions or sideways scroll.
  const geometry = await card.getByTestId("match-teams").evaluate((teams) => {
    const box = (e: Element) => e.getBoundingClientRect();
    const slots = [...teams.querySelectorAll('[data-testid="team-slot"]')];
    const icon = (s: Element) => box(s.firstElementChild!);
    return {
      iconTops: slots.map((s) => icon(s).top),
      ranks: slots.flatMap((s) => {
        const r = s.querySelector('[data-testid="slot-rank"]');
        if (!r) return [];
        const name = s.querySelector('[data-testid="team-slot-name"]')!;
        return [{ rank: box(r).toJSON(), icon: icon(s).toJSON(), name: box(name).toJSON(), nameShown: box(name).width > 1 }];
      }),
    };
  });
  const rects = geometry.ranks.map((g) => g.rank);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const [a, b] = [rects[i]!, rects[j]!];
      expect(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, "two ranks overlap").toBe(true);
    }
  for (const g of geometry.ranks) {
    if (g.nameShown) {
      // With the names shown: on the name's line, after it, and the card is as tall as before.
      expect(Math.abs(g.rank.top + g.rank.height / 2 - (g.name.top + g.name.height / 2))).toBeLessThanOrEqual(2);
      expect(g.rank.left).toBeGreaterThanOrEqual(g.name.right - 0.5);
    } else {
      // Phones: under its icon, centred on it.
      expect(g.rank.top).toBeGreaterThanOrEqual(g.icon.bottom - 0.5);
      expect(Math.abs(g.rank.left + g.rank.width / 2 - (g.icon.left + g.icon.width / 2))).toBeLessThanOrEqual(1);
    }
  }
  const after = (await card.boundingBox())!;
  if (isPhone(page)) {
    // The rank's one line under the icons, and all ten icons still on one line.
    expect(after.height - before.height).toBeLessThanOrEqual(12);
    expect(Math.max(...geometry.iconTops) - Math.min(...geometry.iconTops)).toBeLessThanOrEqual(1);
  } else expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(0.5);
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  // A later visit: the same ranks, from storage, and again no action called (the pointer is moved
  // off the cards first: pressing one fetches its game ahead).
  if (!isPhone(page)) await page.mouse.move(0, 0);
  const called = actions.length;
  await page.reload({ waitUntil: "networkidle" });
  await expect(cardOf(page, matchId).getByTestId("slot-rank").first()).toBeVisible();
  expect((await ranksOn(cardOf(page, matchId))).map((r) => [r.text, r.title])).toEqual(shown.map((r) => [r.text, r.title]));
  expect(actions.length).toBe(called);
});

test("Team → Matches keeps its preview without ranks", async ({ page }) => {
  await page.goto("/matches", { waitUntil: "networkidle" });
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  await expect(page.getByTestId("slot-rank")).toHaveCount(0);
});

test("a member's OP.GG profile: a small link beside their profile link, on the card and in the opened game, opening OP.GG in a new tab and never the game", async ({ page, context }, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop cover touch and the pointer");
  // OP.GG itself is never reached from a test: its pages are answered here.
  await context.route("https://op.gg/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>OP.GG</title>" }));
  // A member whose games come from the stand-in: Riot match ids (OC1_…) and their linked Riot ID.
  const { username } = await createMember(page, "Opgg");
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: new URL(page.url()).origin }]);
  await page.goto("/players", { waitUntil: "networkidle" });
  const href = (await page.locator(`main a[data-testid='player-card'][data-player-name='${username}']`).first().getAttribute("href"))!;
  await page.goto(`${href}/matches`, { waitUntil: "networkidle" });
  const refresh = page.getByTestId("data-refresh-button");
  if (isPhone(page)) await refresh.tap();
  else await refresh.click();
  await expect(page.getByTestId("toast")).toContainText("3 new games", { timeout: 30_000 });
  await expect(page.getByTestId("match-row")).toHaveCount(3);

  const card = page.getByTestId("match-card").first();
  const you = card.locator("[data-you]");
  const opgg = you.getByTestId("player-opgg");
  const address = new RegExp(`^https://op\\.gg/lol/summoners/oce/${username}-OCE$`, "i");
  // Their linked Riot ID on the match's server (OC1 → oce); the name still opens the profile.
  await expect(opgg).toHaveAttribute("href", address);
  await expect(opgg).toHaveAttribute("target", "_blank");
  await expect(opgg).toHaveAttribute("rel", "noopener noreferrer");
  await expect(opgg).toHaveAttribute("tabindex", "-1");
  await expect(you.getByTestId("player-link")).toHaveAttribute("data-link", "profile");
  if (isPhone(page)) {
    // Touch: too small a target beside the name, so not drawn (the names fold away on phones anyway).
    await expect(opgg).toBeHidden();
  } else {
    await expect(opgg).toBeVisible();
    await expect(opgg).toHaveAccessibleName(/on OP\.GG \(opens in a new tab\)/);
    const popup = page.waitForEvent("popup");
    await opgg.click();
    const tab = await popup;
    await expect(tab).toHaveURL(address);
    await tab.close();
    // The click opened OP.GG, not the game.
    await expect(card.getByTestId("match-row")).toHaveAttribute("aria-expanded", "false");
  }

  // The opened game: the name opens the profile; beside it the same OP.GG link, in the tab order.
  const detail = await openGame(card);
  const row = detail.locator("[data-testid='participant'][data-player]");
  await expect(row.getByTestId("player-link")).toHaveAttribute("data-link", "profile");
  const arrow = row.getByTestId("player-opgg");
  await expect(arrow).toHaveAttribute("href", address);
  await expect(arrow).not.toHaveAttribute("tabindex", "-1");
  if (isPhone(page)) {
    await expect(arrow).toBeHidden();
    // On touch the breakdown's own button is the way to OP.GG: a finger-sized one.
    const button = detail.getByTestId("match-opgg-history");
    await expect(button).toHaveAttribute("href", address);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(arrow).toBeVisible();
    // The keyboard reaches it straight after the name.
    await row.getByTestId("player-link").focus();
    await page.keyboard.press("Tab");
    await expect(arrow).toBeFocused();
  }
});
