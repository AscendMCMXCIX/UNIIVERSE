import { devices, expect, test, type Browser, type Page } from "./test";
import { lineupAtRest, offCentre, showLineupCard, swipe } from "./lineup";

/*
  Team Overview's phone lineup as a carousel (the owner's request of 23 Nov 2026): no row of the
  players over the cards (the lineup pager went), one card at a time across the page's width inside
  its gutter, no neighbouring card in view at rest, a carousel that loops (past the last card comes
  the first, before the first the last) with nothing moving visibly when it wraps, five position dots
  under the card that say where you are and move to any card, ← → on the keyboard, the position said
  to screen readers, reduced motion honoured, and 200% text on a 320px phone. Tablets, desktops and a
  phone held sideways keep their grid: no dots, no loop. The demo's lineup is full (five starters,
  Top and Support with a substitute).
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

/** The carousel as drawn: the card in view by its dot, each card's edges, the dots' place. */
function view(page: Page) {
  return page.evaluate(() => {
    const track = document.querySelector("[data-testid=lineup-overview]")!;
    const dots = [...document.querySelectorAll<HTMLElement>("[data-testid=lineup-indicator-dot]")];
    const selected = dots.findIndex((d) => d.getAttribute("aria-selected") === "true");
    const rect = (e: Element) => e.getBoundingClientRect();
    return {
      width: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      selected,
      track: { scrolls: track.scrollWidth > track.clientWidth + 1 },
      cards: [...track.querySelectorAll<HTMLElement>(":scope > [data-testid=lineup-cell]")].map((c) => ({ role: c.querySelector<HTMLElement>("[data-testid^=lineup-row-]")!.dataset.testid!.slice(11), left: rect(c).left, right: rect(c).right, bottom: rect(c).bottom })),
      dots: dots.map((d) => ({ width: rect(d).width, height: rect(d).height, top: rect(d).top, left: rect(d).left, right: rect(d).right, tabIndex: d.tabIndex })),
      gutter: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
}

/** One card in view, centred inside the gutter, no other card's pixel on screen, the dots under it and every target 44px. */
function expectOneCard(v: Awaited<ReturnType<typeof view>>, role: string, at: string) {
  expect(v.track.scrolls, `${at}: the carousel scrolls sideways`).toBe(true);
  expect(v.overflow, `${at}: the page itself does not`).toBeLessThanOrEqual(1);
  const shown = v.cards.filter((c) => c.right > 0.5 && c.left < v.width - 0.5);
  expect(shown.map((c) => c.role), `${at}: only the ${role} card on screen`).toEqual([role]);
  const card = shown[0]!;
  // The page's gutter (1rem, or the card stops at 26rem and centres on a wider window) on both sides.
  const left = card.left;
  const right = v.width - card.right;
  expect(Math.abs(left - right), `${at}: centred (${left} | ${right})`).toBeLessThanOrEqual(1);
  if (v.width - 2 * v.gutter <= 26 * v.gutter) expect(Math.abs(left - v.gutter), `${at}: the page's gutter, ${left}px`).toBeLessThanOrEqual(1);
  expect(v.dots, `${at}: five dots`).toHaveLength(5);
  expect(v.selected, `${at}: the ${role} dot marked`).toBe(ROLES.indexOf(role));
  for (const d of v.dots) {
    expect(Math.min(d.width, d.height), `${at}: a dot's target`).toBeGreaterThanOrEqual(44);
    expect(d.top, `${at}: the dots under the card`).toBeGreaterThanOrEqual(card.bottom - 1);
    expect(d.left >= -0.5 && d.right <= v.width + 0.5, `${at}: every dot on screen`).toBe(true);
  }
  expect(v.dots.filter((d) => d.tabIndex === 0), `${at}: one tab stop for the dots`).toHaveLength(1);
}

async function phoneContext(browser: Browser, baseURL: string, options: Parameters<Browser["newContext"]>[0]) {
  const ctx = await browser.newContext(options);
  await ctx.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL }]);
  return { ctx, page: await ctx.newPage() };
}

/** The Top card's x in every frame from now for `ms`, while `act` runs. */
async function framesOf(page: Page, role: string, ms: number, act: () => Promise<void>) {
  const sampled = page.evaluate(
    ([r, length]) =>
      new Promise<number[]>((resolve) => {
        const card = document.querySelector(`[data-testid=lineup-row-${r}]`)!;
        const xs: number[] = [];
        const t0 = performance.now();
        const tick = () => {
          xs.push(card.getBoundingClientRect().left);
          if (performance.now() - t0 < (length as number)) requestAnimationFrame(tick);
          else resolve(xs);
        };
        requestAnimationFrame(tick);
      }),
    [role, ms] as const,
  );
  await act();
  return sampled;
}

test.describe("phones", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "the phone's carousel"));

  test("no player row over the cards; one card across the width at 320, 360, 375, 390 and 430px and on an iPhone and a Pixel, no neighbour in view", async ({ page, browser, baseURL }) => {
    for (const [width, height] of [[320, 568], [360, 780], [375, 667], [390, 844], [430, 932]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/team");
      await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
      await lineupAtRest(page);
      // The lineup pager (each player's picture, role and name over the cards) is gone.
      await expect(page.getByTestId("lineup-pager")).toHaveCount(0);
      await expect(page.locator("[data-testid=lineup-dot], [data-testid=lineup-dot-picture]")).toHaveCount(0);
      await expect(page.getByTestId("lineup-indicator")).toBeVisible();
      expectOneCard(await view(page), "TOP", `${width} × ${height}`);
      // The next card the same, once moved to.
      await showLineupCard(page, "MID");
      expectOneCard(await view(page), "MID", `${width} × ${height}, Mid`);
    }
    for (const name of ["iPhone 15", "Pixel 7", "iPhone SE"] as const) {
      const { defaultBrowserType: _, ...device } = devices[name];
      const { ctx, page: p } = await phoneContext(browser, baseURL!, device);
      await p.goto("/team");
      await expect(p.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
      await lineupAtRest(p);
      await expect(p.getByTestId("lineup-pager")).toHaveCount(0);
      expectOneCard(await view(p), "TOP", name);
      await ctx.close();
    }
  });

  test("a swipe moves to the next or previous card, and the carousel loops both ways with nothing moving visibly as it wraps", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    const cdp = await context.newCDPSession(page);
    const track = (await page.getByTestId("lineup-overview").boundingBox())!;
    const y = Math.round(track.y + 140);
    const left = () => swipe(page, cdp, { x: 330, y }, { x: 80, y });
    const right = () => swipe(page, cdp, { x: 80, y }, { x: 330, y });
    const dots = page.getByTestId("lineup-indicator-dot");
    const at = async (role: string) => {
      await expect(dots.nth(ROLES.indexOf(role))).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => offCentre(page.getByTestId(`lineup-row-${role}`))).toBeLessThanOrEqual(0.5);
    };
    // Through the lineup in order: Jungle, Mid, Bottom, Support; the position said each time it comes to rest.
    for (const role of ["JUNGLE", "MID", "ADC", "SUPPORT"]) {
      await left();
      await at(role);
    }
    await expect(page.getByTestId("lineup-announcer")).toHaveText("Support, 5 of 5: Demo Support");
    expectOneCard(await view(page), "SUPPORT", "Support");

    // Past the last card, the first: Top comes in from the right in one movement and stays put as
    // the carousel wraps behind it (its x never turns back, and is still once at rest).
    const inbound = await framesOf(page, "TOP", 1600, left);
    await at("TOP");
    const v = await view(page);
    const gutter = v.cards.find((c) => c.role === "TOP")!.left;
    for (let i = 1; i < inbound.length; i++) expect(inbound[i]!, `frame ${i}: Top moves one way only (${inbound.slice(Math.max(0, i - 2), i + 2).join(", ")})`).toBeLessThanOrEqual(inbound[i - 1]! + 0.5);
    expect(inbound[0]!, "Top started off screen to the right").toBeGreaterThanOrEqual(v.width - 1);
    expect(inbound.at(-1)!).toBeCloseTo(gutter, 0);
    // The wrap happened: Top is the middle of the loop again (two cards ready on either side).
    expect(await page.getByTestId("lineup-cell").first().evaluate((c) => getComputedStyle(c).order)).toBe("2");
    const still = await framesOf(page, "TOP", 500, async () => {});
    expect(Math.max(...still) - Math.min(...still), "at rest after the wrap").toBeLessThanOrEqual(0.5);
    await expect(page.getByTestId("lineup-announcer")).toHaveText("Top, 1 of 5: Demo Top");

    // Before the first card, the last: Support comes in from the left the same way.
    const back = await framesOf(page, "SUPPORT", 1600, right);
    await at("SUPPORT");
    for (let i = 1; i < back.length; i++) expect(back[i]!, `frame ${i}: Support moves one way only`).toBeGreaterThanOrEqual(back[i - 1]! - 0.5);
    expect(back[0]!, "Support started off screen to the left").toBeLessThanOrEqual(-gutter);
    await right();
    await at("ADC");
    expectOneCard(await view(page), "ADC", "Bottom, back from the wrap");
  });

  test("a mostly vertical drag on a card scrolls the page, not the carousel", async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(room, "the page is taller than a 320 × 568 phone").toBeGreaterThan(60);
    const cdp = await context.newCDPSession(page);
    const card = (await page.getByTestId("lineup-row-TOP").boundingBox())!;
    const x = Math.round(card.x + card.width / 2);
    const from = Math.round(Math.min(card.y + card.height - 20, 520));
    // A little sideways drift, as a thumb does.
    await swipe(page, cdp, { x, y: from }, { x: x + 18, y: from - 220 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(Math.min(60, room) - 1);
    await page.waitForTimeout(400);
    expect(await offCentre(page.getByTestId("lineup-row-TOP")), "the carousel stayed on Top").toBeLessThanOrEqual(1);
    await expect(page.getByTestId("lineup-indicator-dot").first()).toHaveAttribute("aria-selected", "true");
  });

  test("the dots move the carousel and say where it is; the keyboard moves it with ← → from a card or the dots, wrapping, focus following", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    const indicator = page.getByTestId("lineup-indicator");
    const dots = indicator.getByRole("tab");
    // A tablist named for what it is; each dot the role then the player, controlling its card's slide.
    await expect(indicator).toHaveAttribute("aria-label", "Lineup position");
    await expect(dots).toHaveCount(5);
    await expect(dots.first()).toHaveAccessibleName("Top: Demo Top");
    await expect(dots.nth(3)).toHaveAccessibleName("Bottom: Demo ADC");
    for (let i = 0; i < 5; i++) {
      const slide = await dots.nth(i).getAttribute("aria-controls");
      await expect(page.locator(`[id="${slide}"]`)).toHaveAttribute("aria-label", new RegExp(`\\(${i + 1} of 5\\)$`));
    }
    // A dot's tap: the shortest way round (Support is one card before Top).
    await showLineupCard(page, "SUPPORT");
    // The focused dot says where the carousel is itself: the announcer stays quiet (it speaks after a swipe or a card's ← →).
    await expect(dots.nth(4)).toBeFocused();
    await expect(page.getByTestId("lineup-announcer")).not.toHaveText(/Support/);
    await showLineupCard(page, "JUNGLE");

    // The dots as tabs: ← → move and wrap, Home and End, focus following, one tab stop.
    await dots.nth(1).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(dots.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(dots.nth(4)).toBeFocused();
    await expect(dots.nth(4)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-SUPPORT"))).toBeLessThanOrEqual(0.5);
    await page.keyboard.press("ArrowRight");
    await expect(dots.nth(0)).toBeFocused();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-TOP"))).toBeLessThanOrEqual(0.5);
    await page.keyboard.press("End");
    await expect(dots.nth(4)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(dots.nth(0)).toBeFocused();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-TOP"))).toBeLessThanOrEqual(0.5);
    await expect(dots.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(dots.nth(2)).toHaveAttribute("tabindex", "-1");

    // From a card: → to the next card, ← back and round to the last; focus moves to the card shown.
    const open = (role: string) => page.getByTestId(`lineup-row-${role}`).getByTestId("open-player-detail");
    await open("TOP").focus();
    await page.keyboard.press("ArrowRight");
    await expect(open("JUNGLE")).toBeFocused();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-JUNGLE"))).toBeLessThanOrEqual(0.5);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(open("SUPPORT")).toBeFocused();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-SUPPORT"))).toBeLessThanOrEqual(0.5);
    expectOneCard(await view(page), "SUPPORT", "after the keys");
    await expect(page.getByTestId("lineup-announcer")).toHaveText("Support, 5 of 5: Demo Support");
    // Quick presses each count: three → from Support land on Mid.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(open("MID")).toBeFocused();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-MID"))).toBeLessThanOrEqual(0.5);
    expectOneCard(await view(page), "MID", "after quick presses");
  });

  test("Edit lineup works on any card of the carousel, and its sheet keeps its arrow keys; a turned card stays turned while the carousel moves", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    // Turn Top over to its substitute, move away and back: the same card, still turned (each card exists once).
    await page.getByTestId("lineup-row-TOP").getByTestId("flip-to-substitute").click();
    await expect(page.getByTestId("lineup-card-TOP")).toHaveAttribute("data-flipped", "true");
    await showLineupCard(page, "JUNGLE");
    await showLineupCard(page, "TOP");
    await expect(page.getByTestId("lineup-card-TOP")).toHaveAttribute("data-flipped", "true");
    await page.getByTestId("lineup-sub-TOP").getByTestId("flip-back").click();
    await expect(page.getByTestId("lineup-card-TOP")).not.toHaveAttribute("data-flipped", "true");

    await page.getByTestId("edit-lineup").click();
    await showLineupCard(page, "MID");
    await page.getByTestId("lineup-change-MID").click();
    const sheet = page.getByTestId("lineup-sheet-MID");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("lineup-option").first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await sheet.getByTestId("lineup-sheet-cancel").click();
    await expect(sheet).toBeHidden();
    // The carousel stayed on Mid.
    await expect(page.getByTestId("lineup-indicator-dot").nth(2)).toHaveAttribute("aria-selected", "true");
    expect(await offCentre(page.getByTestId("lineup-row-MID"))).toBeLessThanOrEqual(1);
    await page.getByTestId("edit-lineup").click();
  });

  test("the player window's ‹ › move the carousel behind it to that card", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    const panel = page.getByTestId("player-detail");
    await expect(async () => {
      if (!(await panel.isVisible())) await page.getByTestId("lineup-row-ADC").getByTestId("open-player-detail").click({ timeout: 2_000 });
      await expect(panel).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-ADC"))).toBeLessThanOrEqual(0.5);
    await page.getByTestId("detail-next").click();
    await expect(page).toHaveURL(new RegExp(`player=${await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id")}`));
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-SUPPORT"))).toBeLessThanOrEqual(0.5);
    await expect(page.getByTestId("lineup-indicator-dot").nth(4)).toHaveAttribute("aria-selected", "true");
    // The window says who it shows: the carousel behind it says nothing (once at rest, after 140ms at most).
    await page.waitForTimeout(400);
    await expect(page.getByTestId("lineup-announcer")).toHaveText("");
    await page.getByTestId("detail-prev").click();
    await page.getByTestId("detail-prev").click();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-MID"))).toBeLessThanOrEqual(0.5);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    expectOneCard(await view(page), "MID", "after the window closed");
  });

  test("the public team page has the same carousel", async ({ browser, baseURL }) => {
    const { ctx, page } = await phoneContext(browser, baseURL!, { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await ctx.clearCookies();
    await page.goto("/public");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    await expect(page.getByTestId("lineup-pager")).toHaveCount(0);
    expectOneCard(await view(page), "TOP", "the public page");
    const dots = page.getByTestId("lineup-indicator").getByRole("tab");
    await dots.first().focus();
    await page.keyboard.press("ArrowLeft");
    await expect(dots.nth(4)).toBeFocused();
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-SUPPORT"))).toBeLessThanOrEqual(0.5);
    expectOneCard(await view(page), "SUPPORT", "the public page, wrapped");
    await ctx.close();
  });

  test("at 200% text on a 320px phone: one card inside the gutter, the five dots on screen and 44px each, swipes and the loop as usual", async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    for (const root of [100, 125, 150, 175, 200]) {
      await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
      await expect.poll(async () => (await view(page)).gutter).toBe(16 * (root / 100));
      await expect.poll(() => offCentre(page.getByTestId("lineup-row-TOP")), `${root}%: the card kept in the middle`).toBeLessThanOrEqual(0.5);
      const v = await view(page);
      expectOneCard(v, "TOP", `320px at ${root}%`);
      // The dots stay 220px whatever the text size.
      expect(Math.round(v.dots.at(-1)!.right - v.dots[0]!.left), `${root}%: the dots' width`).toBe(220);
    }
    const cdp = await context.newCDPSession(page);
    const track = (await page.getByTestId("lineup-overview").boundingBox())!;
    await page.evaluate((top) => window.scrollTo(0, top), Math.max(0, track.y - 80));
    const box = (await page.getByTestId("lineup-overview").boundingBox())!;
    const y = Math.round(box.y + 120);
    await swipe(page, cdp, { x: 80, y }, { x: 300, y });
    await expect(page.getByTestId("lineup-indicator-dot").nth(4)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => offCentre(page.getByTestId("lineup-row-SUPPORT"))).toBeLessThanOrEqual(0.5);
    await page.evaluate(() => window.scrollTo(0, 0));
    expectOneCard(await view(page), "SUPPORT", "320px at 200%, wrapped");
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("a dot moves the carousel at once, and the dots do not animate", async ({ page }) => {
      await page.goto("/team");
      await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
      await lineupAtRest(page);
      const dots = page.getByTestId("lineup-indicator-dot");
      // Not hydrated yet: tap until the dot is chosen.
      await expect(async () => {
        await dots.nth(2).click({ timeout: 2_000 });
        await expect(dots.nth(2)).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      // From Mid to Support with no frames between: Support is in the middle in the first frames after the tap.
      await dots.nth(4).click();
      const xs = await page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const card = document.querySelector("[data-testid=lineup-row-SUPPORT]")!;
            const out: number[] = [];
            const tick = () => {
              out.push(Math.round(card.getBoundingClientRect().left));
              if (out.length < 3) requestAnimationFrame(tick);
              else resolve(out);
            };
            requestAnimationFrame(tick);
          }),
      );
      const v = await view(page);
      const gutter = v.cards.find((c) => c.role === "SUPPORT")!.left;
      expect(xs.every((x) => Math.abs(x - gutter) <= 1), `Support at once: ${xs.join(", ")}`).toBe(true);
      expectOneCard(v, "SUPPORT", "reduced motion");
      expect(await page.getByTestId("lineup-indicator-mark").first().evaluate((m) => parseFloat(getComputedStyle(m).transitionDuration)), "the dots' transition (globals.css: instant)").toBeLessThanOrEqual(0.001);
    });
  });
});

test("tablets and desktops keep the grid: no dots, no loop, every card in lineup order", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "wider screens");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  const { cells } = await lineupAtRest(page);
  await expect(page.getByTestId("lineup-indicator")).toBeHidden();
  await expect(page.getByTestId("lineup-pager")).toHaveCount(0);
  expect(await page.getByTestId("lineup-overview").evaluate((t) => t.scrollWidth <= t.clientWidth + 1), "no sideways track").toBe(true);
  expect(await page.getByTestId("lineup-cell").evaluateAll((els) => els.map((e) => getComputedStyle(e).order)), "lineup order").toEqual(["0", "0", "0", "0", "0"]);
  // Reading order: the first card first (top left).
  expect(cells[0]!.top).toBeLessThanOrEqual(Math.min(...cells.map((c) => c.top)));
  expect(cells[0]!.left).toBeLessThan(cells[1]!.left);
});
