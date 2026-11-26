/*
  THE TEXT HIERARCHY in the Production check (scripts/live-check.mjs; docs/LIVE_VALIDATION.md, "What
  it checks"; docs/STANDARDS.md, "Type"): the owner's readability request of 25 Nov 2026, read in the
  page and judged here, apart from the browser, so a unit test can hand it any reading
  (src/server/ops/live-check-type.test.ts).

  Three facts on the member pages the check opens:
  - the four text tiers are deployed with their values (primary, secondary, tertiary, disabled);
  - no live text is drawn in the disabled tone (it is under 4.5:1, allowed only on a disabled control
    or the label of one, which axe skips);
  - where labels are sentence case (the profile's Overview, Settings), no text in the page's main
    part is drawn in capitals, except a round pill (a badge) and a member's own name style.
  And one on All Champions' table (docs/STANDARDS.md, "Tables and rankings"; the release's review
  found the merge had put its unsorted columns back in grey): every figure in its columns is primary
  (a dash or a zero, "not counted yet" or none, tertiary), in semibold only in the sorted column,
  whose heading alone is semibold.

  Read in the page only: token values, counts, and for text in capitals its tag and nearest test id,
  never its words (a member's own name style, data-name-style, is left out altogether).
*/

/** The tiers' values, as globals.css defines them (src/server/ops/live-check-type.test.ts compares them). */
export const TEXT_TIERS = {
  "--color-fg": "#eef0f6",
  "--color-fg-muted": "#c9cddb",
  "--color-fg-subtle": "#a2a8bc",
  "--color-fg-disabled": "#70758c",
};

/** The page's text facts (self-contained, for evaluate). */
export function readTypeFacts() {
  const root = getComputedStyle(document.documentElement);
  const tiers = Object.fromEntries(["--color-fg", "--color-fg-muted", "--color-fg-subtle", "--color-fg-disabled"].map((name) => [name, root.getPropertyValue(name).trim().toLowerCase()]));
  // The disabled tone as the browser computes a colour (rgb()).
  const probe = document.createElement("span");
  probe.style.color = "var(--color-fg-disabled)";
  document.body.append(probe);
  const disabledColour = getComputedStyle(probe).color;
  probe.remove();
  const main = document.querySelector("main") ?? document.body;
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden=true], .sr-only");
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && /[\p{L}\p{N}]/u.test(n.textContent ?? ""));
  const inDisabledControl = (el) => {
    if (el.closest(":disabled, [aria-disabled=true]")) return true;
    const label = el.closest("label");
    return !!label && !!(label.control?.disabled || label.querySelector(":disabled"));
  };
  const pill = (el) => {
    for (let e = el; e && e !== main; e = e.parentElement) {
      const s = getComputedStyle(e);
      const r = parseFloat(s.borderTopLeftRadius);
      if (r > 0 && r >= e.getBoundingClientRect().height / 2 - 0.5 && e.getBoundingClientRect().height <= 32) return true;
    }
    return false;
  };
  let live = 0;
  let inControls = 0;
  const capitals = [];
  for (const el of main.querySelectorAll("*")) {
    if (!ownText(el) || !shown(el)) continue;
    const s = getComputedStyle(el);
    if (s.color === disabledColour) {
      if (inDisabledControl(el)) inControls++;
      else live++;
    }
    // Only the element's tag and its nearest test id leave the page, never its words.
    if (s.textTransform === "uppercase" && !el.closest("[data-name-style]") && !pill(el)) capitals.push(`${el.tagName.toLowerCase()}${el.closest("[data-testid]") ? ` in ${el.closest("[data-testid]").getAttribute("data-testid")}` : ""}`);
  }
  return { tiers, disabledTone: { live, inControls }, capitals };
}

/** All Champions' figure columns, by test id (each row's cells; hidden at widths that do not show them). */
export const TABLE_FIGURES = ["champion-kda", "champion-cs", "champion-kills", "champion-double", "champion-triple", "champion-quadra", "champion-penta", "mastery-points"];

/**
 * All Champions' table, as counts only (self-contained, for evaluate; `ids` is TABLE_FIGURES): its
 * figure cells shown at this width, those not primary, a dash or zero not tertiary, a figure in
 * semibold outside the sorted column or a sorted one not in semibold, and the headings' weights.
 * `table: false` where the list shows narrow rows (no columns: a phone, or the list beside a preview).
 */
export function readTableFigures(ids) {
  const header = document.querySelector("[data-testid=all-champions-header]");
  if (!header || header.getClientRects().length === 0 || getComputedStyle(header).display === "none") return { table: false, cells: 0, notPrimary: 0, emptyNotTertiary: 0, weightOff: 0, headings: 0, headingOff: 0 };
  const colour = (v) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${v})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  };
  const [primary, tertiary] = [colour("--color-fg"), colour("--color-fg-subtle")];
  const sortedHead = [...header.querySelectorAll("[data-sort] [data-testid^=sort-]")].find((b) => b.getClientRects().length > 0);
  const sortedId = sortedHead ? `champion-${sortedHead.getAttribute("data-testid").slice("sort-".length)}` : null;
  // Mastery's cells are mastery-points; the medium layout's Multikills sorts as the wide one's Penta.
  const sortedCell = (id) => id === sortedId || (id === "mastery-points" && sortedId === "champion-mastery") || (id === "champion-penta" && sortedId === "champion-multikills");
  let cells = 0;
  let notPrimary = 0;
  let emptyNotTertiary = 0;
  let weightOff = 0;
  for (const row of document.querySelectorAll("[data-testid=top-champion]")) {
    for (const id of ids) {
      const el = row.querySelector(`[data-testid=${id}]`);
      if (!el || el.getClientRects().length === 0) continue;
      cells++;
      const s = getComputedStyle(el);
      // A cell's figure: its visible part (the kills' figure is beside its screen-reader words).
      const shown = (el.querySelector("[aria-hidden]")?.textContent ?? el.textContent ?? "").replace("*", "").trim();
      if (shown === "—" || shown === "0") {
        if (s.color !== tertiary) emptyNotTertiary++;
        continue;
      }
      if (s.color !== primary) notPrimary++;
      if ((Number(s.fontWeight) >= 600) !== sortedCell(id)) weightOff++;
    }
  }
  const heads = [...header.querySelectorAll("[data-testid^=sort-]")].filter((b) => b.getClientRects().length > 0);
  const headingOff = heads.filter((b) => (Number(getComputedStyle(b).fontWeight) >= 600) !== !!b.closest("[data-sort]")).length;
  return { table: true, cells, notPrimary, emptyNotTertiary, weightOff, headings: heads.length, headingOff };
}

/** What the check asserts about All Champions' table (not applicable where it shows narrow rows). */
export function tableFigureVerdicts({ kind, facts }) {
  const name = `${kind}: All Champions: every figure in the table primary (a dash or zero tertiary), semibold only in the sorted column, under the one semibold heading`;
  if (!facts.table) return [{ name, status: "PASS", detail: "not applicable: narrow rows at this width" }];
  if (facts.cells === 0) return [{ name, status: "PASS", detail: "not applicable: no figure column shown (no champion listed)" }];
  const ok = facts.notPrimary === 0 && facts.emptyNotTertiary === 0 && facts.weightOff === 0 && facts.headingOff === 0;
  return [{ name, status: ok ? "PASS" : "FAIL", detail: facts }];
}

/** Whether every tier is deployed with its value. */
export function tiersDeployed(tiers) {
  return Object.entries(TEXT_TIERS).every(([name, value]) => (tiers?.[name] ?? "") === value);
}

/**
 * What the check asserts about one page's reading: the tiers (once per width, `tiers: true`), live
 * text in the disabled tone, and, where the page's labels are sentence case (`sentenceCase: true`),
 * text in capitals.
 */
export function typeVerdicts({ kind, page, facts, tiers = false, sentenceCase = false }) {
  const out = [];
  if (tiers) out.push({ name: `${kind}: the four text tiers are deployed (primary, secondary, tertiary, disabled)`, status: tiersDeployed(facts.tiers) ? "PASS" : "FAIL", detail: facts.tiers });
  out.push({ name: `${kind}: ${page}: no live text in the disabled tone (only disabled controls use it)`, status: facts.disabledTone.live === 0 ? "PASS" : "FAIL", detail: facts.disabledTone });
  if (sentenceCase) out.push({ name: `${kind}: ${page}: labels in sentence case (no capitals outside a pill)`, status: facts.capitals.length === 0 ? "PASS" : "FAIL", detail: { capitals: facts.capitals.length, first: facts.capitals.slice(0, 3) } });
  return out;
}
