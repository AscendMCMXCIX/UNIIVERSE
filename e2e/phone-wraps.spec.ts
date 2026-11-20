import { expect, test, type Locator } from "./test";
import { grantAdministrator, memberContext } from "./member-account";

/*
  On a 320px phone, the narrowest docs/MOBILE.md supports, what a row is about wraps rather than
  being cut: a member's name beside their multikill in Team Matches, a resource's title, and the
  account the champion window's figures come from; and at a larger text size the pages are no wider
  than the phone (Leaderboards' season records, Settings, every Admin Mode page), and a profile's header on
  320 and 375px phones cuts nothing and breaks no word. Demo data, in-memory only.
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

/**
 * A profile's header as drawn: text cut by a box that clips it (the header clips at its edge; an
 * ellipsis made on purpose is not a cut) and words of four letters or more broken across lines.
 * Labels and sizes only: the demo roster.
 */
const HEADER_FACTS = () => {
  const header = document.querySelector<HTMLElement>("[data-testid=profile-header]")!;
  const srOnly = (el: Element) => {
    for (let e: Element | null = el; e && e !== header; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
    }
    return false;
  };
  const cut: string[] = [];
  const broken: string[] = [];
  const walk = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? "";
    const parent = n.parentElement;
    if (!text.trim() || !parent || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((b) => b.width > 0.5 && b.height > 0.5);
    if (!rects.length) continue;
    const [left, right] = [Math.min(...rects.map((b) => b.left)), Math.max(...rects.map((b) => b.right))];
    for (let e: HTMLElement | null = parent; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (!/hidden|clip/.test(cs.overflowX)) continue;
      const box = e.getBoundingClientRect();
      const past = Math.max(right - (box.right - parseFloat(cs.borderRightWidth)), box.left + parseFloat(cs.borderLeftWidth) - left);
      if (past > 1 && cs.textOverflow !== "ellipsis" && getComputedStyle(parent).textOverflow !== "ellipsis") cut.push(`"${text.trim().slice(0, 24)}" by ${Math.round(past)}px`);
      break;
    }
    for (const m of text.matchAll(/[A-Za-z\u00C0-\u00FF']{4,}/g)) {
      const word = document.createRange();
      word.setStart(n, m.index!);
      word.setEnd(n, m.index! + m[0].length);
      const lines = new Set([...word.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top))).size;
      if (lines > 1) broken.push(`"${m[0]}" over ${lines} lines`);
    }
  }
  const name = header.querySelector("[data-testid=card-name]")!;
  return { cut, broken, name: name.textContent ?? "" };
};

test("at 150%, 175% and 200% text on 320px and 375px phones, a profile's header cuts nothing and keeps each word of the name whole, on the Overview and in the other sections' band", async ({ page }) => {
  // The lineup's five: the longest name word ("Support"), off roles and every lineup status. Before,
  // at 375px and 175% the rank ran 156px past the header's edge, the lineup status 12px, and "Demo"
  // broke as "De / mo" beside the picture and Customise (LARGE_TEXT in profile-header.tsx).
  await page.goto("/team");
  const profiles = await Promise.all((["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map(async (role) => `/players/${await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id")}`));
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [i, profile] of profiles.entries())
      for (const section of ["", "/champions"]) {
        // The band shows in the page only in a short window on a phone (upright it rides in the top bar, S2b).
        await page.setViewportSize({ width, height: section ? 400 : 800 });
        await page.goto(`${profile}${section}`);
        await expect(page.getByTestId("profile-header")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (const root of [150, 175, 200]) {
          await page.evaluate((r) => {
            document.documentElement.style.fontSize = `${r}%`;
          }, root);
          const where = `the lineup's ${i + 1} of 5, ${section ? "the band" : "the Overview"}, ${width}px at ${root}%`;
          await expect(async () => {
            const facts = await page.evaluate(HEADER_FACTS);
            expect(facts.cut, `${where}: text cut`).toEqual([]);
            expect(facts.broken, `${where}: words broken (${facts.name})`).toEqual([]);
          }).toPass({ timeout: 5_000 });
        }
      }
  }
});

test("with the browser's own text at twice its size on a 320px phone, a profile's header cuts nothing and keeps each word of the name whole", async ({ browser, baseURL }) => {
  // The reader's own setting scales the rem of the media queries too (Chromium's default font size),
  // not only of the page: the header follows its own width either way.
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
  await page.goto("/team");
  const profile = `/players/${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`;
  for (const section of ["", "/champions"]) {
    // The band shows in the page only in a short window on a phone (upright it rides in the top bar, S2b).
    await page.setViewportSize({ width: 320, height: section ? 400 : 800 });
    await page.goto(`${profile}${section}`);
    await expect(page.getByTestId("profile-header")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const facts = await page.evaluate(HEADER_FACTS);
    expect(facts.cut, `${section ? "the band" : "the Overview"}: text cut`).toEqual([]);
    expect(facts.broken, `${section ? "the band" : "the Overview"}: words broken`).toEqual([]);
  }
  await context.close();
});

test("on a 320px phone, at 100%, 150% and 200% text, Leaderboards' season records are no wider than the phone, every record's words, holder, value and unit whole and inside their boxes, the holder at least 5rem", async ({ page }) => {
  // Each record's value was held beside its unit ("1,039" beside "damage/min"): the page was 374px
  // wide at 150% and about 500px at 200%. At 100% the holder keeps at least 5rem beside the figure,
  // whose unit wraps under the value (the damage record's holder was 68px before that floor); under a
  // 16rem book (150% and 200%) a record's row is one column, the holder across it, and the value and
  // unit wrap.
  await page.goto("/leaderboards");
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

const ADMIN_PAGES = ["/admin", "/admin/people", "/admin/people/access", "/admin/people/privacy", "/admin/branding", "/admin/previews", "/admin/resources", "/admin/data", "/admin/system", "/admin/audit", "/admin/settings"];

test("at 200% and 150% text on 320, 375 and 393px phones, every Admin Mode page is no wider than the phone", async ({ page, context, baseURL }) => {
  // Its health cards, Branding's Reset colours and save bar, Previews' switches, Users & Permissions'
  // tabs and row buttons (Erase personal data among them), the access levels, the manager's row
  // buttons and the Data jobs: each wraps or breaks a long word inside its line (docs/RESPONSIVE.md).
  // The container queries that let some of them wrap switch at rem widths, so each phone falls on
  // its own side of them: every page is checked at each width.
  test.setTimeout(360_000);
  await page.route(/\/favicon\.ico$/, (route) => route.abort());
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    for (const width of [320, 375, 393]) {
      await page.setViewportSize({ width, height: 700 });
      for (const root of [200, 150]) {
        await page.evaluate((r) => (document.documentElement.style.fontSize = `${r}%`), root);
        await page.evaluate(() => document.fonts.ready);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${path} at ${root}% on ${width}px: as wide as the phone` }).toBeLessThanOrEqual(width);
      }
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    }
  }
});

test("at 200% and 150% text on 320, 375 and 393px phones, an administrator who is not the owner finds Settings no wider than the phone, the badge Administrator inside the card", async ({ browser, page: owner, baseURL }) => {
  // The longest role a badge says ("Administrator", one word): beside a phone's picture there is not
  // room for it at 200% text, so who you are moves under the picture where a larger text size leaves
  // the card under 11rem inside (AccountPicture). The demo owner's badge says "Owner".
  test.setTimeout(180_000);
  await owner.setViewportSize({ width: 1440, height: 900 });
  const member = await memberContext(browser, owner, undefined, { base: "Deputy" });
  try {
    // The owner grants administrator access in Users & Permissions (again until the page has hydrated).
    await owner.goto("/admin/people");
    await grantAdministrator(owner, member.username);
    // Their phone, in Admin Mode.
    const phone = await browser.newContext({ storageState: await member.context.storageState(), viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
    try {
      await phone.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
      const page = await phone.newPage();
      await page.goto("/admin/settings");
      const card = page.getByTestId("settings-account");
      const badge = card.getByTestId("settings-role");
      await expect(badge).toHaveText("Administrator");
      for (const width of [320, 375, 393]) {
        await page.setViewportSize({ width, height: 700 });
        for (const root of [200, 150]) {
          await page.evaluate((r) => (document.documentElement.style.fontSize = `${r}%`), root);
          await page.evaluate(() => document.fonts.ready);
          const where = `${root}% on ${width}px`;
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${where}: as wide as the phone` }).toBeLessThanOrEqual(width);
          const inside = (await card.boundingBox())!;
          const role = (await badge.boundingBox())!;
          expect(role.x + role.width, `${where}: the badge inside the card`).toBeLessThanOrEqual(inside.x + inside.width);
        }
        await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      }
    } finally {
      await phone.close();
    }
  } finally {
    await member.context.close();
  }
});

test("at 200% text on a 320px phone, Previews' page switch and the first sign-in's Back and Skip for now stay inside the phone", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "a phone's widths, set below");
  await page.setViewportSize({ width: 320, height: 640 });
  const rights = (selector: string) => page.locator(selector).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  const big = async () => {
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    await page.evaluate(() => document.fonts.ready);
  };
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/previews");
  await big();
  for (const r of await rights("[data-testid^=preview-screen-]")) expect(r, "a Previews page button").toBeLessThanOrEqual(320 - 8);
  await context.clearCookies({ name: "uniiverse_view" });
  await context.addCookies([{ name: "uniiverse_demo_viewer", value: "member", url: baseURL! }]);
  await page.goto("/welcome/personalise");
  await big();
  for (const r of await rights("[data-testid=personalise-back], [data-testid=personalise-done]")) expect(r, "Back and Skip for now").toBeLessThanOrEqual(320 - 8);
});
