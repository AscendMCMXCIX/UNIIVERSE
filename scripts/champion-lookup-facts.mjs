/*
  CHAMPION LOOKUP in the Production check (scripts/live-check.mjs, championLookupFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; docs/CHAMPION_LOOKUP.md): what the page shows for one
  champion, read in the page, and what the check asserts about it, apart from the browser so a unit
  test can hand it any state (src/server/ops/live-check-champion-lookup.test.ts).

  One page load of an ordinary champion (Ahri: her Q has a cooldown Riot's data gives) at the check's
  1440 × 900 and again with the window made 1920 × 1080; then, with no further request, a quick haste
  value pressed, and All champions opened and searched. Then Matchup Intel's old address, which must
  land here carrying its enemy. Read in the page only: counts, true or false, px, numbers and the
  page's own fixed words; no name but champions' and abilities'.
*/

/** What the page shows, read in the page at its current size (Playwright's evaluate: self-contained). */
export function readChampionLookup() {
  const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const rows = [...document.querySelectorAll('[data-testid="lookup-ability"]')];
  const values = (el) => (el?.getAttribute("data-values") ?? "").split(",").filter(Boolean).map(Number);
  const q = rows.find((r) => r.getAttribute("data-slot") === "Q");
  const p = rows.find((r) => r.getAttribute("data-slot") === "P");
  const panel = document.querySelector('[data-testid="lookup-panel"]');
  return {
    size: `${innerWidth}x${innerHeight}`,
    innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    heading: text(document.querySelector("main h1")),
    champion: panel?.getAttribute("data-champion") ?? null,
    name: text(document.querySelector('[data-testid="lookup-name"]')),
    source: text(document.querySelector('[data-testid="lookup-source"]')),
    slots: rows.map((r) => r.getAttribute("data-slot")).join(""),
    // Each row with a name, an icon (Riot's, or the key as its stand-in) and a cooldown line (numbers, or why there are none).
    complete: rows.filter((r) => text(r.querySelector('[data-testid="lookup-ability-name"]')) && (r.querySelector("img") || r.querySelector('[data-testid="lookup-icon-standin"]')) && (r.querySelector('[data-testid="lookup-base"]') || text(r.querySelector('[data-testid="lookup-no-number"]')))).length,
    haste: Number(document.querySelector('[data-testid="lookup-haste"]')?.getAttribute("data-haste") ?? "NaN"),
    qKind: q?.getAttribute("data-cooldown") ?? null,
    qBase: values(q?.querySelector('[data-testid="lookup-base"]')),
    qHasted: values(q?.querySelector('[data-testid="lookup-hasted"]')),
    passive: text(p?.querySelector('[data-testid="lookup-no-number"]')),
    passiveHasted: !!p?.querySelector('[data-testid="lookup-hasted"]'),
    rule: text(document.querySelector('[data-testid="lookup-rule"]')),
    lastBottom: Math.round(Math.max(0, ...rows.map((r) => r.getBoundingClientRect().bottom))),
    ruleBottom: Math.round(document.querySelector('[data-testid="lookup-rule"]')?.getBoundingClientRect().bottom ?? -1),
    // Words a game-integrity rule refuses, anywhere in the page's main text.
    timerWords: /\b(timer|countdown|ready at|ready in)\b/i.test(text(document.querySelector("main"))),
    url: location.pathname + location.search,
  };
}

/** All champions' window, read in the page once it is open (and after a search typed in it). */
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
 * What the check asserts: the page read at 1440 × 900 (`at`) and 1920 × 1080 (`wide`), after the
 * quick haste value 20 (`hastedRead`), All champions open (`all`) and searched for "ahr" (`search`),
 * Matchup Intel's old address opened (`legacy`), and /api/health's patch (`healthPatch`, Data
 * Dragon's numbering; undefined: not compared). Each fact: its name, PASS, FAIL or WARN, and what was found.
 */
export function championLookupVerdicts({ kind, champion, at, wide, hastedRead, all, search, legacy, healthPatch }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  fact(`Champion Lookup opens ${champion} under its own heading`, at.heading === "Champion Lookup" && at.champion === champion && at.name.length > 0, { heading: at.heading, champion: at.champion });
  const sourceOk = /^Riot Data Dragon \d+\.\d+\.\d+ · patch \d+\.\d+/.test(at.source);
  fact("the source line names Riot Data Dragon's version and its patch", sourceOk, { source: at.source });
  if (healthPatch !== undefined) {
    const shown = /patch (\d+\.\d+)/.exec(at.source)?.[1] ?? null;
    const game = publicPatch(healthPatch);
    const behind = /the game is on patch (\d+\.\d+)/.exec(at.source)?.[1] ?? null;
    fact("the abilities' patch is /api/health's, or the line says which patch the game is on", !!game && (shown === game || behind === game), { shown, game, behind });
  }
  if (at.slots === "") out.push({ name: `${kind}: ${champion}'s abilities are not on the page (not stored yet, or not readable): the page says so`, status: "WARN", detail: { slots: at.slots } });
  else fact("five abilities, Passive to R, each with its icon, its name and a cooldown line (numbers, or why there are none)", at.slots === "PQWER" && at.complete === 5, { slots: at.slots, complete: at.complete });
  fact("the passive says Riot's data gives it no cooldown, and gets no haste", at.passive.startsWith("No cooldown in Riot's data") && !hastedRead.passiveHasted, { passive: at.passive, hasted: hastedRead.passiveHasted });
  if (at.qKind !== "per-rank") out.push({ name: `${kind}: ${champion}'s Q has no cooldown in Riot's data on this patch (${at.qKind}): the haste fact is not judged`, status: "WARN", detail: { q: at.qKind } });
  else {
    const want = at.qBase.map((b) => hasted(b, 20));
    fact("a quick haste value (20) gives the Q's cooldown per rank by base × 100 / (100 + haste), the base kept beside it, and the address keeps it", hastedRead.haste === 20 && hastedRead.qHasted.length === at.qBase.length && hastedRead.qHasted.every((v, i) => v === want[i]) && hastedRead.qBase.join() === at.qBase.join() && /[?&]haste=20(&|$)/.test(hastedRead.url), { base: at.qBase, hasted: hastedRead.qHasted, want, url: hastedRead.url });
  }
  fact("the rule's line says the formula and what it leaves out", /base × 100 \/ \(100 \+ haste\)/.test(at.rule) && /Ultimate haste isn't counted/.test(at.rule), { rule: at.rule });
  const overBy = (r) => r.scrollHeight - r.innerHeight;
  fact("one screen at 1440 × 900: the five abilities and the rule's line on it, no page scroll", at.size === "1440x900" && overBy(at) <= 1 && at.ruleBottom > 0 && at.ruleBottom <= at.innerHeight, { overBy: overBy(at), ruleBottom: at.ruleBottom, innerHeight: at.innerHeight });
  fact("one screen at 1920 × 1080, no page scroll", wide.size === "1920x1080" && overBy(wide) <= 1, { overBy: overBy(wide), size: wide.size });
  fact("All champions lists every champion on the roster: its count, at least 160, every portrait drawn", all.open && all.shown === all.counted && all.shown >= 160, { shown: all.shown, counted: all.counted });
  fact('its search finds a champion as typed ("ahr": Ahri first)', search.first === "Ahri" && /champions? found$/.test(search.found), { first: search.first, found: search.found });
  fact("Matchup Intel's old address lands on Champion Lookup, carrying its enemy (vs)", legacy.url === "/lookup?champion=Mordekaiser" && legacy.champion === "Mordekaiser" && legacy.heading === "Champion Lookup", { url: legacy.url, champion: legacy.champion });
  fact("no timer, countdown or ready time anywhere on the page", !at.timerWords && !hastedRead.timerWords, null);
  return out;
}
