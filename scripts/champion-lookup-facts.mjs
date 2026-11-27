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
  on the first column (one request), which leaves Ahri alone again. Each read also takes the
  champion's builds and runes (counted in the team's stored matches, streamed in after the
  abilities): whether they show, the queue they count (Ranked Solo/Duo when the address names none,
  one queue at a time: D5), the source line, each part's choice with its win and pick rate or why
  there is none (the runes with both trees' icons), or the honest line that the patch has too few
  games in that queue; and that no Riot ID or account id is anywhere in them. The populated builds,
  their thresholds and the queue choice are judged on a champion the team's data has builds for
  (scripts/builds-facts.mjs). Where a step of Compare does not
  finish, only that step is judged (and fails, named); the steps after it never ran and are not. Then Matchup Intel's old address, which must land here in
  Compare with both champions and its lane. Each read also takes every row's range (docs/CHAMPION_INTEL.md, "Ranges"): whether one
  is shown, hidden since Riot changed the ability or none, Riot's numbers behind it and the words
  shown, so the check holds production's ranges to the reviewed rule (never a placeholder, never on
  the passive, the numbers shown Riot's own). Read in the page only: counts, true or false,
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
    // The first champion's builds and runes: "shown", "few", "unavailable", or null (no section).
    ...readBuilds(panel),
    // Each row's range, in each column (Compare's second column too; [] without one).
    abilityRanges: readRanges(panel),
    abilityRanges2: readRanges(panels.find((p) => p.getAttribute("data-panel") === "2") ?? null),
    // Compare: the two champions' builds slots on one row (level within a pixel); null with fewer than two.
    buildsLevel: (() => {
      const slots = shown.map((s) => s.querySelector('[data-testid="lookup-builds"]')).filter(Boolean).map((e) => e.getBoundingClientRect());
      return slots.length === 2 ? Math.abs(slots[0].top - slots[1].top) <= 1 && Math.abs(slots[0].height - slots[1].height) <= 1 : null;
    })(),
    // A Riot ID ("Name#TAG") or an account id (a long unbroken token) anywhere in the builds sections, text or attributes.
    buildsIdentity: [...document.querySelectorAll('[data-testid="lookup-builds"]')].some((el) => {
      const said = [el.textContent ?? "", ...[...el.querySelectorAll("*")].flatMap((e) => [...e.attributes].map((a) => a.value))].join(" ");
      return /#[A-Za-z0-9]{2,5}\b/.test(said) || /[A-Za-z0-9_-]{60,}/.test(said);
    }),
  };

  /** Each row's range in a column: its status, what the item shows (words, with what a screen reader alone hears left out), Riot's numbers behind it and the ranks. */
  function readRanges(column) {
    const seen = (el) => {
      if (!el) return "";
      const copy = el.cloneNode(true);
      copy.querySelectorAll(".sr-only").forEach((e) => e.remove());
      return text(copy);
    };
    return [...(column?.querySelectorAll('[data-testid="lookup-ability"]') ?? [])].map((r) => {
      const item = r.querySelector('[data-testid="lookup-ability-range"]');
      return {
        slot: r.getAttribute("data-slot") ?? "",
        status: r.getAttribute("data-range-status") ?? "",
        kind: item?.getAttribute("data-range") ?? null,
        values: (item?.getAttribute("data-values") ?? "").split(",").filter(Boolean).map(Number),
        ranks: Number(item?.getAttribute("data-ranks") ?? "NaN"),
        shown: [...(item?.querySelectorAll("[data-range-value]") ?? [])].map((v) => Number((v.getAttribute("data-range-value") ?? "").replace(/,/g, ""))),
        text: seen(item),
      };
    });
  }

  /** The builds section of a column: its state, its queue, its source line, the honest line, and each part's row. */
  function readBuilds(column) {
    const view = column?.querySelector('[data-testid="lookup-builds-view"]') ?? null;
    const queue = view?.querySelector('[data-testid="lookup-build-queue"]') ?? null;
    return {
      buildsStatus: view?.getAttribute("data-status") ?? null,
      // The queue the section counts (its key), the name its choice shows (the popover's label, or the phone's own select), and whether the address names one.
      buildsQueue: view?.getAttribute("data-queue") ?? null,
      buildsSource: view?.getAttribute("data-source") ?? null,
      buildsQueueShown: queue ? (queue instanceof HTMLSelectElement ? text(queue.selectedOptions[0]) : text(queue.querySelector("[data-select-label]"))) : "",
      buildsAddressQueue: new URLSearchParams(location.search).has("queue"),
      // Whether the queue choice offers the Master+ source (the phone's own select's options, or the popover's names, all drawn to size it).
      buildsMasterOffered: queue ? (queue instanceof HTMLSelectElement ? [...queue.options].some((o) => o.value === "master") : /all regions/.test(queue.textContent ?? "")) : false,
      buildsLine: view?.querySelector('[data-testid="lookup-build-source"]')?.getAttribute("data-line") ?? "",
      buildsFew: text(view?.querySelector('[data-testid="lookup-build-few"]')),
      buildsParts: [...(view?.querySelectorAll('[data-testid="lookup-build-part"]') ?? [])].map((r) => ({
        part: r.getAttribute("data-part") ?? "",
        state: r.getAttribute("data-state") ?? "",
        win: text(r.querySelector('[data-testid="lookup-build-win"]')),
        pick: text(r.querySelector('[data-testid="lookup-build-pick"]')),
        pictures: r.querySelectorAll('[data-testid="lookup-build-choice"] img, [data-testid="lookup-build-choice"] [role=img]').length,
        // The rune page's trees drawn (the primary's before its keystone, the secondary's before its runes).
        trees: r.querySelectorAll('[data-testid="lookup-build-tree"] img, [data-testid="lookup-build-tree"] [role=img]').length,
        text: text(r.querySelector('[role="cell"]')),
      })),
    };
  }
}

/** The window of every champion, read in the page once it is open (and after a search typed in it). */
export function readChampionWindow() {
  const win = document.querySelector('[data-testid="lookup-picker"]');
  const grid = win?.querySelectorAll('[data-testid="lookup-picker-grid"] button[data-champion]') ?? [];
  const title = win?.querySelector('[data-testid="lookup-picker-all-title"]')?.textContent ?? "";
  const counted = Number(/·\s*(\d+)/.exec(title)?.[1] ?? "NaN");
  return { open: !!win, shown: grid.length, counted, first: grid[0]?.getAttribute("data-champion") ?? null, found: win?.querySelector('[data-testid="lookup-picker-count"]')?.textContent?.trim() ?? "" };
}

/** The builds' queues as the page names them (src/domain/champion-builds-words.ts QUEUE_LABELS; its unit test holds them equal). */
export const QUEUE_NAMES = { solo: "Ranked Solo/Duo", flex: "Ranked Flex", draft: "Normal Draft", clash: "Clash" };
/** The builds' source line (D5: no queue in it, the queue choice beside it): the games, the team's matches, the patch window, all ranks. */
export const BUILDS_LINE = /^From \d[\d,]* games? in the team's matches · (?:patch (\d+\.\d+)|patches \d+\.\d+–(\d+\.\d+)|patch \d+\.\d+, none yet on (\d+\.\d+)) · all ranks$/;
/** The builds' honest line in a queue with too few games. */
export const FEW_LINE = /^Not enough (?:Ranked Solo\/Duo|Ranked Flex|Normal Draft|Clash) games on patch \d+\.\d+ in the team's matches yet$/;

/** Riot's general rule, as the page writes it: base × 100 / (100 + haste), to two decimals. */
export const hasted = (base, haste) => Math.round(((base * 100) / (100 + haste)) * 100) / 100;

/** The public patch name ("26.23") of Data Dragon's numbering ("16.23"), as the page writes it. */
function publicPatch(patch) {
  const m = /^(\d+)\.(\d+)/.exec(patch ?? "");
  if (!m) return null;
  const major = Number(m[1]);
  return `${major >= 15 && major < 25 ? major + 10 : major}.${Number(m[2])}`;
}

/** The values a reach shows: one number where every rank has the same, else one per rank (shownReach in src/domain/champion-lookup/range.ts). */
const shownReach = (values) => (values.length > 0 && values.every((v) => v === values[0]) ? [values[0]] : values);

/**
 * Whether one column's ranges keep the reviewed rule (docs/CHAMPION_INTEL.md, "Ranges"): none on the
 * passive; a range shown only as "Range 970" (Riot's numbers, one per rank where they differ, each
 * above 50 and below 10,000, never smaller at a higher rank, as many as the ability's ranks, the
 * numbers drawn the ones behind it) or "Global"; an item only where the row says one is shown.
 * Returns what is wrong (empty when nothing is) and the counts.
 */
export function rangeProblems(ranges) {
  const wrong = [];
  for (const r of ranges ?? []) {
    const item = r.kind !== null;
    if (r.slot === "P" && (item || r.status === "shown")) wrong.push(`${r.slot}: a range on the passive`);
    if (item !== (r.status === "shown")) wrong.push(`${r.slot}: the item and the row's status disagree (${r.status})`);
    if (!item) continue;
    if (r.kind === "global") {
      if (r.text !== "Global") wrong.push(`${r.slot}: "${r.text}" for a global range`);
      continue;
    }
    if (r.kind !== "reach") {
      wrong.push(`${r.slot}: a range of kind ${r.kind}`);
      continue;
    }
    const v = r.values;
    if (!v.length || v.length !== r.ranks || !v.every((x) => Number.isFinite(x) && x > 50 && x < 10000) || !v.every((x, i) => i === 0 || x >= v[i - 1])) wrong.push(`${r.slot}: Riot's numbers ${v.join("/")} are not a reach for ${r.ranks} ranks`);
    if (shownReach(v).join(",") !== r.shown.join(",")) wrong.push(`${r.slot}: shows ${r.shown.join("/")} for Riot's ${v.join("/")}`);
    if (!/^Range \d[\d,]*(?: \/ \d[\d,]*)*$/.test(r.text)) wrong.push(`${r.slot}: "${r.text}" is not the range's words`);
  }
  const count = (s) => (ranges ?? []).filter((r) => r.status === s).length;
  return { wrong, shown: count("shown"), changed: count("changed"), self: count("self"), none: count("none") };
}

/**
 * What the check asserts: the page read at 1440 × 900 (`at`) and 1920 × 1080 (`wide`), after 20 typed
 * in the haste field and the Q's row opened (`hastedRead`), the window of every champion open (`all`)
 * and searched for "ahr" (`search`), a second champion added (`dual`, at 1440 × 900; undefined: not
 * judged), the two swapped (`swapped`) and the first column's ✕ pressed (`removed`; each undefined:
 * not judged), the step of those three that did not finish (`stopped`: "compare", "swap" or
 * "remove", read as that step's state; undefined: all finished), Matchup Intel's old address opened
 * (`legacy`), and /api/health's patch (`healthPatch`, Data Dragon's numbering; undefined: not
 * compared). Each fact: its name, PASS, FAIL or WARN, and what was found.
 */
export function championLookupVerdicts({ kind, champion, at, wide, hastedRead, all, search, dual, swapped, removed, stopped, legacy, healthPatch, healthHighElo }) {
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
  // Ranges (docs/CHAMPION_INTEL.md, "Ranges"): shown only under the reviewed rule. Until the first
  // game-data update after rules format 5 reads a champion, its records hold no range and none shows.
  if (at.slots !== "") {
    const r = rangeProblems(at.abilityRanges);
    fact(`${champion}'s ranges keep the reviewed rule: none on the passive, only Riot's numbers as "Range 970" (never a placeholder, one per rank where they differ) or "Global"`, r.wrong.length === 0, { wrong: r.wrong });
    if (r.shown > 0) fact(`${champion}'s ranges come from the reviewed table: some shown, the rest hidden since a change or not shown`, true, { shown: r.shown, changed: r.changed, self: r.self, none: r.none });
    else if (r.changed > 0) warn(`${champion}'s ranges wait for a review: Riot changed the abilities reviewed (none shown)`, { changed: r.changed, none: r.none });
    else warn(`no range shown for ${champion}: the stored abilities are from before rules format 5 (the next game-data update reads them), or none is reviewed`, { none: r.none, self: r.self });
  }
  fact("the haste field's ⓘ says the formula and what it leaves out; the abilities' ⓘ what Riot's data does not hold", /base × 100 \/ \(100 \+ haste\)/.test(at.rule) && /Ultimate haste isn't counted/.test(at.rule) && /no damage values or scaling/.test(at.limit), { rule: at.rule, limit: at.limit });
  fact("the champion's name is whole, on one line, at 1440 × 900 and 1920 × 1080", at.namesCut === 0 && wide.namesCut === 0, { cut: at.namesCut, wide: wide.namesCut });
  const overBy = (r) => r.scrollHeight - r.innerHeight;
  fact("one screen at 1440 × 900: the haste and the five abilities on it, folded, nothing scrolling inside", at.size === "1440x900" && at.lastBottom > 0 && at.lastBottom <= at.innerHeight && at.hasteBottom <= at.innerHeight && at.scrollers === 0, { lastBottom: at.lastBottom, hasteBottom: at.hasteBottom, innerHeight: at.innerHeight, scrollers: at.scrollers });
  fact("one screen at 1920 × 1080, no page scroll", wide.size === "1920x1080" && overBy(wide) <= 1, { overBy: overBy(wide), size: wide.size });
  fact("the window of every champion lists every champion on the roster: its count, at least 160, every portrait drawn", all.open && all.shown === all.counted && all.shown >= 160, { shown: all.shown, counted: all.counted });
  fact('its search finds a champion as typed ("ahr": Ahri first)', search.first === "Ahri" && /champions? found$/.test(search.found), { first: search.first, found: search.found });
  // A step that did not finish is named; it is judged on what the page showed, the steps after it are not judged at all.
  if (dual !== undefined || stopped !== undefined) fact("Compare, Swap and ✕ on the first column each finished (a step that did not is named; the steps after it are not judged)", stopped === undefined, { stopped: stopped ?? null });
  if (dual !== undefined) {
    fact("a second champion sits beside the first at 1440 × 900, both in the address, the five abilities of each on the screen", dual.panels === 2 && dual.sideBySide && /[?&]champion2=Jinx(&|$)/.test(dual.url) && dual.lastBottom > 0 && dual.lastBottom <= dual.innerHeight && dual.hasteBottom <= dual.innerHeight, { panels: dual.panels, sideBySide: dual.sideBySide, url: dual.url, lastBottom: dual.lastBottom, innerHeight: dual.innerHeight });
    fact("Compare is one aligned board: each ability's row of the two champions level, the names whole, nothing scrolling inside", dual.rowsLevel && dual.namesCut === 0 && dual.scrollers === 0, { rowsLevel: dual.rowsLevel, namesCut: dual.namesCut, scrollers: dual.scrollers });
    // Each column its own ranges, under the same rule, and no word comparing them (two neutral references).
    const second = rangeProblems(dual.abilityRanges2);
    const first = rangeProblems(dual.abilityRanges);
    fact("Compare: each column's ranges keep the reviewed rule, its own champion's, with no word comparing them", (dual.abilityRanges2 ?? []).length === 5 && second.wrong.length === 0 && first.wrong.length === 0, { wrong: [...first.wrong.map((w) => `1 ${w}`), ...second.wrong.map((w) => `2 ${w}`)], shown: [first.shown, second.shown] });
  }
  if (swapped !== undefined) {
    fact("Swap exchanges the two champions, each with its own haste, in the address", swapped.champion === "Jinx" && swapped.secondChampion === champion && /^\/lookup\?champion=Jinx&champion2=[^&]+&haste2=20$/.test(swapped.url), { champion: swapped.champion, second: swapped.secondChampion, url: swapped.url });
  }
  if (removed !== undefined) {
    fact("✕ on the first column leaves the second champion alone, as the first, its haste with it", removed.panels === 1 && removed.champion === champion && /^\/lookup\?champion=[^&]+&haste=20$/.test(removed.url), { panels: removed.panels, champion: removed.champion, url: removed.url });
  }
  // Builds and runes, counted in the team's stored matches (docs/CHAMPION_INTEL.md, "Builds and runes"):
  // the check signs in as a member with the default access, which may see teammates' statistics.
  const game = publicPatch(healthPatch ?? null) ?? /patch (\d+\.\d+)/.exec(at.source)?.[1] ?? null;
  fact("the builds and runes are shown to a member who may see teammates' statistics: the builds, or the line that the patch has too few games yet", at.buildsStatus === "shown" || at.buildsStatus === "few", { status: at.buildsStatus });
  if (at.buildsStatus === "shown" || at.buildsStatus === "few") {
    // D5 (26 Nov 2026): Ranked Solo/Duo by default, one queue named, never several.
    fact("the builds open on Ranked Solo/Duo, and the address names no queue", at.buildsQueue === "solo" && at.buildsQueueShown === QUEUE_NAMES.solo && !at.buildsAddressQueue, { queue: at.buildsQueue, shown: at.buildsQueueShown, inAddress: at.buildsAddressQueue });
    fact("the builds name one queue's games, never several: the queue choice shows one of the four queues, the one the section counts", Object.hasOwn(QUEUE_NAMES, at.buildsQueue ?? "") && QUEUE_NAMES[at.buildsQueue] === at.buildsQueueShown && at.buildsSource === "team", { queue: at.buildsQueue, shown: at.buildsQueueShown, source: at.buildsSource });
    // D2: the Master+ source only while /api/health says its collection is on (prepared and switched off until the owner's steps).
    if (healthHighElo === "off" || healthHighElo === "on") fact(`/api/health says the Master+ builds' collection is ${healthHighElo}, and the builds ${healthHighElo === "on" ? "offer" : "offer no"} Master+ source`, at.buildsMasterOffered === (healthHighElo === "on"), { collection: healthHighElo, offered: at.buildsMasterOffered });
    else if (healthHighElo === null) warn("/api/health does not say whether the Master+ builds' collection is on (a deployment from before it said so)", { collection: healthHighElo ?? null });
  }
  if (at.buildsStatus === "shown") {
    // The current patch; with the previous one added, the range; with none yet on the current one, the previous patch alone, said as that.
    const m = BUILDS_LINE.exec(at.buildsLine);
    const newest = m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
    fact("the builds' source line says the games, the team's matches, the current patch (the previous one added, or counted alone while the current has none, only where it says so) and all ranks", !!m && (game === null || newest === game), { line: at.buildsLine, game });
    const ok = (r) => (r.state === "shown" ? (r.part === "full" || (/^\d{1,3}%$/.test(r.win) && /^\d{1,3}%$/.test(r.pick))) && (r.part === "skills" || r.pictures > 0) : r.text.length > 0);
    const parts = at.buildsParts.map((r) => r.part);
    fact("each part of the builds shows its choice as icons with its win rate and pick rate, or says why there is none", at.buildsParts.length >= 7 && at.buildsParts.every(ok) && ["runes", "shards", "spells", "skills", "start", "boots", "core"].every((p) => parts.includes(p)), { parts: at.buildsParts.map((r) => `${r.part}:${r.state}`) });
    const runes = at.buildsParts.find((r) => r.part === "runes");
    if (runes?.state === "shown") fact("the runes draw both trees: the primary's before its keystone, the secondary's before its runes", runes.trees === 2, { trees: runes.trees });
  } else if (at.buildsStatus === "few") {
    fact("the builds' honest line names the queue and the current patch: no build made up from too few games", FEW_LINE.test(at.buildsFew) && at.buildsFew.includes(`Not enough ${QUEUE_NAMES[at.buildsQueue] ?? "?"} games`) && (game === null || at.buildsFew.includes(`patch ${game} `)) && at.buildsParts.length === 0, { line: at.buildsFew, game });
  }
  fact("the builds name no player: no Riot ID or account id in them, one champion or two", !at.buildsIdentity && !(dual?.buildsIdentity ?? false), { at: at.buildsIdentity, dual: dual?.buildsIdentity ?? null });
  if (dual !== undefined && dual.buildsLevel !== null) fact("Compare: each champion's builds on one row after R, level in both columns", dual.buildsLevel === true, { level: dual.buildsLevel });
  // Changed on 27 Nov 2026 (Matchup Intel back inside Champion Intel's Compare): both champions and the lane.
  fact("Matchup Intel's old address lands on Champion Intel's Compare with both champions and its lane (champion, vs, role)", legacy.url === "/lookup?champion=Riven&champion2=Mordekaiser&lane=TOP" && legacy.champion === "Riven" && legacy.secondChampion === "Mordekaiser" && legacy.heading === "Champion Intel", { url: legacy.url, champion: legacy.champion, second: legacy.secondChampion });
  fact("no timer, countdown, ready time or \"verified\" anywhere on the page", !at.timerWords && !hastedRead.timerWords, null);
  return out;
}
