import { expect, test, type Locator, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  On a 320px phone, the narrowest docs/MOBILE.md supports, what a row is about wraps rather than
  being cut: a member's name beside their multikill in Team Matches, a resource's title, and the
  account the champion window's figures come from; and at a larger text size the pages are no wider
  than the phone. Demo data, in-memory only.
*/

test.beforeEach(async ({ context, baseURL, page }, info) => {
  test.skip(info.project.name !== "phone", "a 320px phone");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.setViewportSize({ width: 320, height: 568 });
});

/** Each element's text fits its own box: nothing is cut off or runs out past it. */
async function expectWhole(items: Locator, what: string) {
  await expect(items.first()).toBeVisible();
  const cut = await items.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.trim() ?? ""));
  expect(cut, `${what} cut at 320px`).toEqual([]);
}

/** Opens a champion's window, clicking again until the page is interactive (a click before hydration does nothing). */
async function openChampion(page: Page, button: Locator) {
  const win = page.getByTestId("champion-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await button.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("Team Matches: a member's name beside their multikill wraps rather than being cut", async ({ page }) => {
  await page.goto("/matches");
  const marked = page.getByTestId("together-member").filter({ has: page.locator("[data-testid='together-multikill']:visible") });
  await expectWhole(marked.locator("a[href^='/players/']"), "a member's name");
});

test("Resources: a title wraps rather than being cut", async ({ page }) => {
  // The Library's rows ask each site for its icon; a test asks none (resources.spec.ts).
  await page.route(/\/favicon\.ico$/, (route) => route.abort());
  await page.goto("/resources");
  await expectWhole(page.getByTestId("resource-title"), "a resource's title");
  await expect(page.getByTestId("resource-title").filter({ hasText: "League of Legends Wiki" })).toBeVisible();
});

test("the champion window: the account its figures come from wraps rather than being cut", async ({ page }) => {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  await openChampion(page, page.getByTestId("top-champion").first().getByTestId("open-champion"));
  await expectWhole(page.getByTestId("champion-detail-scope"), "the window's scope");
});

test("at 200% text on a 320px phone, Settings for a member with a player profile (its Social links too) is no wider than the phone, and no button spills its label", async ({ browser, page }) => {
  // A member with a profile sees Social links, which the local owner (no profile) does not.
  const member = await memberContext(browser, page, { width: 320, height: 568 }, { base: "Wide" });
  try {
    await member.page.goto("/settings");
    await expect(member.page.getByTestId("social-links-save")).toBeVisible();
    await member.page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await member.page.evaluate(() => document.fonts.ready);
    await expect.poll(() => member.page.evaluate(() => document.documentElement.scrollWidth), { message: "the page as wide as the phone" }).toBeLessThanOrEqual(320);
    const spilled = await member.page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button")].filter((b) => b.getBoundingClientRect().width > 0 && b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent?.trim() ?? ""));
    expect(spilled, "buttons whose label spills out of them").toEqual([]);
  } finally {
    await member.context.close();
  }
});

test("at 200% text on a 320px phone, Team Overview's header (Edit lineup included) is no wider than the phone", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-header")).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("[data-testid=team-header]")!.getBoundingClientRect().right)), { message: "the header's right edge" }).toBeLessThanOrEqual(320);
  const edit = page.getByTestId("edit-lineup");
  if (await edit.count()) {
    const box = (await edit.boundingBox())!;
    expect(box.x + box.width, "Edit lineup within the phone").toBeLessThanOrEqual(320.5);
  }
});

test("on a 320px phone, at 100%, 150% and 200% text, Leaderboards' Records is no wider than the phone, every record's words, holder, value and unit whole and inside their boxes, the holder at least 5rem", async ({ page }) => {
  // Each record's value was held beside its unit ("1,039" beside "damage/min"): the page was 374px
  // wide at 150% and about 500px at 200%. At 100% the holder keeps at least 5rem beside the figure,
  // whose unit wraps under the value (the damage record's holder was 68px before that floor); under a
  // 16rem book (150% and 200%) a record's row is one column, the holder across it, and the value and
  // unit wrap.
  await page.goto("/leaderboards?view=records");
  await expect(page.getByTestId("records")).toBeVisible();
  for (const root of [100, 150, 200]) {
    if (root !== 100) await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${root}%: the page as wide as the phone` }).toBeLessThanOrEqual(0);
    const wrong = await page.getByTestId("season-record").evaluateAll((rows) =>
      rows.flatMap((row) => {
        const id = row.getAttribute("data-record");
        const box = (el: Element) => el.getBoundingClientRect();
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const out: string[] = [];
        // Nothing cut, nothing past the row.
        for (const el of row.querySelectorAll<HTMLElement>("[data-testid=record-label], [data-testid=record-qualifier], [data-testid=record-value], [data-testid=record-unit], [data-testid=card-name]")) {
          if (box(el).right > box(row).right + 0.5 || el.scrollWidth > el.clientWidth + 1) out.push(`${id}: ${el.getAttribute("data-testid")} cut or past the row`);
        }
        // The holder's name inside the holder's box, the value and unit inside the figure's, and the
        // two boxes apart where they share a line.
        const holder = row.querySelector("[data-testid=record-holder]");
        const figure = row.querySelector("[data-testid=record-figure]");
        const inside = (el: Element | null, outer: DOMRect, what: string) => {
          if (el && (box(el).left < outer.left - 0.5 || box(el).right > outer.right + 0.5)) out.push(`${id}: ${what}`);
        };
        if (holder) {
          inside(holder.querySelector("[data-testid=card-name]"), box(holder), "the holder's name past its box");
          // The holder's floor: at least 5rem beside the figure (across the row under a 16rem book),
          // and its name on at most two lines, never a letter a line.
          if (box(holder).width < 5 * rem - 0.5) out.push(`${id}: the holder narrower than 5rem (${Math.round(box(holder).width)}px)`);
          const name = holder.querySelector<HTMLElement>("[data-testid=card-name]");
          if (name && Math.round(box(name).height / parseFloat(getComputedStyle(name).lineHeight)) > 2) out.push(`${id}: the holder's name on more than two lines`);
        }
        if (figure) {
          inside(figure.querySelector("[data-testid=record-value]"), box(figure), "the value past the figure's box");
          inside(figure.querySelector("[data-testid=record-unit]"), box(figure), "the unit past the figure's box");
        }
        if (holder && figure) {
          const [h, f] = [box(holder), box(figure)];
          if (h.top < f.bottom && f.top < h.bottom && h.right > f.left + 0.5) out.push(`${id}: the holder runs into the figure`);
        }
        return out;
      }),
    );
    expect(wrong, `${root}%`).toEqual([]);
  }
});
