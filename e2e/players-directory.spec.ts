import { devices, expect, test, type Browser, type Page } from "./test";
import { choosePassword, createMember } from "./member-account";

/*
  THE PLAYERS DIRECTORY: ONE CARD STRUCTURE, EVERY CARD LEVEL. Reported: the cards looked good one
  by one, but their content sat at different heights from player to player (a tagline, a long name,
  a second badge or the links moved the rest), badges ran over the role on narrow cards, and the
  last portraits of a pool were cut off. The demo roster already holds most cases: players in and
  out of the lineup, without links, taglines or a picture, a pool of two, no roles at all, setup not
  finished. This adds the hardest card a member can make: a long name in wide capitals, a tagline,
  all three links, an emblem, a frame and a pool of twelve. Then, at desktop widths (four, three and
  two across), a tablet, a phone held sideways and two phones:
  - the directory has as many columns as its width holds at 17.5rem a card, up to four;
  - cards side by side are the same height, and their pictures, names, rank lines, pool headings
    and portraits are level, whatever each one has;
  - rows whose cards need no extra line are all the same height;
  - no part covers another or leaves its card, and nothing runs past the page's edge;
  - a pool shows its first portraits whole, as many as fit, and counts the rest: never "+1", never
    a portrait cut, and no room left for one more;
  - every link icon is the same size, on its picture's line.
*/

test.describe.configure({ timeout: 420_000 });
test.use({ actionTimeout: 30_000 });

const MEMBER = { base: "Storm", display: "Stormbringer of the Northern Sky", tagline: "Fortune favours the bold and the warded", emblem: "bolt", nameStyle: "wide", frame: "premium", pool: 12 };

/** A Top player with everything a directory card can carry, set up as a member would. */
async function makeMember(browser: Browser, admin: Page, who: typeof MEMBER) {
  const { username, temporary } = await createMember(admin, who.base);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);
  const setup = page.getByTestId("setup-form");
  await setup.getByTestId("setup-display-name").fill(who.display);
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: "Top" }).click();
  // The search stays open after each pick, and a champion picked leaves the list.
  await setup.getByTestId("primary-pool-toggle").click();
  const results = setup.getByTestId("primary-pool-results");
  for (let i = 0; i < who.pool; i++) {
    const first = results.getByRole("option").first();
    const id = (await first.getAttribute("data-champion"))!;
    await first.click();
    await expect(results.locator(`[data-champion="${id}"]`)).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  await page.getByTestId("personalise-done").click();
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(who.display);
  await page.goto("/settings");
  const links = page.getByTestId("social-links-form");
  // Settings is drawn on the server: type the first link until the hydrated form has taken it.
  await expect(async () => {
    await links.getByLabel("YouTube", { exact: true }).fill(`youtube.com/@${who.base}Plays`);
    await expect(page.getByTestId("social-links-save")).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await links.getByLabel("Twitch", { exact: true }).fill(`${who.base.toLowerCase()}_live`);
  await links.getByLabel("Discord", { exact: true }).fill(`${who.base.toLowerCase()}.oce`);
  for (const kind of ["youtube", "twitch", "discord"]) await links.getByTestId(`social-public-${kind}`).click();
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await page.goto("/overview");
  await page.getByTestId("customise-card").first().click();
  const studio = page.getByTestId("card-studio");
  await studio.locator(`[role=radio][data-value="${who.frame}"]`).first().click();
  await page.getByTestId("studio-step-identity").click();
  await page.getByTestId("tagline-input").fill(who.tagline);
  await page.getByRole("radiogroup", { name: "Emblem" }).locator(`[data-value=${who.emblem}]`).click();
  await page.getByRole("radiogroup", { name: "Name style" }).locator(`[data-value=${who.nameStyle}]`).click();
  await page.getByTestId("save-card-style").click();
  await expect(studio).toBeHidden();
  await context.close();
}

const SIZES: Array<[string, Parameters<Browser["newContext"]>[0]]> = [
  ["1920", { viewport: { width: 1920, height: 1080 } }],
  ["1440", { viewport: { width: 1440, height: 900 } }],
  ["1280", { viewport: { width: 1280, height: 800 } }],
  ["1024", { viewport: { width: 1024, height: 768 } }],
  ["tablet-768", { viewport: { width: 768, height: 1024 }, hasTouch: true }],
  ["landscape-844", { ...devices["iPhone 15 landscape"] }],
  ["phone-393", { ...devices["iPhone 15"] }],
  ["phone-320", { ...devices["iPhone SE"] }],
];

/** Every card in the directory, measured against its own edges: where each part sits, what overlaps, and its pool. */
async function measure(page: Page) {
  return page.getByTestId("players-directory").evaluate((grid) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const shown = (el: Element | null): el is HTMLElement => !!el && box(el).width > 0 && getComputedStyle(el).display !== "none";
    const cards = [...grid.querySelectorAll<HTMLElement>("[data-testid=player-card-item]")].map((card) => {
      const c = box(card);
      const style = getComputedStyle(card);
      const inner = { left: c.left + parseFloat(style.borderLeftWidth), right: c.right - parseFloat(style.borderRightWidth) };
      const one = (selector: string) => {
        const el = card.querySelector(selector);
        return shown(el) ? box(el) : null;
      };
      const chip = one("[data-testid=assigned-role]")!;
      const badges = [...card.querySelectorAll("[data-testid=setup-incomplete], [data-testid=directory-lineup]")].filter(shown).map(box);
      const avatar = one("[data-avatar-frame]")!;
      const lines = (selector: string) => {
        const el = card.querySelector<HTMLElement>(selector);
        return shown(el) ? Math.round(box(el).height / parseFloat(getComputedStyle(el).lineHeight)) : 0;
      };
      const pool = card.querySelector<HTMLElement>("[data-testid=directory-pool]");
      const portraits = pool ? [...pool.querySelectorAll("[data-testid=pool-portrait]")].filter(shown).map(box) : [];
      const counts = pool ? [...pool.querySelectorAll<HTMLElement>("[data-testid=directory-pool-more]")].filter(shown) : [];
      const last = counts[0] ? box(counts[0]) : portraits.at(-1);
      const parts: Array<[string, DOMRect | null]> = [
        ["role", chip],
        ...badges.map((b): [string, DOMRect] => ["badge", b]),
        ["picture", avatar],
        ["links", one("[data-testid=card-social]")],
        ["name", one("[data-testid=card-name]")],
        ["labels", one("[data-testid=card-fit]")],
        ["tagline", one("[data-testid=card-tagline]")],
        ["pool heading", one("[data-testid=directory-primary-role], [data-testid=directory-no-roles]")],
        ...portraits.map((p): [string, DOMRect] => ["portrait", p]),
        ...counts.map((m): [string, DOMRect] => ["count", box(m)]),
      ];
      const placed = parts.filter((p): p is [string, DOMRect] => p[1] !== null);
      const overlaps: string[] = [];
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) {
          const [[n1, a], [n2, b]] = [placed[i]!, placed[j]!];
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${n1} × ${n2}`);
        }
      const outside = placed.filter(([, r]) => r.left < inner.left - 0.5 || r.right > inner.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5).map(([n]) => n);
      const at = (r: DOMRect | null) => (r ? r.top - c.top : null);
      const name = card.querySelector<HTMLElement>("[data-testid=card-name]")!;
      const tagline = card.querySelector<HTMLElement>("[data-testid=card-tagline]");
      return {
        player: card.dataset.playerName ?? "",
        frame: card.dataset.frame,
        top: c.top,
        left: c.left,
        width: c.width,
        height: c.height,
        level: { picture: avatar.top + avatar.height / 2 - c.top, name: at(one("[data-testid=card-name]")), labels: at(one("[data-testid=card-fit]")), heading: at(one("[data-testid=directory-primary-role], [data-testid=directory-no-roles]")), pool: at(pool && shown(pool) ? box(pool) : null) },
        extraLines: Math.max(0, lines("[data-testid=card-name]") - 1) + Math.max(0, lines("[data-testid=card-tagline]") - 1) + (badges.some((b) => b.top >= chip.bottom - 1) ? 1 : 0),
        nameText: name.textContent ?? "",
        nameCut: name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1,
        taglineText: tagline?.textContent ?? "",
        taglineCut: !!tagline && tagline.scrollHeight > tagline.clientHeight + 1,
        poolSize: Number(/(\d+) champions?/.exec(card.querySelector("[data-testid=directory-primary-role]")?.textContent ?? "")?.[1] ?? 0),
        portraits: portraits.length,
        inOrder: portraits.every((p, i) => i === 0 || p.left > portraits[i - 1]!.left),
        count: counts.map((m) => (m.textContent ?? "").replace(/ more champions$/, "")),
        roomLeft: pool && last ? box(pool).right - last.right : null,
        icons: [...card.querySelectorAll("[data-testid^=card-social-]")].filter(shown).map((el) => ({ size: Math.round(box(el).width * 2) / 2, offLine: Math.abs(box(el).top + box(el).height / 2 - (avatar.top + avatar.height / 2)) })),
        overlaps,
        outside,
      };
    });
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { rem, width: box(grid).width, gap: parseFloat(getComputedStyle(grid).columnGap), cards, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

const spread = (values: number[]) => (values.length > 1 ? Math.max(...values) - Math.min(...values) : 0);

test("Players: every card on the same regions, level with its neighbours, its pool whole, at every width", async ({ browser, page: admin, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one roster, checked at every size below");
  await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  // A retry runs on the same server, where the first attempt's member keeps the name.
  const who = info.retry ? { ...MEMBER, base: `${MEMBER.base}${info.retry}`, display: `${MEMBER.display.slice(0, 30)} ${info.retry}` } : MEMBER;
  await makeMember(browser, admin, who);
  // Creating the account switched the admin to Admin Mode: the directory is read in Player Mode.
  await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const state = await admin.context().storageState();
  for (const [size, options] of SIZES) {
    const ctx = await browser.newContext({ ...options, storageState: state });
    const page = await ctx.newPage();
    await page.goto("/players");
    await expect(page.locator(`main [data-testid=player-card-item][data-player-name="${who.display}"]`)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = await measure(page);
    expect(m.overflow, `${size}: nothing past the page's edge`).toBeLessThanOrEqual(1);

    // Columns from the directory's own width: 17.5rem a card at least, up to four.
    const columns = new Set(m.cards.map((c) => Math.round(c.left))).size;
    const fits = Math.floor((m.width + m.gap + 0.5) / (17.5 * m.rem + m.gap));
    expect(columns, `${size}: columns for a ${Math.round(m.width)}px directory`).toBe(Math.min(4, Math.max(1, fits)));
    if (columns > 1) for (const c of m.cards) expect(c.width, `${size}: ${c.player} is at least 17.5rem wide`).toBeGreaterThanOrEqual(17.5 * m.rem - 0.5);

    // Side by side: the same height, every region level.
    const rows = [...new Set(m.cards.map((c) => Math.round(c.top)))].map((top) => m.cards.filter((c) => Math.abs(c.top - top) <= 1));
    for (const row of rows.filter((r) => r.length > 1)) {
      const names = row.map((c) => c.player).join(", ");
      expect(spread(row.map((c) => c.height)), `${size}: ${names} are the same height`).toBeLessThanOrEqual(1);
      for (const key of ["picture", "name", "labels", "heading", "pool"] as const) {
        const tops = row.map((c) => c.level[key]).filter((v): v is number => v !== null);
        expect(spread(tops), `${size}: ${key} level along ${names}`).toBeLessThanOrEqual(1);
      }
    }
    // Rows without an extra line (a name, tagline or badge line) are all the same height.
    const plain = rows.filter((r) => r.every((c) => c.extraLines === 0)).map((r) => r[0]!.height);
    expect(spread(plain), `${size}: rows without extra lines share one height`).toBeLessThanOrEqual(1);

    for (const c of m.cards) {
      const label = `${size}, ${c.player}`;
      expect(c.overlaps, `${label}: nothing covers anything else`).toEqual([]);
      expect(c.outside, `${label}: every part inside the card`).toEqual([]);
      expect(c.nameCut, `${label}: the name is whole`).toBe(false);
      expect(c.taglineCut, `${label}: the tagline is whole`).toBe(false);
      for (const icon of c.icons) expect(icon.offLine, `${label}: links on the picture's line`).toBeLessThanOrEqual(1);
      if (!c.poolSize) continue;
      // The first portraits, whole and in order, then the rest counted: never +1, no room for one more.
      expect(c.inOrder, `${label}: portraits in the pool's order`).toBe(true);
      expect(c.portraits, `${label}: at least one portrait`).toBeGreaterThan(0);
      if (c.portraits < c.poolSize) {
        expect(c.count, `${label}: the rest counted`).toEqual([`+${c.poolSize - c.portraits}`]);
        expect(c.poolSize - c.portraits, `${label}: never +1`).toBeGreaterThan(1);
        expect(c.roomLeft!, `${label}: no room for one more portrait`).toBeLessThan(2.5 * m.rem);
      } else expect(c.count, `${label}: a whole pool has no count`).toEqual([]);
    }
    // One icon size everywhere.
    expect(spread(m.cards.flatMap((c) => c.icons.map((i) => i.size))), `${size}: every link icon the same size`).toBeLessThanOrEqual(0.5);

    // The member's own card keeps everything they chose.
    const mine = m.cards.find((c) => c.player === who.display)!;
    expect(mine.frame, `${size}: their frame`).toBe(who.frame);
    expect(mine.nameText, `${size}: their name, whole`).toBe(who.display);
    expect(mine.taglineText, `${size}: their tagline, whole`).toBe(`“${who.tagline}”`);
    expect(mine.icons.length, `${size}: their three links`).toBe(3);
    expect(mine.poolSize, `${size}: their pool's size`).toBe(who.pool);
    await ctx.close();
  }
});
