import { expect, test, type Page } from "./test";

/*
  THE SAME PAGE ON EVERY DEVICE. The test browser normally shares the server's language, time zone
  and network, which hid three kinds of fault the modernisation audit found:
  - a date written in the browser's own language and time zone differs from the server's, so the
    page fails to hydrate (and a game played on a Sydney morning read as the day before);
  - an image host that cannot be reached (Riot's CDN, Community Dragon) left broken-image glyphs
    when it failed before the page was interactive;
  - invalid nesting (a list inside a paragraph) that the browser rearranges, so the page fails to
    hydrate.
  Every test here also fails on any uncaught page error (e2e/test.ts).
*/

const DATE = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/;
const US_DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/;

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** A teammate's profile address (the demo team's mid laner has ranked history). */
async function profileOf(page: Page, name = "Demo Mid"): Promise<string> {
  await settle(page, "/players");
  return (await page.locator(`main a[data-testid='player-card'][data-player-name='${name}']`).getAttribute("href"))!;
}

test.describe("a browser in another time zone and language", () => {
  test.use({ timezoneId: "America/Los_Angeles", locale: "de-DE" });

  test("every page hydrates as the server sent it, with dates in the installation's form", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "dates and hydration are the same at every size");
    const profile = await profileOf(page);
    for (const path of [profile, `${profile}/matches`, `${profile}/matches?view=encounters`, "/matches", "/leaderboards", "/clash", "/settings", "/admin/audit"]) await settle(page, path);
    // The installation's form ("16 Sep 2026", Sydney time), never the browser's or the US one.
    await settle(page, profile);
    await expect(page.getByTestId("ranked-tracking")).toContainText(DATE);
    await expect(page.getByTestId("ranked-progress")).not.toContainText(US_DATE);
    await settle(page, "/leaderboards");
    await expect(page.getByTestId("last-updated")).toContainText(DATE);
  });
});

test("Riot's image servers unreachable: every picture shows its stand-in, never a broken image", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop cover the layouts");
  await page.route(/ddragon\.leagueoflegends\.com|raw\.communitydragon\.org/, (route) => route.abort());
  const profile = await profileOf(page);
  for (const path of ["/team", profile, "/players", "/leaderboards", "/matches", `${profile}/matches`]) {
    await settle(page, path);
    const broken = await page.evaluate(() =>
      [...document.images]
        .filter((img) => {
          const r = img.getBoundingClientRect();
          const shown = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(img).visibility !== "hidden";
          return shown && img.complete && img.naturalWidth === 0;
        })
        .map((img) => img.currentSrc || img.src),
    );
    expect(broken, `broken images on ${path}`).toEqual([]);
  }
  // The rank crest falls back to the tier's dot.
  await settle(page, profile);
  await expect(page.getByTestId("profile-rank").getByTestId("rank-emblem")).toHaveJSProperty("tagName", "SPAN");
});

test("no page nests blocks where the browser would rearrange them", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "markup is the same at every size");
  for (const path of ["/team", await profileOf(page), "/players", "/settings", "/resources", "/clash", "/admin", "/admin/settings"]) {
    await settle(page, path);
    const bad = await page.evaluate(() => [...document.querySelectorAll("p ul, p ol, p div, p p, p section, p table, a a, button button, button a, a button")].slice(0, 5).map((el) => `${el.parentElement?.tagName} > ${el.tagName}: ${(el.textContent ?? "").trim().slice(0, 40)}`));
    expect(bad, `invalid nesting on ${path}`).toEqual([]);
  }
});

test("Team cards never cut a figure off", async ({ page }) => {
  await settle(page, "/team");
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("[data-testid=card-season] .truncate")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && el.scrollWidth > el.clientWidth + 1;
      })
      .map((el) => (el.textContent ?? "").trim()),
  );
  expect(cut).toEqual([]);
});

test("small controls are at least 24px, and finger-sized by touch", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the touch sizes are the phone's");
  // The Settings links are on every account (the Clash carousel's dots need a saved scout).
  await settle(page, "/settings");
  for (const link of await page.locator("main a[href='/overview'], main a[href='/overview/accounts']").all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  await settle(page, await profileOf(page));
  for (const tip of (await page.getByTestId("tier-quiet").all()).slice(0, 3)) {
    const box = (await tip.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});
