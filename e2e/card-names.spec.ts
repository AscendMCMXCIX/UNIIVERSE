import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  A PLAYER'S NAME IS NEVER CUT OR COVERED ON THEIR CARD. Reported on production: a member's own Top
  card on Team Overview hid almost all of their name, while their profile showed it whole. That
  card carried everything a card can: "You", three social icons, an emblem, a tagline, and the
  Customise and turn controls. The shared identity block put the icons and "You" on the name's
  line, so on a card of the wrong width the name got a few pixels. This rebuilds that card for a
  real member and checks it on Team at five across, three across, a phone held either way and a
  small phone, then on Players, then with a long name in several scripts: the name whole, inside
  its card, and under nothing else on it.
*/

test.describe.configure({ timeout: 180_000 });

const ON_CARD = "[data-testid=card-social], [data-testid=flip-to-substitute], [data-testid=customise-card], [data-testid=assigned-role], [data-testid=card-fit] > *, [data-avatar-frame], [data-testid=card-you], [data-testid=card-tagline]";

/** The card's name: its text, whether it overflows its two lines, and what on the card overlaps it. */
async function nameOn(card: Locator) {
  await expect(card.getByTestId("card-name")).toBeVisible();
  return card.evaluate((el, selector) => {
    const name = el.querySelector<HTMLElement>("[data-testid=card-name]")!;
    const lines = [...name.getClientRects()];
    const covered = [...el.querySelectorAll<HTMLElement>(selector)]
      .filter((o) => !o.contains(name))
      .filter((o) => {
        const b = o.getBoundingClientRect();
        return b.width > 0 && lines.some((l) => Math.min(l.right, b.right) - Math.max(l.left, b.left) > 1 && Math.min(l.bottom, b.bottom) - Math.max(l.top, b.top) > 1);
      })
      .map((o) => o.dataset.testid ?? "avatar");
    const c = el.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(name).lineHeight);
    return {
      text: name.textContent ?? "",
      title: name.title,
      cut: name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1,
      lines: Math.round(n.height / lineHeight),
      inside: n.left >= c.left - 0.5 && n.right <= c.right + 0.5 && n.top >= c.top - 0.5 && n.bottom <= c.bottom + 0.5,
      covered,
    };
  }, ON_CARD);
}

async function teamCard(page: Page, role: string): Promise<Locator> {
  await page.goto("/team");
  // On a phone the cards are a track: bring this one into view first.
  const tab = page.getByTestId("lineup-pager").getByRole("tab", { name: new RegExp(`^${role === "TOP" ? "Top" : role}`) });
  if (await tab.isVisible()) await tab.click();
  const card = page.getByTestId(`lineup-row-${role}`);
  await expect(card).toBeInViewport();
  return card;
}

test("a member's own card shows their whole name, whatever else the card carries", async ({ browser, page: admin, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one member, checked at several sizes below");
  const { context, page, username } = await memberContext(browser, admin, undefined, { base: "ascend", role: "Top" });

  // Everything a card can carry: three links teammates see, a tagline, an emblem.
  await page.goto("/settings");
  const links = page.getByTestId("social-links-form");
  await links.getByLabel("YouTube", { exact: true }).fill("youtube.com/@AscendPlays");
  await links.getByLabel("Twitch", { exact: true }).fill("ascend_live");
  await links.getByLabel("Discord", { exact: true }).fill("ascend.oce");
  for (let i = 0; i < 3; i++) await links.getByLabel("Who can see it").nth(i).selectOption("team");
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await page.goto("/overview");
  await page.getByTestId("customise-card").first().click();
  await page.getByTestId("studio-step-identity").click();
  await page.getByTestId("tagline-input").fill("Top lane or no lane");
  await page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=star]").click();
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();

  // The admin makes them the Top starter; the role keeps its substitute, so the card can turn.
  await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await admin.goto("/team");
  const topBefore = await admin.getByTestId("lineup-row-TOP").getAttribute("data-player-name");
  await admin.getByTestId("edit-lineup").click();
  await admin.getByTestId("lineup-change-TOP").click();
  const sheet = admin.getByTestId("lineup-sheet-TOP");
  await sheet.locator(`[data-testid=lineup-option][data-player-name="${username}"]`).click();
  await sheet.getByTestId("lineup-sheet-save").click();
  await expect(sheet).toBeHidden();
  await expect(admin.getByTestId("lineup-row-TOP")).toHaveAttribute("data-player-name", username);

  try {
    const state = await context.storageState();
    const sizes: Array<[string, Parameters<typeof browser.newContext>[0]]> = [
      ["five across", { viewport: { width: 1440, height: 900 } }],
      ["five across, short window", { viewport: { width: 1366, height: 768 } }],
      ["three across", { viewport: { width: 1280, height: 800 } }],
      ["phone", { ...devices["iPhone 15"] }],
      ["small phone", { ...devices["iPhone SE"] }],
      ["phone sideways", { ...devices["iPhone 15 landscape"] }],
    ];
    for (const [label, options] of sizes) {
      const ctx = await browser.newContext({ ...options, storageState: state });
      const p = await ctx.newPage();
      const card = await teamCard(p, "TOP");
      // Their own card, with everything on it at once.
      await expect(card.getByTestId("card-you")).toBeVisible();
      await expect(card.getByTestId("customise-card")).toBeVisible();
      await expect(card.getByTestId("card-social").getByRole("link")).toHaveCount(2);
      await expect(card.getByTestId("card-social-discord")).toBeVisible();
      await expect(card.getByTestId("card-emblem")).toBeVisible();
      await expect(card.getByTestId("card-tagline")).toHaveText("“Top lane or no lane”");
      const name = await nameOn(card);
      expect(name.text, label).toBe(username);
      expect(name.cut, `${label}: the name is not cut`).toBe(false);
      expect(name.lines, `${label}: a short name takes one line`).toBe(1);
      expect(name.inside, `${label}: the name is inside its card`).toBe(true);
      expect(name.covered, `${label}: nothing covers the name`).toEqual([]);
      // The icons are on the card and never under its controls.
      const icons = (await card.getByTestId("card-social").boundingBox())!;
      const box = (await card.boundingBox())!;
      expect(icons.x >= box.x && icons.x + icons.width <= box.x + box.width + 0.5, `${label}: icons inside the card`).toBe(true);
      for (const control of [card.getByTestId("customise-card"), card.getByTestId("flip-to-substitute")]) {
        if (!(await control.count())) continue;
        const c = (await control.boundingBox())!;
        const overlap = Math.min(icons.x + icons.width, c.x + c.width) - Math.max(icons.x, c.x) > 1 && Math.min(icons.y + icons.height, c.y + c.height) - Math.max(icons.y, c.y) > 1;
        expect(overlap, `${label}: icons clear of the card's controls`).toBe(false);
      }
      await ctx.close();
    }

    // A teammate's view: the same card on Players, the name whole there too.
    await admin.goto("/players");
    const dir = admin.locator(`main [data-testid='player-card-item'][data-player-name="${username}"]`);
    const onPlayers = await nameOn(dir);
    expect(onPlayers.cut || !onPlayers.inside || onPlayers.covered.length > 0, "Players: the name is whole and uncovered").toBe(false);
    // The icons there are links of their own: using one never opens the profile.
    await expect(dir.getByTestId("card-social-youtube")).toHaveAttribute("href", "https://www.youtube.com/@AscendPlays");

    // A long name in several scripts takes two lines at most, whole or ending in an ellipsis with
    // the full name as its title, and never under anything.
    const long = "Ŝtëllàr Ŵïndwàlkér 星の守護者 ✦";
    await page.goto("/settings");
    const form = page.getByTestId("display-name-form");
    await form.getByLabel("Display name").fill(long);
    await form.getByRole("button", { name: "Save display name" }).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Display name changed." })).toBeVisible();
    for (const [label, options] of [["five across", { viewport: { width: 1440, height: 900 } }], ["small phone", { ...devices["iPhone SE"] }]] as const) {
      const ctx = await browser.newContext({ ...options, storageState: await context.storageState() });
      const p = await ctx.newPage();
      const name = await nameOn(await teamCard(p, "TOP"));
      expect(name.title, label).toBe(long);
      expect(name.lines, `${label}: two lines at most`).toBeLessThanOrEqual(2);
      expect(name.inside, `${label}: inside its card`).toBe(true);
      expect(name.covered, `${label}: nothing covers it`).toEqual([]);
      await ctx.close();
    }
  } finally {
    // Later tests share this demo roster: the Top starter goes back.
    await admin.goto("/team");
    if ((await admin.getByTestId("lineup-row-TOP").getAttribute("data-player-name")) !== topBefore && topBefore) {
      await admin.getByTestId("edit-lineup").click();
      await admin.getByTestId("lineup-change-TOP").click();
      const back = admin.getByTestId("lineup-sheet-TOP");
      await back.locator(`[data-testid=lineup-option][data-player-name="${topBefore}"]`).click();
      await back.getByTestId("lineup-sheet-save").click();
      await expect(admin.getByTestId("lineup-row-TOP")).toHaveAttribute("data-player-name", topBefore);
    }
    await context.close();
  }
});
