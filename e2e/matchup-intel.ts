import { expect, test, type Locator, type Page } from "./test";
import { CHANGED_ABILITIES_TEST_COOKIE, NOTES_AGE_TEST_COOKIE, RIOT_CHANGED_TEST_COOKIE } from "../src/server/matchup-intel/notes-age";
import { RIOT_TEXT_TEST_COOKIE } from "../src/server/matchup-intel/riot-text/switch";
import { HIGH_ELO_TEST_COOKIE } from "../src/server/matchup-intel/high-elo/switch";

/*
  Matchup Intel (a sidebar entry of its own, docs/MATCHUP_INTEL.md): its address, its two pickers
  and their windows. Shared by e2e/matchup-intel.spec.ts.
*/

/**
 * The facts from Riot's text (L3) in the state a test needs, whatever their switch says: they ship
 * off until the owner has pasted the new registration text in Riot's Developer Portal
 * (src/server/matchup-intel/riot-text/switch.ts), so a test of them turns them on for its own
 * pages, and a test of the off state turns them off. A cookie only the in-memory demo reads.
 */
export async function riotText(page: Page, state: "on" | "off") {
  await page.context().addCookies([{ name: RIOT_TEXT_TEST_COOKIE, value: state, url: test.info().project.use.baseURL! }]);
}

/**
 * Matchup Intel as production shows it once `patches` patches have come out after the curated notes'
 * check (src/server/matchup-intel/notes-age.ts): the demo is pinned to the version they were checked
 * on, so on its own it never shows "Not re-checked for …". The notes read as checked that many patches
 * earlier, with Riot's records unchanged. A cookie only the in-memory demo reads.
 */
export async function notesAge(page: Page, patches: 1 | 2 | 3) {
  await page.context().addCookies([{ name: NOTES_AGE_TEST_COOKIE, value: String(patches), url: test.info().project.use.baseURL! }]);
}

/**
 * With notesAge: Matchup Intel as production shows it once Riot has changed some curated abilities
 * after the check (src/server/matchup-intel/notes-age.ts), named "Champion.Slot". Riot's records are
 * shown as they are; only the notes' record of them reads as older. A cookie only the in-memory demo reads.
 */
export async function changedAbilities(page: Page, refs: readonly string[]) {
  await page.context().addCookies([{ name: CHANGED_ABILITIES_TEST_COOKIE, value: refs.join(","), url: test.info().project.use.baseURL! }]);
}

/**
 * Matchup Intel as production shows it once Riot changed these on the newest patch ("champion:Riven",
 * "item:1055"; src/server/matchup-intel/notes-age.ts): the per-version diff's "Riot changed this on
 * 26.22" labels, which the demo, recording no digests, never shows on its own. A cookie only the
 * in-memory demo reads.
 */
export async function riotChanged(page: Page, keys: readonly string[]) {
  await page.context().addCookies([{ name: RIOT_CHANGED_TEST_COOKIE, value: keys.join(","), url: test.info().project.use.baseURL! }]);
}

/**
 * The observed Master+ games (docs/HIGH_ELO_EVIDENCE.md) shown or not, whatever the collection's
 * switch says (src/server/matchup-intel/high-elo/switch.ts): "on" shows the demo's own counts. A
 * cookie only the in-memory demo reads.
 */
export async function highElo(page: Page, state: "on" | "off") {
  await page.context().addCookies([{ name: HIGH_ELO_TEST_COOKIE, value: state, url: test.info().project.use.baseURL! }]);
}

/** The page for a choice of champions (either may be left out), once its heading is drawn. */
export async function openMatchupIntel(page: Page, champion?: string, vs?: string) {
  const q = new URLSearchParams();
  if (champion) q.set("champion", champion);
  if (vs) q.set("vs", vs);
  await page.goto(`/resources/matchups${q.size ? `?${q.toString()}` : ""}`);
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
}

/** A side's picker window, opened by its slot; clicked again until the page is interactive (a click before hydration does nothing). */
export async function openPicker(page: Page, slot: "you" | "enemy" | "ally" | "enemy2"): Promise<Locator> {
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
export async function choose(page: Page, slot: "you" | "enemy" | "ally" | "enemy2", search: string, id: string) {
  const win = await openPicker(page, slot);
  await win.getByTestId("matchup-picker-search").fill(search);
  await win.getByTestId("matchup-picker-grid").locator(`button[data-champion="${id}"]`).click();
  await expect(win).toHaveCount(0);
  await expect(page.getByTestId(`matchup-pick-${slot}`)).toHaveAttribute("data-champion", id);
  const param = { you: "champion", enemy: "vs", ally: "ally", enemy2: "vs2" }[slot];
  await expect(page).toHaveURL(new RegExp(`[?&]${param}=${id}(&|#|$)`));
}

/** How far anything in a picker window reaches past its right edge, in px, once its content (not the loading tiles) is there. */
export async function pickerSpill(win: Locator): Promise<number> {
  await expect(win.getByTestId("matchup-picker-grid").locator("button[data-champion]").first()).toBeVisible();
  return win.evaluate((d) => {
    const box = d.getBoundingClientRect();
    // What is fixed to the screen rather than laid out in the window is left out: the notifications'
    // region, drawn inside an open window in the same place as on the page (the screen's foot, its
    // own width), is empty and out of the window's layout.
    const fixed = (e: Element) => {
      for (let a: Element | null = e; a && a !== d; a = a.parentElement) if (getComputedStyle(a).position === "fixed") return true;
      return false;
    };
    return Math.max(0, ...[...d.querySelectorAll("*")].filter((e) => !fixed(e)).map((e) => e.getBoundingClientRect().right - box.right));
  });
}

/** The enemy's ability rows, P Q W E R. */
export const enemyAbilities = (page: Page) => page.getByTestId("matchup-enemy-abilities").getByTestId("ability-row");

/**
 * How far the page reaches past the screen's width: against the layout viewport (clientWidth), not
 * innerWidth, which a phone's browser widens to whatever overflows (as it zooms out to show it).
 */
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Once the page's code runs (what this device remembers has been read): a click before then does nothing for most controls. */
export async function hydrated(page: Page) {
  await expect(page.getByTestId("matchup-remembered")).not.toHaveAttribute("data-state", "loading");
}

/** Champion portraits and ability icons from Riot's CDN answered with a small local picture, so a measurement sees pictures drawn, not their stand-ins (and nothing leaves the machine). */
export async function localPictures(page: Page) {
  const { png } = await import("./png");
  const picture = png(64, 64);
  await page.route(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/.*\.(png|jpe?g|webp)$/, (route) => route.fulfill({ body: picture, contentType: "image/png" }));
}

/**
 * What a picker window clips or spills, once its content (not its loading tiles) is there: a
 * portrait wider than its column, a name cut (clamped or truncated), or anything past the window's
 * right edge. The window's body scrolls, so its height is not judged.
 */
export async function pickerCuts(win: Locator): Promise<string[]> {
  await expect(win.getByTestId("matchup-picker-grid").locator("button[data-champion]").first()).toBeVisible();
  return win.evaluate((d) => {
    const out: string[] = [];
    const right = d.getBoundingClientRect().right;
    for (const b of d.querySelectorAll<HTMLElement>('[data-testid="matchup-picker-grid"] button[data-champion]')) {
      const id = b.dataset.champion;
      const col = b.getBoundingClientRect();
      const portrait = b.querySelector("img, [role=img]")?.getBoundingClientRect();
      if (portrait && (portrait.width > col.width + 0.5 || portrait.right > col.right + 0.5)) out.push(`${id}: its portrait (${portrait.width.toFixed(0)}px) is wider than its column (${col.width.toFixed(0)}px)`);
      const name = b.querySelector<HTMLElement>(":scope > span:last-child");
      if (name && (name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1)) out.push(`${id}: its name is cut`);
      if (col.right > right + 1) out.push(`${id}: past the window's edge`);
    }
    return out;
  });
}

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
