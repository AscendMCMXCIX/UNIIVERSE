/*
  CHAMPION INTEL in the Production check (scripts/live-check.mjs, championLookupFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; docs/CHAMPION_INTEL.md): what the page shows, read in
  the page, and what the check asserts about it, apart from the browser so a unit test can hand it
  any state (src/server/ops/live-check-champion-lookup.test.ts).

  One page load of an ordinary champion (Ahri: her Q has a cooldown Riot's data gives) at the check's
  1440 × 900 and again with the window made 1920 × 1080; then, with no further request, 20 typed in
  the haste field, one ability's row opened, and the window of every champion opened from the
  champion's name and searched. Then Compare with Jinx (one request: the page builds the second
  champion on the server), read at 1440 × 900 on the aligned board; Swap (one request), read; and ✕
  on the first column (one request), which leaves Ahri alone again. Then Matchup Intel's old
  address, which must land here carrying its enemy. Read in the page only: counts, true or false,
  px, numbers and the page's own fixed words; no name but champions' and abilities'.
*/

/** What the page shows, read in the page at its current size (Playwright's evaluate: self-contained). */
export function readChampionLookup() {
  const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const panels = [...document.querySelectorAll('[data-testid="lookup-panel"]')];
  const shown = panels.filter((p) => p.offsetParent !== null);
  const panel = panels.find((p) => p.getAttribute("data-panel") === "1") ?? null;
  const rows = panel ? [...panel.querySelectorAll('[data-testid="lookup-ability"]')] : [];
  const values = (el) => (el?.getAttribute("data-values") ?? "").split(",").filter(Boolean).map(Number);
  const q = rows.find((r) => r.getAttribute("data-slot") === "Q");
  const p = rows.find((r) => r.getAttribute("data-slot") === "P");
  const boxes = shown.map((s) => s.getBoundingClientRect());
  // Compare's aligned board: each slot's row of the two columns at the same top (within a pixel).
  const rowTop = (n, slot) => document.querySelector(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-ability"][data-slot="${slot}"]`)?.getBoundingClientRect().top ?? null;
  const levels = ["P", "Q", "W", "E", "R"].map((slot) => [rowTop(1, slot), rowTop(2, slot)]);
  // A champion's name shown whole: nothing cut, on one line (the Range's boxes on one top), at this size.
  const nameWhole = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
    return el.scrollWidth <= el.clientWidth + 1 && tops.size <= 1;
  };
  return {
    size: `${innerWidth}x${innerHeight}`,
    innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    heading: text(document.querySelector("main h1")),
    champion: panel?.getAttribute("data-champion") ?? null,
    name: text(panel?.querySelector('[data-testid="lookup-name"]')),
    source: text(document.querySelector('[data-testid="lookup-source"]')),
    slots: rows.map((r) => r.getAttribute("data-slot")).join(""),
    // Each row with a name, an icon (Riot's, or the key as its stand-in) and a cooldown line (numbers, or why there are none).
    complete: rows.filter((r) => text(r.querySelector('[data-testid="lookup-ability-name"]')) && (r.querySelector("img") || r.querySelector('[data-testid="lookup-icon-standin"]')) && (r.querySelector('[data-testid="lookup-base"]') || text(r.querySelector('[data-testid="lookup-no-number"]')))).length,
    haste: Number(panel?.querySelector('[data-testid="lookup-haste"]')?.getAttribute("data-haste") ?? "NaN"),
    qKind: q?.getAttribute("data-cooldown") ?? null,
    qBase: values(q?.querySelector('[data-testid="lookup-base"]')),
    qHasted: values(q?.querySelector('[data-testid="lookup-hasted"]')),
    qOpen: !!q?.querySelector("details[open]"),
    qDescription: text(q?.querySelector('[data-testid="lookup-description"]')).length,
    // The passive: why Riot's data gives no cooldown (its row's reason), the quiet dash shown, its words for a screen reader.
    passiveKind: p?.getAttribute("data-cooldown") ?? null,
    passiveDash: text(p?.querySelector('[data-testid="lookup-dash"]')),
    passive: text(p?.querySelector('[data-testid="lookup-no-number"]')),
    passiveHasted: !!p?.querySelector('[data-testid="lookup-hasted"]'),
    // The haste rule (the ⓘ beside the first champion's haste field) and what Riot's data does not hold (the abilities' ⓘ).
    rule: text(panel?.querySelector('[data-testid="lookup-rule"]')),
    limit: text(panel?.querySelector('[data-testid="lookup-data-limit"]')),
    // The champion's facts: Riot's attack range (a record from rules format 4 on); and the chips of what Riot's descriptions name.
    range: text(panel?.querySelector('[data-testid="lookup-range"]')),
    mechanics: panel?.querySelectorAll('[data-testid="lookup-mechanic"]').length ?? 0,
    // Each ability's slot key, a tile of its own: in the row (one champion) or in Compare's column of keys.
    slotKeys: [...document.querySelectorAll('[data-testid="lookup-slot-key"]')].filter((k) => k.offsetParent !== null).map((k) => text(k)).join(""),
    namesCut: shown.filter((s) => { const n = s.querySelector('[data-testid="lookup-name"]'); return n && !nameWhole(n); }).length,
    // The essential part of every panel shown: its haste field and its five rows.
    lastBottom: Math.round(Math.max(0, ...shown.flatMap((s) => [...s.querySelectorAll('[data-testid="lookup-ability"]')].map((r) => r.getBoundingClientRect().bottom)))),
    hasteBottom: Math.round(Math.max(0, ...shown.map((s) => s.querySelector('[data-testid="lookup-haste"]')?.getBoundingClientRect().bottom ?? 0))),
    panels: shown.length,
    sideBySide: boxes.length === 2 && Math.abs(boxes[0].top - boxes[1].top) <= 1 && Math.abs(boxes[0].width - boxes[1].width) <= 1,
    rowsLevel: shown.length === 2 && levels.every(([a, b]) => a !== null && b !== null && Math.abs(a - b) <= 1),
    // Elements in the page's main part that scroll on their own.
    scrollers: [...document.querySelectorAll("main *")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length,
    // Words a game-integrity rule refuses, and "verified", anywhere in the page's main text.
    timerWords: /\b(timer|countdown|ready at|ready in|verified)\b/i.test(text(document.querySelector("main"))),
    url: location.pathname + location.search,
    secondChampion: panels.find((p) => p.getAttribute("data-panel") === "2")?.getAttribute("data-champion") ?? null,
  };
}

/** The window of every champion, read in the page once it is open (and after a search typed in it). */
export function readChampionWindow() {
  const win = document.querySelector('[data-testid="lookup-picker"]');
  const grid = win?.querySelectorAll('[data-testid="lookup-picker-grid"] button[data-champion]') ?? [];
  const title = win?.querySelector('[data-testid="lookup-picker-all-title"]')?.textContent ?? "";
  const counted = Number(/·\s*(\d+)/.exec(title)?.[1] ?? "NaN");
  return { open: !!win, shown: grid.length, counted, first: grid[0]?.getAttribute("data-champion") ?? null, found: win?.querySelector('[data-testid="lookup-picker-count"]')?.textContent?.trim() ?? "" };
}

/** Riot's general rule, as the page writes it: base × 100 / (100 + haste), to two decimals. */
export const hasted = (base, haste) => Math.round(((base * 100) / (100 + haste)) * 100) / 100;

/** The public patch name ("26.23") of Data Dragon's numbering ("16.23"), as the page writes it. */
function publicPatch(patch) {
  const m = /^(\d+)\.(\d+)/.exec(patch ?? "");
  if (!m) return null;
  const major = Number(m[1]);
  return `${major >= 15 && major < 25 ? major + 10 : major}.${Number(m[2])}`;
}

/**
 * What the check asserts: the page read at 1440 × 900 (`at`) and 1920 × 1080 (`wide`), after 20 typed
 * in the haste field and the Q's row opened (`hastedRead`), the window of every champion open (`all`)
 * and searched for "ahr" (`search`), a second champion added (`dual`, at 1440 × 900; undefined: not
 * judged), the two swapped (`swapped`) and the first column's ✕ pressed (`removed`; each undefined:
 * not judged), Matchup Intel's old address opened (`legacy`), and /api/health's patch (`healthPatch`,
 * Data Dragon's numbering; undefined: not compared). Each fact: its name, PASS, FAIL or WARN, and what
 * was found.
 */
export function championLookupVerdicts({ kind, champion, at, wide, hastedRead, all, search, dual, swapped, removed, legacy, healthPatch }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  const warn = (name, detail) => out.push({ name: `${kind}: ${name}`, status: "WARN", detail });
  fact(`Champion Intel opens ${champion} under its own heading`, at.heading === "Champion Intel" && at.champion === champion && at.name.length > 0, { heading: at.heading, champion: at.champion });
  const sourceOk = /^Riot Data Dragon \d+\.\d+\.\d+ · patch \d+\.\d+/.test(at.source);
  fact("the source line names Riot Data Dragon's version and its patch", sourceOk, { source: at.source });
  if (healthPatch !== undefined) {
    const shown = /patch (\d+\.\d+)/.exec(at.source)?.[1] ?? null;
    const game = publicPatch(healthPatch);
    const behind = /the game is on patch (\d+\.\d+)/.exec(at.source)?.[1] ?? null;
    fact("the abilities' patch is /api/health's, or the line says which patch the game is on", !!game && (shown === game || behind === game), { shown, game, behind });
  }
  if (at.slots === "") warn(`${champion}'s abilities are not on the page (not stored yet, or not readable): the page says so`, { slots: at.slots });
  else {
    fact("five abilities, Passive to R, each with its icon, its name and a cooldown line (numbers, or why there are none)", at.slots === "PQWER" && at.complete === 5, { slots: at.slots, complete: at.complete });
    fact("each ability's slot key is a tile of its own, P to R", at.slotKeys === "PQWER", { keys: at.slotKeys });
  }
  fact("the passive shows a quiet dash for the cooldown Riot's data does not give (said in words to a screen reader), and gets no haste", at.passiveKind === "passive-not-in-ddragon" && at.passiveDash === "—" && at.passive.includes("No cooldown in Riot's data") && !hastedRead.passiveHasted, { kind: at.passiveKind, dash: at.passiveDash, hasted: hastedRead.passiveHasted });
  if (at.qKind !== "per-rank") warn(`${champion}'s Q has no cooldown in Riot's data on this patch (${at.qKind}): the haste fact is not judged`, { q: at.qKind });
  else {
    const want = at.qBase.map((b) => hasted(b, 20));
    fact("20 typed in the haste field gives the Q's cooldown per rank by base × 100 / (100 + haste), the base kept, and the address keeps it", hastedRead.haste === 20 && hastedRead.qHasted.length === at.qBase.length && hastedRead.qHasted.every((v, i) => v === want[i]) && hastedRead.qBase.join() === at.qBase.join() && /[?&]haste=20(&|$)/.test(hastedRead.url), { base: at.qBase, hasted: hastedRead.qHasted, want, url: hastedRead.url });
  }
  fact("an ability's row opens to Riot's description", hastedRead.qOpen && hastedRead.qDescription > 0, { open: hastedRead.qOpen, description: hastedRead.qDescription });
  if (at.slots !== "") {
    if (at.mechanics > 0) fact("the abilities' chips name what Riot's descriptions name", true, { mechanics: at.mechanics });
    else warn("no mechanics from Riot's descriptions on this patch", { mechanics: at.mechanics });
    if (/^\d[\d,]*$/.test(at.range)) fact("the champion's facts give Riot's attack range", true, { range: at.range });
    else warn("no attack range: the stored abilities are from before rules format 4 (the next game-data update reads them)", { range: at.range });
  }
  fact("the haste field's ⓘ says the formula and what it leaves out; the abilities' ⓘ what Riot's data does not hold", /base × 100 \/ \(100 \+ haste\)/.test(at.rule) && /Ultimate haste isn't counted/.test(at.rule) && /no damage values or scaling/.test(at.limit), { rule: at.rule, limit: at.limit });
  fact("the champion's name is whole, on one line, at 1440 × 900 and 1920 × 1080", at.namesCut === 0 && wide.namesCut === 0, { cut: at.namesCut, wide: wide.namesCut });
  const overBy = (r) => r.scrollHeight - r.innerHeight;
  fact("one screen at 1440 × 900: the haste and the five abilities on it, folded, nothing scrolling inside", at.size === "1440x900" && at.lastBottom > 0 && at.lastBottom <= at.innerHeight && at.hasteBottom <= at.innerHeight && at.scrollers === 0, { lastBottom: at.lastBottom, hasteBottom: at.hasteBottom, innerHeight: at.innerHeight, scrollers: at.scrollers });
  fact("one screen at 1920 × 1080, no page scroll", wide.size === "1920x1080" && overBy(wide) <= 1, { overBy: overBy(wide), size: wide.size });
  fact("the window of every champion lists every champion on the roster: its count, at least 160, every portrait drawn", all.open && all.shown === all.counted && all.shown >= 160, { shown: all.shown, counted: all.counted });
  fact('its search finds a champion as typed ("ahr": Ahri first)', search.first === "Ahri" && /champions? found$/.test(search.found), { first: search.first, found: search.found });
  if (dual !== undefined) {
    fact("a second champion sits beside the first at 1440 × 900, both in the address, the five abilities of each on the screen", dual.panels === 2 && dual.sideBySide && /[?&]champion2=Jinx(&|$)/.test(dual.url) && dual.lastBottom > 0 && dual.lastBottom <= dual.innerHeight && dual.hasteBottom <= dual.innerHeight, { panels: dual.panels, sideBySide: dual.sideBySide, url: dual.url, lastBottom: dual.lastBottom, innerHeight: dual.innerHeight });
    fact("Compare is one aligned board: each ability's row of the two champions level, the names whole, nothing scrolling inside", dual.rowsLevel && dual.namesCut === 0 && dual.scrollers === 0, { rowsLevel: dual.rowsLevel, namesCut: dual.namesCut, scrollers: dual.scrollers });
  }
  if (swapped !== undefined) {
    fact("Swap exchanges the two champions, each with its own haste, in the address", swapped.champion === "Jinx" && swapped.secondChampion === champion && /^\/lookup\?champion=Jinx&champion2=[^&]+&haste2=20$/.test(swapped.url), { champion: swapped.champion, second: swapped.secondChampion, url: swapped.url });
  }
  if (removed !== undefined) {
    fact("✕ on the first column leaves the second champion alone, as the first, its haste with it", removed.panels === 1 && removed.champion === champion && /^\/lookup\?champion=[^&]+&haste=20$/.test(removed.url), { panels: removed.panels, champion: removed.champion, url: removed.url });
  }
  fact("Matchup Intel's old address lands on Champion Intel, carrying its enemy (vs)", legacy.url === "/lookup?champion=Mordekaiser" && legacy.champion === "Mordekaiser" && legacy.heading === "Champion Intel", { url: legacy.url, champion: legacy.champion });
  fact("no timer, countdown, ready time or \"verified\" anywhere on the page", !at.timerWords && !hastedRead.timerWords, null);
  return out;
}
