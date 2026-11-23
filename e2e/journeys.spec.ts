import { expect, test, type BrowserContext, type Locator, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  JOURNEYS (navigation N1, 19 Nov 2026; docs/MOBILE.md, "Navigation"): the most common things a
  member does on a phone, each counted in taps and in scroll-backs (scrolling back up to reach what
  closes or leads on), at an iPhone 15's size (393 × 852) on the phone project. The table grows with
  each redesign: a later stage adds its own journeys with their targets (S5 a champion's matchups in
  3 taps, S6 the next game and back in 0 scroll-backs, S7 the enemy changed in 2 taps, S8 and S9 a
  list's place kept; all fifteen are here since Release 11: J11 and J13, then J12, J14 and J15 in one
  test). Also here, once: the same four destinations in every posture, in both modes;
  the installed app's Back (Android's system Back is the browser's history Back) closing what is
  open; and the bar never fetching a profile ahead of a tap.

  "My" journeys need a profile with games: a member made in the test, whose three games come from
  the browser tests' Riot stand-in by one Refresh before counting (server/riot/browser-test.ts).
  Admin Mode is the local owner's.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "the journeys are counted once, on an iPhone 15's screen"));
test.describe.configure({ timeout: 240_000 });

const I15 = { width: 393, height: 852 };
const PLAYER = { name: "uniiverse_view", value: "player" };

interface Count {
  taps: number;
  scrolls: number;
  scrollBacks: number;
}

/**
 * One tap of a journey, counted. A target off the screen, or under a bar, is scrolled to first, and
 * that is counted too: a scroll-back when it lay above (the reader scrolling back up to reach it).
 */
async function tap(count: Count, target: Locator, position?: { x: number; y: number }) {
  await expect(target).toBeVisible();
  const where = await target.evaluate((el) => {
    if (el.closest("[data-testid=mobile-topbar], [data-testid=phone-tabbar], dialog")) return "in view";
    const r = el.getBoundingClientRect();
    const top = document.querySelector("[data-testid=mobile-topbar]")?.getBoundingClientRect().bottom ?? 0;
    const bar = document.querySelector("[data-testid=phone-tabbar]")?.getBoundingClientRect();
    const bottom = bar && bar.height > 0 ? bar.top : innerHeight;
    const y = r.top + r.height / 2;
    return y < top ? "above" : y > bottom ? "below" : "in view";
  });
  if (where !== "in view") {
    if (where === "above") count.scrollBacks++;
    else count.scrolls++;
    await target.scrollIntoViewIfNeeded();
  }
  await target.tap(position ? { position } : undefined);
  count.taps++;
}

/** The journeys, J1–J10 (ux-mobile.md §2.2), each from where it starts; returns what each took. */
async function journeys(member: Page, owner: Page, start: "landing" | "profile") {
  const results: Record<string, Count> = {};
  const bar = (p: Page) => p.getByTestId("phone-tabbar");
  const teamRow = (p: Page) => p.getByTestId("team-chrome-tabs");
  // From My Profile with section memory: the Team section the journey needs is the one last used
  // (the "back to where I was" case). From the landing, Team Overview, it plays no part.
  const from = async (p: Page, section: string) => {
    if (start === "profile") {
      await p.goto(section);
      await expect(p.getByTestId("team-chrome-tabs")).toBeVisible();
      await p.goto("/overview");
    } else await p.goto("/team");
    await expect(p.getByTestId("phone-tabbar")).toBeVisible();
  };
  const run = async (id: string, p: Page, section: string, steps: (c: Count) => Promise<void>) => {
    await from(p, section);
    const c: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
    await steps(c);
    results[id] = c;
  };
  // Team Overview's sections: from My Profile the Team tab (it reopens the section last used), from Team the row.
  const toSection = async (c: Count, p: Page, name: string) => {
    if (start === "profile") await tap(c, bar(p).getByTestId("tab-team"));
    else if (name !== "Overview") await tap(c, teamRow(p).getByRole("link", { name }));
  };
  const toMyProfile = async (c: Count) => {
    if (start === "landing") await tap(c, bar(member).getByTestId("tab-overview"));
  };

  await run("J1 see the lineup", member, "/team", async (c) => {
    await toSection(c, member, "Overview");
    await expect(member.getByTestId("lineup-row-TOP")).toBeVisible();
  });
  await run("J2 open my latest game", member, "/team", async (c) => {
    await toMyProfile(c);
    await tap(c, member.getByTestId("profile-chrome-tab-matches"));
    await expect(member.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    // A card opens its game from anywhere on it (its row's own button lies under the card's grid).
    await tap(c, member.getByTestId("match-card").first(), { x: 24, y: 16 });
    await expect(member.getByTestId("match-detail")).toBeVisible();
  });
  await run("J3 a teammate's profile", member, "/players", async (c) => {
    await toSection(c, member, "Players");
    await tap(c, member.getByTestId("players-directory").locator("a[data-testid=player-card][data-player-name='Demo Top']"));
    await expect(member).toHaveURL(/\/players\/[^/]+$/);
  });
  await run("J4 recent form", member, "/leaderboards", async (c) => {
    await toSection(c, member, "Leaderboards");
    await expect(member.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  });
  await run("J5 a game we played together", member, "/matches", async (c) => {
    await toSection(c, member, "Matches");
    await tap(c, member.getByTestId("together-game").first().getByTestId("together-card"), { x: 24, y: 12 });
    await expect(member.getByTestId("match-detail")).toBeVisible();
  });
  await run("J6 Matchup Intel", member, "/team", async (c) => {
    await tap(c, bar(member).getByTestId("tab-resources-matchups"));
    await expect(member.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
  });
  await run("J7 a Resources site", member, "/team", async (c) => {
    await tap(c, bar(member).getByTestId("tab-resources"));
    const site = member.getByTestId("resource-link").first();
    const [opened] = await Promise.all([member.context().waitForEvent("page"), tap(c, site)]);
    await opened.close();
  });
  await run("J8 a champion's matchups", member, "/team", async (c) => {
    await toMyProfile(c);
    await tap(c, member.getByTestId("profile-chrome-tab-champions"));
    await tap(c, member.getByTestId("top-champion").first().getByTestId("open-champion"));
    // The preview (S5) replaced the champion window: on a phone its sheet holds the lane opponents on
    // its first screen, with no tab to choose.
    const preview = member.locator("dialog[open][data-testid=champion-preview]");
    await expect(preview.getByTestId("champion-preview-opponents")).toBeInViewport();
  });
  await run("J9 Settings", member, "/team", async (c) => {
    await tap(c, member.getByTestId("account-sheet-button"));
    await tap(c, member.getByTestId("account-sheet").getByRole("link", { name: "Settings" }));
    await expect(member).toHaveURL(/\/settings$/);
  });
  await run("J10 Admin Mode → Users", owner, "/team", async (c) => {
    await tap(c, owner.getByTestId("account-sheet-button"));
    await tap(c, owner.getByTestId("account-sheet").getByTestId("mode-switch"));
    await expect(owner).toHaveURL(/\/admin$/);
    await tap(c, bar(owner).getByTestId("tab-admin-users"));
    await expect(owner).toHaveURL(/\/admin\/people$/);
    // Back to Player Mode for the next run.
    await owner.goto("/api/mode?to=player");
  });
  return results;
}

/** The phone's context for a page: an iPhone 15's screen, touch, in Player Mode. */
async function phoneContext(page: Page, baseURL: string): Promise<BrowserContext> {
  const context = await page.context().browser()!.newContext({ viewport: I15, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addCookies([{ ...PLAYER, url: baseURL }]);
  return context;
}

test("the ten most common journeys: at most 20 taps from the landing, Matchup Intel in 1 and a Resources site in 2, at most 21 from My Profile with section memory, and no scroll-backs", async ({ page, browser, baseURL }) => {
  // A member with games of their own (their account's three, by one Refresh: setup, not counted).
  // Named in two short words: with games, the member is on Recent form's board for the rest of the
  // run, and large-text-leaderboards.spec holds every name there to wrapping only between words. The
  // username alone ("Journeys" and five letters from the clock) is one word of 13 letters, which
  // some of those letters made too wide for the row at 125% text on a 320px phone (20 Nov 2026).
  const member = await memberContext(browser, page, I15, { base: "Journeys", display: "Journeys Tester", device: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  await member.context.addCookies([{ ...PLAYER, url: baseURL! }]);
  // Resources' sites open in a new tab: answered here, never fetched from the sites themselves.
  await member.context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>site</title>" }));
  await member.page.goto("/overview/matches");
  await member.page.getByTestId("data-refresh-button").tap();
  await expect(member.page.getByTestId("match-card").first()).toBeVisible({ timeout: 30_000 });
  const ownerContext = await phoneContext(page, baseURL!);
  const owner = await ownerContext.newPage();

  const landing = await journeys(member.page, owner, "landing");
  const profile = await journeys(member.page, owner, "profile");
  const total = (r: Record<string, Count>, k: keyof Count) => Object.values(r).reduce((a, c) => a + c[k], 0);
  const table = Object.keys(landing).map((id) => `${id}: ${landing[id]!.taps} from the landing, ${profile[id]!.taps} from My Profile`);
  test.info().annotations.push({ type: "journeys", description: `${table.join("; ")}; totals ${total(landing, "taps")} and ${total(profile, "taps")}` });

  // The plan's targets (22 today on both counts).
  expect(Object.fromEntries(Object.entries(landing).map(([id, c]) => [id, c.taps]))).toEqual({
    "J1 see the lineup": 0,
    "J2 open my latest game": 3,
    "J3 a teammate's profile": 2,
    "J4 recent form": 1,
    "J5 a game we played together": 2,
    "J6 Matchup Intel": 1,
    "J7 a Resources site": 2,
    "J8 a champion's matchups": 3,
    "J9 Settings": 2,
    "J10 Admin Mode → Users": 3,
  });
  expect(total(landing, "taps"), "from the landing").toBeLessThanOrEqual(20);
  expect(total(profile, "taps"), "from My Profile, with section memory").toBeLessThanOrEqual(21);
  expect(landing["J6 Matchup Intel"]!.taps).toBe(1);
  expect(landing["J7 a Resources site"]!.taps).toBe(2);
  expect(total(landing, "scrollBacks") + total(profile, "scrollBacks"), "scroll-backs").toBe(0);
  await member.context.close();
  await ownerContext.close();
});

test("the same four destinations in every posture, in both modes: the phone upright and sideways, a tablet, the desktop's sidebar", async ({ page, baseURL }) => {
  const PLAYER_NAMES = ["My Profile", "Team", "Matchup Intel", "Resources"];
  const ADMIN_NAMES = ["Dashboard", "Users & Permissions", "Platform Settings", "System"];
  const postures = [
    { name: "phone upright", viewport: { width: 393, height: 852 }, nav: "phone-tabbar" },
    { name: "phone sideways", viewport: { width: 852, height: 393 }, nav: "topbar-tabs" },
    { name: "small phone sideways", viewport: { width: 568, height: 320 }, nav: "topbar-tabs" },
    { name: "tablet", viewport: { width: 768, height: 1024 }, nav: "topbar-destinations" },
    { name: "desktop", viewport: { width: 1440, height: 900 }, nav: null },
  ] as const;
  for (const [mode, names, path] of [["player", PLAYER_NAMES, "/team"], ["admin", ADMIN_NAMES, "/admin"]] as const) {
    await page.context().addCookies([{ name: "uniiverse_view", value: mode, url: baseURL! }]);
    for (const posture of postures) {
      const where = `${mode === "admin" ? "Admin Mode" : "Player Mode"}, ${posture.name}`;
      await page.setViewportSize(posture.viewport);
      await page.goto(path);
      const nav = posture.nav ? page.getByTestId(posture.nav) : page.getByTestId("sidebar").getByRole("navigation", { name: "Main" });
      await expect(nav, where).toBeVisible();
      const links = nav.getByRole("link");
      await expect(links, where).toHaveCount(4);
      for (const [i, name] of names.entries()) await expect(links.nth(i), where).toHaveAccessibleName(name);
      // The same icons, in the same order, as the sidebar draws them.
      const icons = await links.evaluateAll((as) => as.map((a) => /lucide-([a-z0-9-]+)/.exec(a.querySelector("svg")?.getAttribute("class") ?? "")?.[1] ?? "avatar"));
      expect(icons, where).toEqual(mode === "player" ? ["circle-user-round", "users", "swords", "book-bookmark"] : ["layout-dashboard", "user-cog", "sliders-horizontal", "server-cog"]);
    }
  }
});

test("the installed app (Android): Back closes the account screen and a game, leaving the page as it was, and leaves a Team section for the one before", async ({ page, baseURL }) => {
  // The installed app's display mode, as Chromium cannot emulate it: the page reads it from matchMedia
  // (install-state.ts); Android's system Back is the browser's history Back, page.goBack() here.
  const context = await phoneContext(page, baseURL!);
  await context.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => (query.includes("display-mode: standalone") ? ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList) : real(query));
  });
  const p = await context.newPage();
  await p.goto("/team");
  await p.getByTestId("team-chrome-tab-matches").tap();
  await expect(p).toHaveURL(/\/matches$/);
  // The account screen: no Install App in the installed app; Back closes it and the page stays.
  await p.getByTestId("account-sheet-button").tap();
  const screen = p.getByTestId("account-sheet");
  await expect(screen).toBeVisible();
  await expect(screen.getByTestId("install-app")).toHaveCount(0);
  await p.goBack();
  await expect(screen).toHaveCount(0);
  await expect(p).toHaveURL(/\/matches$/);
  // A game, opened as a whole screen: Back closes it, the list as it was.
  await p.getByTestId("together-game").first().getByTestId("together-card").tap({ position: { x: 24, y: 12 } });
  await expect(p.getByTestId("match-detail")).toBeVisible();
  await p.goBack();
  await expect(p.getByTestId("match-detail")).toHaveCount(0);
  await expect(p).toHaveURL(/\/matches$/);
  // Then Back leaves the section for the one before it (each section is a page of its own).
  await p.goBack();
  await expect(p).toHaveURL(/\/team$/);
  await context.close();
});

test("the bar never fetches a profile ahead of a tap (a profile starts its player's Riot refresh), while other links are still fetched ahead", async ({ page, baseURL }) => {
  const context = await phoneContext(page, baseURL!);
  const p = await context.newPage();
  const ahead: string[] = [];
  p.on("request", (r) => {
    const h = r.headers();
    if (h["next-router-prefetch"] || h["next-router-segment-prefetch"]) ahead.push(new URL(r.url()).pathname);
  });
  await p.goto("/team");
  await p.waitForLoadState("networkidle");
  // Other destinations are fetched ahead as before (so this would see a profile fetched too).
  await expect.poll(() => ahead.some((path) => path === "/resources" || path === "/resources/matchups"), { message: "other links are fetched ahead" }).toBe(true);
  await p.waitForTimeout(500);
  expect(ahead.filter((path) => path === "/overview" || path.startsWith("/overview/")), "My Profile, never ahead of a tap").toEqual([]);
  // On a teammate's Riot Accounts, whose page links to no other section, the sections in the top bar
  // are not fetched ahead either (a profile's own content may still link to them: docs/HOSTING_USAGE.md).
  const id = (await p.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  ahead.length = 0;
  await p.goto(`/players/${id}/accounts`);
  await expect(p.getByTestId("profile-chrome-tabs")).toBeVisible();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(500);
  expect(ahead.filter((path) => path.startsWith(`/players/${id}`)), "a profile's sections, never ahead of a tap").toEqual([]);
  await context.close();
});

test("J11 a game, Next and close, and J13 a record's game and back: 0 scroll-backs and 2 taps, ending on the last game viewed and on /leaderboards", async ({ page, baseURL }) => {
  const context = await phoneContext(page, baseURL!);
  const p = await context.newPage();
  // J13 (PLAN S6c, UD.L3): a record's game opens over the board, and closing leaves you there.
  const j13: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
  await p.goto("/leaderboards");
  await expect(p.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await tap(j13, p.getByTestId("record-open").first());
  const window = p.locator("dialog[open][data-testid=record-game-peek]");
  await expect(window.getByTestId("record-game-history")).toBeVisible();
  await expect(p).toHaveURL(/\/leaderboards\?match=/);
  await tap(j13, window.getByTestId("record-game-peek-close"));
  await expect(window).toBeHidden();
  await expect(p).toHaveURL(/\/leaderboards$/);
  // The records are below Recent form, so reaching the first is a scroll down (counted, not a tap).
  expect(j13.taps).toBe(2);
  expect(j13.scrollBacks).toBe(0);

  // J11: a teammate's latest game, Next, then close: the list on the last game viewed, nothing to scroll back for.
  const holder = (await p.locator("a[href^='/players/']").first().getAttribute("href"))!.split(/[/?#]/)[2]!;
  const j11: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
  await p.goto(`/players/${holder}/matches`);
  await expect(p.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await tap(j11, p.getByTestId("match-card").first(), { x: 24, y: 16 });
  const game = p.locator("dialog[open][data-testid=match-detail]");
  await expect(game.getByTestId("match-detail-position")).toHaveText(/Game 1 of/);
  await tap(j11, game.getByTestId("match-detail-next"));
  await expect(game.getByTestId("match-detail-position")).toHaveText(/Game 2 of/);
  const second = new URL(p.url()).searchParams.get("match");
  await tap(j11, game.getByTestId("match-detail-close"));
  await expect(game).toHaveCount(0);
  await expect.poll(() => p.evaluate(() => document.activeElement?.closest("li")?.id ?? null)).toBe(`match-${second}`);
  expect(j11.scrollBacks).toBe(0);
  expect(j11.taps).toBe(3);
  await context.close();
});

test("J12 the enemy changed in Matchup Intel after reading, J14 a teammate from Players and back, J15 a person in Admin and back: 2 taps each, 0 scroll-backs, the list where it was", async ({ page, baseURL }) => {
  const context = await phoneContext(page, baseURL!);
  const p = await context.newPage();
  // J12 (PLAN S7a): read down to the enemy's kit, then the pinned pair bar's enemy and a champion.
  // A touch screen keeps its keyboard down as the picker opens (champion-picker.tsx), so a champion
  // on the picker's first screen is 2 taps, and one found by its name 3 (the search field is a tap).
  const read = async () => {
    await expect(async () => {
      await p.getByTestId("matchup-enemy-abilities").scrollIntoViewIfNeeded();
      await expect(p.getByTestId("matchup-pair-bar")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  };
  const picker = p.getByTestId("matchup-picker");
  const j12: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
  await p.goto("/resources/matchups?role=top&champion=Riven&vs=Mordekaiser");
  await expect(p.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  await read();
  await tap(j12, p.getByTestId("matchup-bar-enemy"));
  await expect(picker.locator("button[data-champion]").first()).toBeVisible();
  // The first champion other than the enemy that is whole on the screen, without scrolling the picker.
  const inView = await picker.locator("button[data-champion]").evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.champion!, r: e.getBoundingClientRect() })).find((x) => x.id !== "Mordekaiser" && x.r.top >= 0 && x.r.bottom <= innerHeight && x.r.height > 0)?.id ?? null);
  expect(inView, "J12: a champion on the picker's first screen").not.toBeNull();
  await tap(j12, picker.locator(`button[data-champion="${inView}"]`).first());
  await expect(p.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", inView!);
  await expect(p.getByTestId("matchup-enemy-abilities")).toBeInViewport();
  expect(j12, "J12, a champion in view").toEqual({ taps: 2, scrolls: 0, scrollBacks: 0 });
  // By name: the bar's enemy, the search field, the champion.
  const j12b: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
  await read();
  await tap(j12b, p.getByTestId("matchup-bar-enemy"));
  await tap(j12b, picker.getByTestId("matchup-picker-search"));
  await picker.getByTestId("matchup-picker-search").fill("darius");
  await tap(j12b, picker.getByTestId("matchup-picker-grid").locator('button[data-champion="Darius"]'));
  await expect(p.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  await expect(p.getByTestId("matchup-enemy-abilities")).toBeInViewport();
  expect(j12b, "J12, a champion by name").toEqual({ taps: 3, scrolls: 0, scrollBacks: 0 });

  // J14 (PLAN S8a): a row of Players opens the teammate's Peek, its close returns to the list unmoved.
  const j14: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
  await p.goto("/players");
  const rows = p.locator("[data-testid=player-peek-open]");
  await expect(rows.nth(3)).toBeVisible();
  await rows.nth(3).scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, 40));
  const y14 = await p.evaluate(() => window.scrollY);
  expect(y14, "J14: the list is scrolled, so a jump would show").toBeGreaterThan(0);
  const box = (await rows.nth(3).boundingBox())!;
  // Off the name (the profile's link): the row's own press.
  await tap(j14, rows.nth(3), { x: box.width - 24, y: box.height / 2 });
  const peek = p.locator("dialog[open][data-testid=player-peek]");
  await expect(peek.getByTestId("player-detail-hero")).toBeVisible();
  await tap(j14, peek.getByTestId("player-peek-close"));
  await expect(peek).toHaveCount(0);
  await expect(p).toHaveURL(/\/players$/);
  expect(Math.abs((await p.evaluate(() => window.scrollY)) - y14), "J14: the list did not move").toBeLessThanOrEqual(1);
  expect(j14, "J14").toEqual({ taps: 2, scrolls: 0, scrollBacks: 0 });
  // The close took its history entry back: Back now leaves Players, never reopening the Peek.
  await p.goBack();
  await expect(p).toHaveURL(/\/resources\/matchups/);
  await expect(peek).toHaveCount(0);

  // J15 (PLAN S9a): in Admin Mode, a person far down the list and the view's close: the list's scroll kept.
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  const j15: Count = { taps: 0, scrolls: 0, scrollBacks: 0 };
  await p.goto("/admin/people");
  const people = p.locator("[data-testid=admin-player-row],[data-testid=admin-user-row],[data-testid=admin-kept-row]");
  await expect(people.last()).toBeVisible();
  await people.last().scrollIntoViewIfNeeded();
  const y15 = await p.evaluate(() => window.scrollY);
  expect(y15, "J15: the list is taller than the screen").toBeGreaterThan(0);
  const view = p.getByTestId("person-view");
  // A tap before the page's code has run does nothing: tapped again until the view opens, counted once.
  await expect(async () => {
    if (!(await view.isVisible())) await people.last().tap({ timeout: 2_000 });
    await expect(view).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  j15.taps++;
  await expect(p).toHaveURL(/[?&]person=/);
  await tap(j15, view.getByTestId("person-view-close"));
  await expect(view).toBeHidden();
  await expect(p).not.toHaveURL(/person=/);
  await expect.poll(() => p.evaluate(() => window.scrollY), { message: "J15: the list's scroll kept" }).toBeGreaterThan(y15 - 2);
  expect(j15, "J15").toEqual({ taps: 2, scrolls: 0, scrollBacks: 0 });
  // The close took its entry back: Back leaves Admin's people for the page before (J14's Back led to Matchup Intel).
  await p.goBack();
  await expect(p).toHaveURL(/\/resources\/matchups/);
  await context.close();
});
