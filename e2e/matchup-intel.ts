import { expect, type Locator, type Page } from "./test";

/*
  Matchup Intel (Resources → Matchup Intel, docs/MATCHUP_INTEL.md): its address, its two pickers
  and their windows. Shared by e2e/matchup-intel.spec.ts.
*/

/** The page for a choice of champions (either may be left out), once its heading is drawn. */
export async function openMatchupIntel(page: Page, champion?: string, vs?: string) {
  const q = new URLSearchParams();
  if (champion) q.set("champion", champion);
  if (vs) q.set("vs", vs);
  await page.goto(`/resources/matchups${q.size ? `?${q.toString()}` : ""}`);
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
}

/** A side's picker window, opened by its slot; clicked again until the page is interactive (a click before hydration does nothing). */
export async function openPicker(page: Page, slot: "you" | "enemy"): Promise<Locator> {
  const win = page.getByTestId("matchup-picker");
  await expect(async () => {
    if (!(await win.isVisible())) await page.getByTestId(`matchup-pick-${slot}`).click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return win;
}

/** The champions a picker window's roster shows, in order (by Data Dragon id). */
export const rosterIds = (win: Locator) => win.getByTestId("matchup-picker-grid").locator("button[data-champion]").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));

/**
 * The champions a picker's short row offers (Recent, the curated matchups), by id: each button also
 * holds the portrait, whose two letters stand in where it cannot load, so its text is not the name.
 */
export const choiceIds = (row: Locator) => row.locator("button[data-champion]").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));

/**
 * Chooses a champion on one side: types `search` in its picker window and takes `id` from the
 * results; done once the address has it. The slot shows the choice at once, before the server's
 * page for it arrives and the router writes the address, so a reload straight after the slot
 * changed could still load the address before.
 */
export async function choose(page: Page, slot: "you" | "enemy", search: string, id: string) {
  const win = await openPicker(page, slot);
  await win.getByTestId("matchup-picker-search").fill(search);
  await win.getByTestId("matchup-picker-grid").locator(`button[data-champion="${id}"]`).click();
  await expect(win).toHaveCount(0);
  await expect(page.getByTestId(`matchup-pick-${slot}`)).toHaveAttribute("data-champion", id);
  await expect(page).toHaveURL(new RegExp(`[?&]${slot === "you" ? "champion" : "vs"}=${id}(&|#|$)`));
}

/** How far anything in a picker window reaches past its right edge, in px, once its content (not the loading tiles) is there. */
export async function pickerSpill(win: Locator): Promise<number> {
  await expect(win.getByTestId("matchup-picker-grid").locator("button[data-champion]").first()).toBeVisible();
  return win.evaluate((d) => {
    const box = d.getBoundingClientRect();
    return Math.max(0, ...[...d.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right - box.right));
  });
}

/** The enemy's ability rows, P Q W E R. */
export const enemyAbilities = (page: Page) => page.getByTestId("matchup-enemy-abilities").getByTestId("ability-row");

/** No page wider than the screen. */
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * What is cut or spills sideways in a part of the page, one line each (none when everything fits):
 *   - the part reaching past the screen's edges;
 *   - an element, or a line of text, reaching past the left or right edge of a box that holds it
 *     (a panel clips what reaches past it; anything else then overlaps what is beside it);
 *   - a box that clips its own content (a clamped name, a truncated line);
 *   - a picture drawn out of its proportions (squeezed, so its sides are cropped).
 * Text only screen readers get (in a box 1px wide that clips it) and the inside of an icon's
 * drawing are left out.
 */
export function cutOrSpilled(part: Locator): Promise<string[]> {
  return part.evaluate((root) => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const label = (n: Node) => {
      const el = n instanceof Element ? n : n.parentElement!;
      const where = el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName.toLowerCase();
      return `${where} <${el.tagName.toLowerCase()}> "${(n.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    };
    const srOnly = (el: Element | null) => {
      for (let a = el; a && root.contains(a); a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.position === "absolute" && s.overflowX === "hidden" && a.getBoundingClientRect().width <= 1) return true;
      }
      return false;
    };
    // The boxes that hold a node, from the nearest out to the part itself: the elements above it
    // that lay out a box of their own (not inline), in the page's flow.
    const boxesAround = (n: Node) => {
      const list: Element[] = [];
      for (let a = n.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (a === root || (s.display !== "inline" && s.display !== "contents" && s.position !== "absolute" && s.position !== "fixed")) list.push(a);
        if (a === root) break;
      }
      return list;
    };
    const within = (n: Node, rects: Iterable<DOMRect>) => {
      for (const r of rects) {
        if (r.width === 0 && r.height === 0) continue;
        for (const box of boxesAround(n)) {
          const b = box.getBoundingClientRect();
          const s = getComputedStyle(box);
          const left = b.left + parseFloat(s.borderLeftWidth);
          const right = b.right - parseFloat(s.borderRightWidth);
          if (r.left < left - 1 || r.right > right + 1) {
            out.push(`${label(n)} (${r.left.toFixed(1)} to ${r.right.toFixed(1)}) reaches past ${label(box)} (${left.toFixed(1)} to ${right.toFixed(1)})`);
            return;
          }
        }
      }
    };
    const edge = root.getBoundingClientRect();
    if (edge.left < -1 || edge.right > vw + 1) out.push(`the part (${edge.left.toFixed(1)} to ${edge.right.toFixed(1)}) reaches past the ${vw}px screen`);
    for (const el of root.querySelectorAll("*")) {
      if ((el instanceof SVGElement && !(el instanceof SVGSVGElement)) || srOnly(el)) continue;
      const r = el.getBoundingClientRect();
      within(el, [r]);
      const s = getComputedStyle(el);
      if (s.overflowX !== "visible" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.push(`${label(el)} clips its content sideways (${el.scrollWidth}px in ${el.clientWidth}px)`);
      if (s.overflowY !== "visible" && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) out.push(`${label(el)} clips its content (${el.scrollHeight}px in ${el.clientHeight}px high)`);
      const w = Number(el.getAttribute("width"));
      const h = Number(el.getAttribute("height"));
      if (el instanceof HTMLImageElement && w > 0 && h > 0 && r.height > 0 && Math.abs(r.width / r.height - w / h) > 0.02) out.push(`${label(el)} is drawn ${r.width.toFixed(0)} by ${r.height.toFixed(0)}, out of its ${w} by ${h} proportions`);
    }
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.textContent!.trim() || srOnly(t.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      within(t, range.getClientRects());
    }
    return [...new Set(out)];
  });
}
