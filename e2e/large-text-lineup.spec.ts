import { expect, test, type Locator, type Page } from "./test";
import { lineupAtRest } from "./lineup";
import { memberContext, unique } from "./member-account";

/*
  Team Overview's lineup cards with larger text on a phone (in-memory demo roster, synthetic data).
  A phone shows one card at a time, as wide as the phone allows, and every size inside a card is in
  rem, so with larger text a card holds fewer letters: 8rem wide at 200% on a 320px phone (6.5rem
  until the carousel of 23 Nov 2026 gave the card the page's width inside its gutter), where
  the usual size never makes one narrower than 12.2rem. The card's clip cut what no longer fitted:
  "CS/MIN" by 7px at 175% and 42px at 200%, KDA and the vision figure beside the win rate ("KDA 3.7",
  "VISI 79."), the role's name in the corner ("SUPPO", and under the turn control already at 150%),
  and the pool's first choice ("Nauti", "12 gam"); the turn control also covered the picture's edge.
  At 150% to 200% on 320, 375 and 393px each card, front and back, now holds its text: none of it
  past the card's edge or out of the season's box, words whole, the pool's name and first choice
  never cut short, no "·" ending or starting a line, the card's controls clear of the role's chip
  (its name hidden to the eye only, where the icon stands alone: screen readers are still given
  it), the picture, the links and the name, and no sideways scroll. The chip shows its name
  wherever its lane (to the card's own edge on a card without controls) holds it with the margin the
  browsers' text needs (team-roster.tsx, CHIP_FIT), and the icon alone elsewhere; in the browser
  running the test, no lane narrower than a chip (by more than the half pixel every check here
  allows) shows its name, whichever lanes the phones give. A member's own card, with Customise
  beside the turn control, holds the same at the same sizes, its two controls one above the other on
  a card under 9.25rem. At the usual size nothing of this applies.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

// Against the layout viewport's width: a phone's (isMobile) window grows with what spills past it, so innerWidth would hide it.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settled = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** What one side of a card shows, measured in one frame: whatever is wrong with it, as readable lines. */
function measureFace(face: Locator) {
  return face.evaluate((card) => {
    const problems: string[] = [];
    const cb = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const inner = { left: cb.left + parseFloat(cs.borderLeftWidth), right: cb.right - parseFloat(cs.borderRightWidth) };
    const hiddenToEye = (e: Element) => {
      for (let p: Element | null = e; p && p !== card; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.position === "absolute" && parseFloat(s.width) <= 1.5 && parseFloat(s.height) <= 1.5) return true;
      }
      return false;
    };
    const shown = (e: Element) => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !hiddenToEye(e);
    // Every piece of text the eye sees: inside the card, and every word on one line.
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? "";
      const parent = n.parentElement;
      if (!text.trim() || !parent || !shown(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((b) => b.width > 0.5 && b.height > 0.5);
      if (!rects.length) continue;
      // An ellipsis box shows its text up to its own edge: that edge is what must be inside the card.
      const ps = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      const right = ps.textOverflow === "ellipsis" ? Math.min(Math.max(...rects.map((b) => b.right)), pr.right) : Math.max(...rects.map((b) => b.right));
      const left = ps.textOverflow === "ellipsis" ? Math.max(Math.min(...rects.map((b) => b.left)), pr.left) : Math.min(...rects.map((b) => b.left));
      const past = Math.max(right - inner.right, inner.left - left);
      if (past > 0.5) problems.push(`"${text.trim().slice(0, 24)}" ${Math.round(past)}px past the card's edge`);
      for (const m of text.matchAll(/\S{2,}/g)) {
        const word = document.createRange();
        word.setStart(n, m.index!);
        word.setEnd(n, m.index! + m[0].length);
        const lines = new Set([...word.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top)));
        if (lines.size > 1) problems.push(`"${m[0]}" broken over ${lines.size} lines`);
      }
    }
    // The season's figures inside their own box (a label ran out of it before the card cut it).
    const season = card.querySelector("[data-testid=card-season]");
    if (season) {
      const sb = season.getBoundingClientRect();
      for (const el of season.querySelectorAll("dt, dd")) {
        if (!shown(el) || !el.textContent?.trim()) continue;
        // The text the eye sees: a screen reader's words inside it (S8b's "Average kills / deaths /
        // assists: ") are drawn in a 1px box, and their line runs past it unseen.
        const rects: DOMRect[] = [];
        const texts = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = texts.nextNode(); t; t = texts.nextNode()) {
          if (!t.textContent?.trim() || !t.parentElement || !shown(t.parentElement)) continue;
          const range = document.createRange();
          range.selectNodeContents(t);
          rects.push(...[...range.getClientRects()].filter((b) => b.width > 0.5));
        }
        if (!rects.length) continue;
        const past = Math.max(Math.max(...rects.map((b) => b.right)) - sb.right, sb.left - Math.min(...rects.map((b) => b.left)));
        if (past > 0.5) problems.push(`season "${el.textContent.trim()}" ${Math.round(past)}px out of its box`);
      }
    }
    // Text cut short by its own ellipsis: the pool's name and its first choice.
    const pool = card.querySelector("[data-card-pool]");
    const heading = pool?.parentElement?.querySelector(":scope > p > span");
    const first = [...(pool?.querySelectorAll("[data-testid=pool-first] *") ?? [])].filter((el) => getComputedStyle(el).textOverflow === "ellipsis");
    for (const el of [heading, ...first]) {
      if (el && shown(el) && el.scrollWidth > el.clientWidth + 1) problems.push(`"${el.textContent?.trim()}" cut short`);
    }
    // No "·" ends or starts a line (the first choice's "14 games · 29%" wraps at 200% on 320px): a
    // character of the card's visible text on its line either side of it.
    const chars: { c: string; mid: number }[] = [];
    const letters = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = letters.nextNode(); n; n = letters.nextNode()) {
      const text = n.textContent ?? "";
      if (!text.trim() || !n.parentElement || !shown(n.parentElement)) continue;
      for (let k = 0; k < text.length; k++) {
        if (!text[k]!.trim()) continue;
        const range = document.createRange();
        range.setStart(n, k);
        range.setEnd(n, k + 1);
        const box = [...range.getClientRects()].find((b) => b.width > 0.1);
        if (box) chars.push({ c: text[k]!, mid: box.top + box.height / 2 });
      }
    }
    chars.forEach((ch, k) => {
      if (ch.c !== "·") return;
      const [before, after] = [chars[k - 1], chars[k + 1]];
      if (!after || Math.abs(after.mid - ch.mid) > 4) problems.push(`a "·" ends a line`);
      if (!before || Math.abs(before.mid - ch.mid) > 4) problems.push(`a "·" starts a line`);
    });
    // The role's chip inside the card, its name shown only where the chip fits its lane; the card's
    // own controls clear of the chip, the picture, the links, the name and "You" (a touch screen's
    // turn control covered the picture's edge at 200% on 320px).
    const chip = card.querySelector("[data-testid=assigned-role]")!;
    const chb = chip.getBoundingClientRect();
    if (chb.right > inner.right + 0.5) problems.push(`role chip ${Math.round(chb.right - inner.right)}px past the card`);
    const lane = card.querySelector("[data-testid=assigned-role-lane]")!.getBoundingClientRect();
    if (chb.right > lane.right + 0.5) problems.push(`role chip ${Math.round(chb.right - lane.right)}px past its lane`);
    const parts = [chip, ...card.querySelectorAll("[data-avatar-frame], [data-testid=card-social], [data-testid=card-name], [data-testid=card-you]")];
    for (const control of card.querySelectorAll(":scope > [data-card-overlay] button")) {
      const b = control.getBoundingClientRect();
      for (const part of parts) {
        const pb = part.getBoundingClientRect();
        const x = Math.min(pb.right, b.right) - Math.max(pb.left, b.left);
        const y = Math.min(pb.bottom, b.bottom) - Math.max(pb.top, b.top);
        const name = part === chip ? "role chip" : part.hasAttribute("data-avatar-frame") ? "picture" : part.getAttribute("data-testid");
        if (pb.width > 0 && x > 0.5 && y > 0.5) problems.push(`${name} under ${control.getAttribute("data-testid")} (${Math.round(x)} × ${Math.round(y)}px)`);
      }
    }
    const label = chip.querySelector("[data-testid=assigned-role-label]");
    const icon = chip.querySelector("[data-role-icon]")?.getBoundingClientRect();
    if (!icon || icon.width < 8 || icon.right > inner.right) problems.push("role icon not shown whole");
    // Two controls (a member's own card: Customise and the turn control): side by side, or one above the other.
    const [a, b] = [...card.querySelectorAll(":scope > [data-card-overlay] button")].map((el) => el.getBoundingClientRect());
    const controls = a && b ? (Math.abs(a.top - b.top) < 1 ? "side by side" : Math.abs(a.right - b.right) < 1 && Math.max(a.top, b.top) >= Math.min(a.bottom, b.bottom) ? "one above the other" : "neither") : null;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { role: (card.getAttribute("data-testid") ?? "").replace(/^lineup-(row|sub)-/, ""), problems, labelShown: label ? shown(label) : true, rem: cb.width / rem, inner: (inner.right - inner.left) / rem, controls };
  });
}

const ROLE_NAMES: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" };

/**
 * Each front's role chip measured with its name (its lane widened for the reading), then its lane
 * narrowed to that width less half a pixel: whether the name still shows there. That is the
 * narrowest lane that could show a name past it, so where none does, no lane can, in the browser
 * running the test: whatever its text measures, not only at the lanes the demo's cards give.
 * Narrowed and put back within one frame, so nothing is drawn in between.
 */
const squeezedChips = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-testid^=lineup-row-]")].map((card) => {
      const lane = card.querySelector<HTMLElement>("[data-testid=assigned-role-lane]")!;
      const chip = lane.querySelector("[data-testid=assigned-role]")!;
      const label = chip.querySelector("[data-testid=assigned-role-label]")!;
      const style = lane.getAttribute("style");
      lane.style.right = "auto";
      lane.style.width = "60rem";
      const width = chip.getBoundingClientRect().width;
      lane.style.width = `${width - 0.5}px`;
      const box = label.getBoundingClientRect();
      const nameShown = !(getComputedStyle(label).position === "absolute" && box.width <= 1.5 && box.height <= 1.5);
      if (style === null) lane.removeAttribute("style");
      else lane.setAttribute("style", style);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return { role: (card.getAttribute("data-testid") ?? "").replace(/^lineup-row-/, ""), rem: width / rem, nameShown };
    }),
  );

/**
 * What a screen reader is given for a face's role chip (its accessibility tree, not textContent): the
 * role's name, also where the eye sees the icon alone. A label hidden from everyone (`hidden`, or
 * aria-hidden) gives nothing, while its textContent would still name the role.
 */
const chipSpoken = (face: Locator) => face.getByTestId("assigned-role").ariaSnapshot();

test("at 150% to 200% text on 320, 375 and 393px phones, every lineup card holds its text: nothing cut, words whole, the card's controls clear of the role and the picture", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  await lineupAtRest(page);
  const fronts = page.locator("[data-testid^=lineup-row-]");
  await expect(fronts).toHaveCount(5);
  const narrowed: string[] = [];
  for (const width of [320, 375, 393]) {
    await page.setViewportSize({ width, height: 800 });
    for (const root of [150, 175, 200]) {
      await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
      await settled(page);
      const at = `${width}px at ${root}%`;
      await expect.poll(() => overflow(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
      // A chip is as wide at every phone width, so once per size: in a lane its own width less half a
      // pixel, each chip shows its icon alone (its threshold holds it in this browser, to that half
      // pixel).
      if (width === 320) {
        const squeezed = await squeezedChips(page);
        expect(squeezed.filter((c) => c.nameShown).map((c) => `${c.role} (a ${c.rem.toFixed(3)}rem chip)`), `${root}%: a role's name shown in a lane narrower than its chip`).toEqual([]);
      }
      for (let i = 0; i < 5; i++) {
        const card = await measureFace(fronts.nth(i));
        expect(card.problems, `${at}, ${card.role} (a ${card.rem.toFixed(2)}rem card)`).toEqual([]);
        expect(await chipSpoken(fronts.nth(i)), `${at}, ${card.role}: the chip still names the role to screen readers`).toBe(`- text: ${ROLE_NAMES[card.role]}`);
        if (!card.labelShown) narrowed.push(`${at} ${card.role}`);
      }
    }
  }
  // The icon stands alone exactly where the lane is narrower than the role's threshold (its chip and
  // the margin), and nowhere else. Since the carousel (23 Nov 2026) a card is the phone's width less
  // the gutter (2rem), 1.5rem wider than with the glimpse of its neighbours, so fewer chips narrow:
  // Support beside its turn control (lane: the card less 4.25rem) from 150% on 320px, 175% on 375 and
  // 393px; Top beside its control only at 200% on 320px (3.75rem of lane; at 175% there 5.18rem holds
  // its 5.02rem threshold, as 5.47 and 6.03rem do at 200% on 375 and 393px); Bottom, without a control
  // (lane: the card less about 0.8rem), only at 200% on 320px (7.2rem, threshold 7.38rem), where Jungle
  // keeps its name (threshold 7.04rem). Support at 175% on 393px has 7.79rem of lane: its chip fits
  // there in Chromium and WebKit (7.773rem) but not as GitHub's headless Chromium draws it (7.818rem),
  // and the lane is under its 7.81rem threshold. Mid's short name always fits. (Before the carousel:
  // also Top and Bottom at 175% on 320px, Jungle at 200% there, Support at 150% on 375px and Top at
  // 200% on 375 and 393px.)
  expect(narrowed, "the chips shown as their icon alone").toEqual([
    "320px at 150% SUPPORT",
    "320px at 175% SUPPORT",
    "320px at 200% TOP",
    "320px at 200% ADC",
    "320px at 200% SUPPORT",
    "375px at 175% SUPPORT",
    "375px at 200% SUPPORT",
    "393px at 175% SUPPORT",
    "393px at 200% SUPPORT",
  ]);

  // The back of a card (its substitute, with the way back in the corner), at 200% on a 320px phone.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await settled(page);
  const top = page.getByTestId("lineup-card-TOP");
  await page.getByTestId("lineup-row-TOP").getByTestId("flip-to-substitute").click();
  await expect(top).toHaveAttribute("data-flipped", "true");
  await expect(top).not.toHaveAttribute("data-turn", /.+/);
  const back = await measureFace(page.getByTestId("lineup-sub-TOP"));
  expect(back.problems, "320px at 200%, the back of Top").toEqual([]);
  expect(await chipSpoken(page.getByTestId("lineup-sub-TOP")), "320px at 200%, the back of Top: the chip names the role to screen readers").toBe("- text: Top");
  await page.getByTestId("lineup-sub-TOP").getByTestId("flip-back").click();
  await expect(top).not.toHaveAttribute("data-flipped", "true");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("at the usual text size on 320, 375 and 393px phones, the lineup cards keep their layout: the role's name beside its icon, the figures in their columns", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  await lineupAtRest(page);
  const fronts = page.locator("[data-testid^=lineup-row-]");
  await expect(fronts).toHaveCount(5);
  for (const width of [320, 375, 393]) {
    await page.setViewportSize({ width, height: 800 });
    await settled(page);
    for (let i = 0; i < 5; i++) {
      const card = await measureFace(fronts.nth(i));
      expect(card.problems, `${width}px, ${card.role}`).toEqual([]);
      expect(card.labelShown, `${width}px, ${card.role}: the role's name shown`).toBe(true);
      const layout = await fronts.nth(i).evaluate((el) => ({
        figures: getComputedStyle(el.querySelector("[data-testid=card-season] dl")!).display,
        first: getComputedStyle(el.querySelector("[data-testid=pool-first]")!).flexWrap,
      }));
      expect(layout, `${width}px, ${card.role}: one row of figures, the first choice beside its portrait`).toEqual({ figures: "grid", first: "nowrap" });
    }
  }
});

/** Edit lineup, as the team's administrator: who starts at Top (chosen by name); its substitute stays. */
async function setTopStarter(admin: Page, name: string) {
  await admin.goto("/team");
  await expect(admin.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  if ((await admin.getByTestId("lineup-row-TOP").getAttribute("data-player-name")) === name) return;
  await admin.getByTestId("edit-lineup").click();
  await admin.getByTestId("lineup-change-TOP").click();
  const sheet = admin.getByTestId("lineup-sheet-TOP");
  await sheet.locator(`[data-testid=lineup-option][data-player-name="${name}"]`).click();
  await sheet.getByTestId("lineup-sheet-save").click();
  await expect(sheet).toBeHidden();
  await expect(admin.getByTestId("lineup-row-TOP")).toHaveAttribute("data-player-name", name);
  await admin.getByTestId("edit-lineup").click();
}

/*
  Who started at Top before the own-card test put its member there, until they are back. The test's
  finally puts them back, and this hook does when the test ended before its finally could: after a
  timeout (a step that never ends, since no action here has a timeout of its own) the hooks run, and
  then the test's browser closes under the abandoned finally. Left at Top, the test's member is who a
  retry would put back, and every later spec (the projects share one demo database) would find them
  starting at Top.
*/
let topToRestore: string | null = null;
test.afterEach(async ({ browser }) => {
  if (topToRestore === null) return;
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await setTopStarter(await admin.newPage(), topToRestore);
    topToRestore = null;
  } finally {
    await admin.close();
  }
});

test("a member's own card, with Customise beside the turn control, at 150% to 200% text on 320, 375 and 393px phones: the two controls side by side or one above the other, clear of the role, the picture and the name; nothing cut, words whole", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(240_000);
  // The demo's local owner has no player profile, so a member is made, with a name of short words
  // (a long one-word name may break inside its word in a narrow card, by design), and starts at Top,
  // whose substitute gives the card its turn control. The lineup goes back afterwards.
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await admin.newPage();
  await adminPage.goto(baseURL! + "/team");
  await expect(adminPage.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  const atTop = (await adminPage.getByTestId("lineup-row-TOP").getAttribute("data-player-name"))!;
  // A member an earlier attempt left at Top (its restore never ran) is not who goes back: the demo's is.
  const before = atTop.startsWith("Own ") ? "Demo Top" : atTop;
  const display = `Own ${unique("").slice(-5)}`;
  const member = await memberContext(browser, adminPage, { width: 375, height: 667 }, { base: "Own", role: "Top", display });
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: await member.context.storageState() });
  try {
    topToRestore = before;
    await setTopStarter(adminPage, display);
    const page = await phone.newPage();
    await page.goto("/team");
    await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
    await lineupAtRest(page);
    const own = page.getByTestId("lineup-row-TOP");
    await expect(own).toHaveAttribute("data-player-name", display);
    await expect(own.getByTestId("customise-card")).toBeAttached();
    await expect(own.getByTestId("flip-to-substitute")).toBeAttached();
    await expect(own.getByTestId("card-you")).toBeAttached();
    const named: string[] = [];
    for (const width of [320, 375, 393]) {
      await page.setViewportSize({ width, height: 800 });
      for (const root of [100, 150, 175, 200]) {
        await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
        await settled(page);
        const at = `${width}px at ${root}%`;
        await expect.poll(() => overflow(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
        const card = await measureFace(own);
        expect(card.problems, `${at}, your own Top card (a ${card.rem.toFixed(2)}rem card)`).toEqual([]);
        expect(await chipSpoken(own), `${at}: the chip still names the role to screen readers`).toBe("- text: Top");
        // One above the other on a card under 9.25rem, where side by side they left the role no room.
        expect(card.controls, `${at}: Customise and the turn control (a card ${card.inner.toFixed(2)}rem inside)`).toBe(card.inner < 9.25 ? "one above the other" : "side by side");
        if (card.labelShown) named.push(at);
      }
    }
    // Beside two controls (lane: the card less 7.375rem) the role's name shows at the usual size and at
    // 150% on 375 and 393px phones (6.25 and 7rem of lane, over Top's 5.02rem threshold; 375px joined
    // with the carousel's wider card, 23 Nov 2026); everywhere else the icon stands alone.
    expect(named, "your own card's chip with the role's name").toEqual(["320px at 100%", "375px at 100%", "375px at 150%", "393px at 100%", "393px at 150%"]);
  } finally {
    await setTopStarter(adminPage, before);
    topToRestore = null;
    await phone.close();
    await member.context.close();
    await admin.close();
  }
});

test("the carousel's position dots on a 320 × 568 phone: every target 44px or more at 100% to 200% text, the five on screen, the same 220px at every size (§6 row 1.2h)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a 320px phone, set below");
  await page.setViewportSize({ width: 320, height: 568 });
  // The members' page and the public page (the same carousel since 23 Nov 2026; the lineup pager over
  // the cards, whose targets this test held to 44px from 20 Nov 2026, went with it).
  for (const path of ["/team", "/public"]) {
    await page.goto(path);
    const indicator = page.getByTestId("lineup-indicator");
    await expect(indicator).toBeVisible();
    await expect(page.getByTestId("lineup-pager")).toHaveCount(0);
    for (const root of [100, 125, 150, 175, 200]) {
      await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
      await settled(page);
      const m = await indicator.evaluate((p) => ({ width: p.getBoundingClientRect().width, left: p.getBoundingClientRect().left, right: p.getBoundingClientRect().right, dots: Array.from(p.querySelectorAll("[data-testid=lineup-indicator-dot]")).map((d) => { const r = d.getBoundingClientRect(); return { width: r.width, height: r.height }; }) }));
      expect(m.dots, `${path} at ${root}%: five targets`).toHaveLength(5);
      for (const [i, d] of m.dots.entries()) expect(Math.min(d.width, d.height), `${path} at ${root}%: target ${i + 1}`).toBeGreaterThanOrEqual(44);
      // In px, so larger text never spreads them past the phone: 220px wide, on screen.
      expect(m.width, `${path} at ${root}%: the dots' width`).toBeCloseTo(220, 0);
      expect(m.left >= 0 && m.right <= 320, `${path} at ${root}%: on screen`).toBe(true);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
});
