/*
  MATCHUP INTEL in the Production check (scripts/live-check.mjs, matchupIntelFacts; docs/LIVE_VALIDATION.md,
  "What it checks"): what the page shows for one curated pair, read in the page, and what the check
  asserts about it, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-matchup-intel.test.ts).

  The page changes with the game, with no deploy: once a patch is out after the curated notes' check,
  the briefing and the notes say "Not re-checked for 26.23"; once Riot changes an ability a briefing
  rests on, the parts resting on it are hidden and said; three patches after the check the briefing is
  hidden whole. The check holds the page to what the owner asked of it (18 Nov 2026), whatever state
  it is in:
  - the essential overview fits one screen with no page scroll at 1920 × 1080 (the desktop context
    resized, as the wide checks do);
  - at the check's own desktop size, 1440 × 900, the essentials are on the screen: the enemy's five
    ability tiles and the sources' summary (the page may scroll a little there: 1440 × 900 is not a
    size the overview is promised to fit, docs/MATCHUP_INTEL.md, "The dashboard");
  - a briefing hidden as too old, or every part of it hidden for a change, is a state the page is
    built to show, not a failure: those facts pass and say what they found (the layer, the words, the
    overrun), and so do the two fit facts while any part of the briefing is hidden, since a hidden
    part's note can take more room than the part. The rest (the heading, the tiles, the sources and
    notices, the wiki, which facts win, axe) holds in every state.
  Read in the page only: counts, true or false, px and the page's own fixed words; no name but the
  pair's champions' and abilities'.
*/

/** The evidence fold's tiers (S7b): each scope with its n, or why it is not counted for this account. */
const EVIDENCE_TIERS = /^In your games(: no player profile| \(n = \d+\)) · In the team's games( \(n = \d+\)|: not part of this access)$/;

/** What the page shows, read in the page at its current size (Playwright's evaluate: self-contained). */
export function readMatchupIntel() {
  const text = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const tiles = [...document.querySelectorAll('[data-testid="matchup-enemy-abilities"] [data-testid="ability-row"]')];
  const summary = document.querySelector('[data-testid="matchup-sources-summary"]')?.getBoundingClientRect();
  const hiddenParts = document.querySelectorAll('[data-testid="briefing-threat-hidden"], [data-testid="briefing-opportunity-hidden"], [data-testid="briefing-lane-hidden"], [data-testid="matchup-interactions-hidden"]').length;
  return {
    size: `${innerWidth}x${innerHeight}`,
    heading: text("main h1"),
    layer: document.querySelector('[data-testid="matchup-dashboard"]')?.getAttribute("data-layer") ?? null,
    label: text('[data-testid="matchup-layer"]'),
    threat: text('[data-testid="briefing-threat"]').length,
    opportunity: text('[data-testid="briefing-opportunity"]').length,
    checked: text('[data-testid="matchup-briefing-checked"]'),
    // The briefing hidden as too old, every part of it hidden for a change, or some parts.
    expired: !!document.querySelector('[data-testid="briefing-expired"]'),
    hiddenWhole: !!document.querySelector('[data-testid="briefing-hidden"]'),
    hiddenParts,
    // Above the assembled reference: whether it says the briefing is hidden (never "no curated briefing").
    assembledWhy: text('[data-testid="matchup-assembled-why"]'),
    barWarning: text('[data-testid="matchup-hidden-parts"]'),
    notRechecked: !!document.querySelector('[data-testid="matchup-patch-state"] [data-testid="matchup-not-rechecked"], [data-testid="matchup-briefing-checked"] [data-testid="matchup-not-rechecked"]'),
    slots: tiles.map((t) => t.getAttribute("data-slot")).join(""),
    named: tiles.filter((t) => t.querySelector('[data-testid="ability-name"]')?.textContent?.trim() && t.querySelector('[data-testid="ability-cooldown-value"]')?.textContent?.trim()).length,
    missing: !!document.querySelector('[data-testid="matchup-abilities-missing"]'),
    tilesBottom: Math.round(Math.max(0, ...tiles.map((t) => t.getBoundingClientRect().bottom))),
    summary: text('[data-testid="matchup-sources-summary"]'),
    summaryBottom: summary ? Math.round(summary.bottom) : null,
    summaryShown: !!summary && summary.height > 0 && summary.bottom <= innerHeight,
    ddragon: text('[data-testid="matchup-footer-ddragon"]'),
    notice: text('[data-testid="matchup-footer-riot"]'),
    licence: document.querySelector('[data-testid="matchup-licence-link"]')?.getAttribute("href") ?? null,
    innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    // Facts from Riot's text (L3) on the page: none for a pair whose champions both have checked notes, which win.
    riotTextChips: document.querySelectorAll('[data-testid="ability-facts"][data-from="riot-text"] [data-testid^="fact-chip"]').length,
    riotTextLabel: !!document.querySelector('[data-testid="matchup-riot-text-label"]'),
    // S7a: the lane selector (its five lanes, the one pressed), the slots it sets, Riot's tips' label and the evidence not collected.
    roles: [...document.querySelectorAll('[data-testid="matchup-role"] button')].map((b) => `${b.textContent?.trim()}${b.getAttribute("aria-pressed") === "true" ? "*" : ""}`).join(" "),
    slotCount: document.querySelector('[data-testid="matchup-pickers"]')?.getAttribute("data-slots") ?? null,
    tipsLabel: text('[data-testid="riot-tips-label"]'),
    highElo: document.querySelector('[data-testid="matchup-evidence-high-elo"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    // S7b: the evidence fold's tiers, the briefing's (or the assembled reference's) tier and the enemy kit's.
    evidenceTiers: text('[data-testid="matchup-evidence-tiers"]'),
    briefingTier: text('[data-testid="matchup-briefing"] [data-testid="evidence-tier"], [data-testid="matchup-no-briefing"] [data-testid="evidence-tier"]'),
    kitTier: text('[data-testid="matchup-enemy-abilities"] [data-testid="evidence-tier"]'),
  };
}

/** The state the page is in, from what it shows: "expired", "hidden" (every part, for a change), "parts hidden", or "shown". */
export function briefingState(f) {
  if (f.expired) return "expired";
  if (f.hiddenWhole) return "hidden";
  if (f.hiddenParts > 0) return "parts hidden";
  return "shown";
}

/** The assembled reference says the briefing is hidden above it, never that there is none. */
const saysHiddenAbove = (f) => /^The curated briefing for .+ vs .+ is hidden, above\.$/.test(f.assembledWhy);

/**
 * What the check asserts, from the page read at the check's desktop size (`at`, 1440 × 900) and at
 * 1920 × 1080 (`wide`), for the pair `pair` ("Riven vs Mordekaiser", its enemy `enemy`), with the
 * League of Legends Wiki requests the page made (`wiki`). Each fact: its name, PASS, FAIL or WARN, and
 * what was found (counts, px, the page's fixed words).
 */
export function matchupIntelVerdicts({ kind, pair, enemy, at, wide, wiki }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  const state = briefingState(at);
  const hiddenState = state !== "shown";
  fact(`Matchup Intel opens ${pair} under its own heading`, at.heading === "Matchup Intel", { heading: at.heading });
  if (state === "expired") fact("the curated briefing is hidden as too old to show, and says so, above the assembled reference too", at.layer === "assembled" && saysHiddenAbove(at), { layer: at.layer, checked: at.checked, above: at.assembledWhy });
  else if (state === "hidden") fact("every part of the curated briefing is hidden because Riot changed what it rests on, and says so, above the assembled reference and in the bar", at.layer === "assembled" && saysHiddenAbove(at) && /^Changed since the check: the briefing is hidden$/.test(at.barWarning), { layer: at.layer, above: at.assembledWhy, bar: at.barWarning });
  else
    fact(
      state === "parts hidden" ? `the curated briefing shows, labelled with when it was checked, its parts resting on an ability Riot changed hidden and said (${at.hiddenParts}), and the bar warns` : "the curated briefing shows its threat and opportunity, labelled with when it was checked",
      at.layer === "curated" && at.threat > 0 && at.opportunity > 0 && /Checked on patch \d+\.\d+/.test(at.checked) && at.label.startsWith("Curated briefing") && (state === "shown" || /^Changed since the check: \w+ parts? hidden$/.test(at.barWarning)),
      { layer: at.layer, label: at.label, checked: at.checked, ...(state === "parts hidden" ? { hiddenParts: at.hiddenParts, bar: at.barWarning } : {}) },
    );
  // No tiles: none stored yet, or a stored copy the page cannot read; the page says which, in place of them.
  if (at.missing) out.push({ name: `${kind}: ${enemy}'s abilities are not on the page (not stored yet, or not readable): the page says so`, status: "WARN", detail: { slots: at.slots } });
  else fact(`${enemy}'s five ability tiles, P to R, each with its name and cooldown line`, at.slots === "PQWER" && at.named === 5, { slots: at.slots, named: at.named });
  // The fit, as the owner asked it: one screen at 1920 × 1080, the essentials on screen at 1440 × 900.
  const overBy = wide.scrollHeight - wide.innerHeight;
  const essentials = !at.missing && at.slots === "PQWER" && at.tilesBottom <= at.innerHeight && at.summaryShown;
  const found = { state, notRechecked: at.notRechecked };
  if (hiddenState) {
    out.push({ name: `${kind}: 1920 × 1080: with the briefing ${state}, the overview ${overBy > 0 ? `runs ${overBy}px past the screen` : "fits the screen, no page scroll"} (not judged in this state)`, status: "PASS", detail: { ...found, overBy, size: wide.size } });
    out.push({ name: `${kind}: 1440 × 900: with the briefing ${state}, the five tiles and the sources' summary are ${essentials ? "on the screen" : "not all on the screen"} (not judged in this state)`, status: "PASS", detail: { ...found, tilesBottom: at.tilesBottom, summaryBottom: at.summaryBottom, innerHeight: at.innerHeight } });
  } else {
    fact("1920 × 1080: the whole overview fits the screen, no page scroll", wide.size === "1920x1080" && overBy <= 0, { ...found, overBy, size: wide.size });
    // With no tiles (the warning above) only the sources' summary can be asked for: the state is the
    // warning's, not a second failure of its own.
    if (at.missing) fact("1440 × 900: with no ability tiles (the warning above), the sources' summary is on the screen", at.summaryShown, { ...found, summaryBottom: at.summaryBottom, innerHeight: at.innerHeight });
    else fact("1440 × 900: the essentials are on the screen: the enemy's five ability tiles and the sources' summary", essentials, { ...found, tilesBottom: at.tilesBottom, summaryBottom: at.summaryBottom, innerHeight: at.innerHeight, overBy: at.scrollHeight - at.innerHeight });
  }
  fact("the sources' summary: a static reference with no live tracking, Riot's data, not endorsed by Riot Games", at.summary.startsWith("A static reference: no live tracking") && /Riot Data Dragon \d/.test(at.summary) && at.summary.endsWith("Not endorsed by Riot Games"), { summary: at.summary });
  fact("one press away, the Data Dragon version, the wiki's licence and Riot's notice", /^Ability names, icons and base cooldowns: Riot Data Dragon \d/.test(at.ddragon) && at.licence === "https://creativecommons.org/licenses/by-sa/3.0/" && /isn't endorsed by Riot Games/.test(at.notice), { ddragon: at.ddragon, licence: at.licence });
  fact("the lane selector offers Top, Jungle, Mid, ADC and Support, one pressed, and its slots (two for a solo lane); Riot's tips are labelled as Riot's; no high-elo evidence is claimed", /^Top\*? Jungle\*? Mid\*? ADC\*? Support\*?$/.test(at.roles ?? "") && (at.roles ?? "").split("*").length === 2 && (at.slotCount === "2" || at.slotCount === "4") && at.tipsLabel === "Riot's tip (may predate later changes)" && at.highElo === "Runes, items and skill order: No high-elo evidence (not collected)", { roles: at.roles, slots: at.slotCount, tipsLabel: at.tipsLabel, highElo: at.highElo });
  fact("every row states its evidence tier: the evidence fold's own games and the team's, with their n or why not counted; the briefing's checked notes (or Riot's data where it is assembled); the enemy's kit as Riot's data", EVIDENCE_TIERS.test(at.evidenceTiers ?? "") && (at.briefingTier === "Checked notes (AI reviewers)" || at.briefingTier === "Riot's data") && at.kitTier === "Riot's data", { evidenceTiers: at.evidenceTiers, briefingTier: at.briefingTier, kitTier: at.kitTier });
  fact("nothing requested from the League of Legends Wiki", wiki.length === 0, wiki.slice(0, 3));
  fact("checked notes win over the facts from Riot's text: none of those on a pair whose champions both have checked notes, nor Riot's text in the sources' summary", at.riotTextChips === 0 && !at.riotTextLabel && !at.summary.includes("Riot's text"), { chips: at.riotTextChips, label: at.riotTextLabel });
  return out;
}
