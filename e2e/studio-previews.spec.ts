import { expect, test, type Browser, type Locator, type Page } from "./test";
import { openStudioFromHeader, previewFrame, section, showPreview, type PreviewContext } from "./studio";

/*
  EVERY CARD STUDIO PREVIEW IS THE PAGE. Each preview draws the page's own component (studio-preview.tsx);
  this checks the result against the page itself, for a player with a look that is not the standard
  one (a preset, a tagline and an emblem, and a position of its own for the phone's header): the
  shown element's size, the artwork's box, its position and zoom as the browser computes them, the
  picture's box, the name's size and place, and the shades over the art, at the same screen size
  (desktop: this 1440 × 900 window; mobile: 390 × 844). And the previews download nothing the pages
  would not: one picture of the artwork for the place shown, and no request to the server.
*/

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** What the comparison reads of a shown element, relative to its own box (CSS pixels, rounded). */
function geometry(root: Element) {
  const r = root.getBoundingClientRect();
  // Whole pixels, from values first taken to 1/100px: inside the preview's frame a box's edges carry
  // float noise (a top of 178.99998 for 179), which turned a 22.5px name into 22 against the page's 23.
  const round = (v: number) => Math.round(Math.round(v * 100) / 100);
  const q = (s: string) => root.querySelector(s);
  const box = (e: Element | null) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    // Not drawn (a phone's Players row leaves its art strip out of the layout).
    if (!b.width && !b.height) return null;
    return { x: round(b.left - r.left), y: round(b.top - r.top), w: round(b.width), h: round(b.height) };
  };
  const img = q("[data-art-layer] img, [data-row-art] img") as HTMLImageElement | null;
  const name = q("[data-testid=card-name]");
  const cs = img ? getComputedStyle(img) : null;
  return {
    w: round(r.width),
    h: round(r.height),
    art: box(q("[data-art-layer], [data-row-art]")),
    position: cs?.objectPosition ?? null,
    transform: cs?.transform ?? null,
    place: img?.getAttribute("data-place") ?? null,
    picture: box(q("[data-avatar-frame]")),
    name: box(name),
    nameSize: name ? getComputedStyle(name).fontSize : null,
    nameStyle: name?.getAttribute("data-name-style") ?? null,
    emblem: q("[data-testid=card-emblem]")?.getAttribute("data-emblem") ?? null,
    tagline: q("[data-testid=card-tagline]")?.textContent ?? null,
    shades: [...root.querySelectorAll("[data-testid=card-foot-scrim], [data-testid=card-side-scrim], [data-testid=card-motif]")].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.getAttribute("data-testid")),
    // The Peek's one line of ranked progress over 30 days (Team's data has it; a Studio opened from the profile does not).
    rankLine: (() => {
      const line = q("[data-testid=detail-rank-change]");
      return line ? round(line.getBoundingClientRect().height) : 0;
    })(),
  };
}

/** Once the page is interactive and its cards have finished rising into place. */
async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
  });
}

const SCREENS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

/** The shown element on its page, at the screen's size: a page of its own (a second browser window). */
async function onPage(browser: Browser, baseURL: string, ctx: PreviewContext, device: keyof typeof SCREENS, id: string, name: string): Promise<ReturnType<typeof geometry>> {
  const context = await browser.newContext({ viewport: SCREENS[device], isMobile: device === "mobile", hasTouch: device === "mobile" });
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL }]);
  const page = await context.newPage();
  let root: Locator;
  if (ctx === "header") {
    await page.goto(`/players/${id}`);
    root = page.getByTestId("profile-header");
  } else if (ctx === "team" || ctx === "public") {
    await page.goto(ctx === "team" ? "/team" : "/public");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    root = page.locator(`[data-testid^=lineup-row-][data-player-id="${id}"]`);
    // The public page's data is reused for up to a minute (server/public/team.ts): until it shows the saved look.
    if (ctx === "public")
      await expect(async () => {
        await page.reload();
        await expect(root.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”", { timeout: 1_000 });
      }).toPass({ timeout: 80_000, intervals: [5_000] });
  } else if (ctx === "players") {
    await page.goto("/players");
    root = page.locator("main [data-testid=player-card-item]").filter({ has: page.locator(`a[href='/players/${id}']`) });
  } else {
    await page.goto(`/players?player=${id}`);
    root = page.getByTestId("player-detail-hero");
  }
  await expect(root.first()).toBeVisible();
  await settled(page);
  void name;
  const g = await root.first().evaluate(geometry);
  await context.close();
  return g;
}

async function midProfile(page: Page): Promise<{ id: string; name: string }> {
  await page.goto("/team");
  const card = page.getByTestId("lineup-row-MID");
  const id = (await card.getAttribute("data-player-id"))!;
  const name = (await card.getAttribute("data-player-name"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  return { id, name };
}

test("each preview draws its place exactly as the page does, for a look of its own", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once: the desktop's Studio previews both screens");
  const { id, name } = await midProfile(page);
  // A look that is not the standard one, saved: a preset, a tagline and an emblem, and the phone's header its own position.
  await openStudioFromHeader(page);
  await page.getByTestId("preset-arcane").click();
  await section(page, "identity");
  await page.getByTestId("tagline-input").fill("Calm in the chaos");
  await page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=bolt]").click();
  await section(page, "artwork");
  await showPreview(page, "header", "mobile");
  await page.getByTestId("position-own").click();
  await page.getByRole("slider", { name: "Horizontal position" }).fill("30");
  await page.getByRole("slider", { name: "Vertical position" }).fill("60");
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  // The page has the saved look (its refresh after Save), which the Studio opens on.
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", "glow");
  await expect(page.getByTestId("profile-header").getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");

  const problems: string[] = [];
  await openStudioFromHeader(page);
  for (const ctx of ["header", "team", "players", "peek", "public"] as const) {
    for (const device of ["desktop", "mobile"] as const) {
      await showPreview(page, ctx, device);
      const frame = previewFrame(page);
      const root = ctx === "header" ? frame.getByTestId("profile-header") : ctx === "players" ? frame.getByTestId("roster-row-preview") : ctx === "peek" ? frame.getByTestId("player-detail-hero") : frame.locator("article[data-testid^=lineup-row-]");
      await expect(root).toBeVisible();
      await root.evaluate(() => document.fonts.ready);
      const preview = await root.evaluate(geometry);
      const real = await onPage(browser, baseURL!, ctx, device, id, name);
      // The Team card five across shares its row's height with its teammates (CardIdentity's align: their
      // names and taglines), which the one card of the preview cannot know: its own height is left out
      // there, everything else compared. The Peek's ranked line is Team's data alone: the page's hero is
      // taller by that line (and the art behind it), the rest the same.
      const extra = real.rankLine ? real.rankLine + 2 : 0;
      const { h: ph, art: pa, rankLine: _p, ...p } = preview;
      const { h: rh, art: ra, rankLine: _r, ...r } = real;
      expect.soft(p, `${ctx} on ${device}`).toEqual(r);
      expect.soft(pa && { ...pa, h: pa.h + (ctx === "peek" ? extra : 0) }, `${ctx} on ${device}: the artwork's box`).toEqual(ctx === "team" && device === "desktop" && pa && ra ? { ...ra, h: pa.h } : ra);
      if (!(ctx === "team" && device === "desktop") && Math.abs(ph + (ctx === "peek" ? extra : 0) - rh) > 1) problems.push(`${ctx} on ${device}: ${ph}px tall in the preview, ${rh}px on the page`);
    }
  }
  expect(problems).toEqual([]);
  // The phone's header uses its own position, the desktop's the shared one.
  await showPreview(page, "header", "mobile");
  expect(await previewFrame(page).getByTestId("profile-art").evaluate((img) => getComputedStyle(img).objectPosition)).toBe("30% 60%");
  await showPreview(page, "header", "desktop");
  expect(await previewFrame(page).getByTestId("profile-art").evaluate((img) => getComputedStyle(img).objectPosition)).not.toBe("30% 60%");
  await page.getByTestId("studio-cancel").click();

  // Back to the standard card (later tests share this roster).
  await openStudioFromHeader(page);
  await page.getByTestId("studio-reset-all").click();
  await section(page, "identity");
  await page.getByTestId("tagline-input").fill("");
  await page.getByRole("radiogroup", { name: "Emblem" }).getByRole("radio", { name: "None" }).click();
  await section(page, "artwork");
  for (const reset of await page.getByTestId("position-override-reset").all()) await reset.click();
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
});

test("the previews download nothing new: one artwork picture for the place shown, no request to the server", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
  await midProfile(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await openStudioFromHeader(page);
  await expect(previewFrame(page).getByTestId("profile-header")).toBeVisible();
  await page.waitForLoadState("networkidle");
  requests.length = 0;
  for (const ctx of ["header", "team", "players", "peek", "public"] as const) for (const device of ["desktop", "mobile"] as const) await showPreview(page, ctx, device);
  await page.waitForLoadState("networkidle");
  // The pictures the previews show are the pages' own addresses (the browser's cache has them after the first): a splash for the
  // header, the cards and the Peek, the small tile for a Players row. Nothing reaches the app's server.
  const own = requests.filter((u) => new URL(u).origin === new URL(page.url()).origin && !/\/_next\/static\//.test(u));
  expect(own, "no request to the server for a preview").toEqual([]);
  // Each kind of picture once (the chosen skin, and its champion's default only where that one fails), never a skin's thumbnail.
  const art = [...new Set(requests.filter((u) => /\/cdn\/img\/champion\//.test(u)).map((u) => u.replace(/^.*\/cdn\/img\/champion\//, "")))];
  const kinds = [...new Set(art.map((u) => u.split("/")[0]))].sort();
  expect(kinds.filter((k) => k !== "splash" && k !== "tiles"), `the artwork pictures: ${art.join(", ")}`).toEqual([]);
  expect(art.length, `the artwork pictures: ${art.join(", ")}`).toBeLessThanOrEqual(4);
  await page.getByTestId("studio-cancel").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
});
