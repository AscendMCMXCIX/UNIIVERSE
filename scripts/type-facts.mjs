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
