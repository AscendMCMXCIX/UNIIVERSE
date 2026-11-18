import { expect, test, type Locator, type Page } from "./test";
import { lineupAtRest } from "./lineup";

/*
  Team Overview's lineup cards with larger text on a phone (in-memory demo roster, synthetic data).
  A phone shows one card at a time, as wide as the phone allows, and every size inside a card is in
  rem, so with larger text a card holds fewer letters: 6.5rem wide at 200% on a 320px phone, where
  the usual size never makes one narrower than 12.2rem. The card's clip cut what no longer fitted:
  "CS/MIN" by 7px at 175% and 42px at 200%, KDA and the vision figure beside the win rate ("KDA 3.7",
  "VISI 79."), the role's name in the corner ("SUPPO", and under the turn control already at 150%),
  and the pool's first choice ("Nauti", "12 gam"); the turn control also covered the picture's edge.
  At 150% to 200% on 320, 375 and 393px each card, front and back, now holds its text: none of it
  past the card's edge or out of the season's box, words whole, the pool's name and first choice
  never cut short, the card's controls clear of the role's chip (its name hidden to the eye only,
  where the icon stands alone), the picture, the links and the name, and no sideways scroll. At the
  usual size nothing of this applies.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
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
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((b) => b.width > 0.5);
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
    // The role's chip inside the card; the card's own controls clear of the chip, the picture, the
    // links and the name (a touch screen's turn control covered the picture's edge at 200% on 320px).
    const chip = card.querySelector("[data-testid=assigned-role]")!;
    const chb = chip.getBoundingClientRect();
    if (chb.right > inner.right + 0.5) problems.push(`role chip ${Math.round(chb.right - inner.right)}px past the card`);
    const parts = [chip, ...card.querySelectorAll("[data-avatar-frame], [data-testid=card-social], [data-testid=card-name]")];
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
    return { role: (card.getAttribute("data-testid") ?? "").replace(/^lineup-(row|sub)-/, ""), problems, chipText: chip.textContent?.trim() ?? "", labelShown: label ? shown(label) : true, rem: cb.width / parseFloat(getComputedStyle(document.documentElement).fontSize) };
  });
}

const ROLE_NAMES: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" };

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
      for (let i = 0; i < 5; i++) {
        const card = await measureFace(fronts.nth(i));
        expect(card.problems, `${at}, ${card.role} (a ${card.rem.toFixed(2)}rem card)`).toEqual([]);
        expect(card.chipText, `${at}, ${card.role}: the chip still names the role`).toBe(ROLE_NAMES[card.role]);
        if (!card.labelShown) narrowed.push(`${at} ${card.role}`);
      }
    }
  }
  // The icon stands alone only where the name could not fit (Support beside its turn control from
  // 150% on 320px; every card at 200% on 320px but Mid, which has no control).
  expect(narrowed, "the chips shown as their icon alone").toEqual(expect.arrayContaining(["320px at 150% SUPPORT", "320px at 200% TOP", "320px at 200% SUPPORT"]));
  expect(narrowed, "Mid's short name, with no control beside it, stays").not.toContain("320px at 200% MID");

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
  expect(back.chipText).toBe("Top");
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
