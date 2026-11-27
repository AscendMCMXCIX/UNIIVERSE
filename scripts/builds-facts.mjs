/*
  CHAMPION INTEL's populated builds in the Production check (scripts/live-check.mjs,
  buildsChampionFacts; docs/LIVE_VALIDATION.md, "What it checks"; docs/CHAMPION_INTEL.md): the
  builds of champions the team's data has builds for, opened from the builds audit's sealed probe
  (LIVE_BUILDS_CHAMPIONS, scripts/builds-probe.mjs; LIVE_LOCAL=1: the demo's Thresh and Leona), read
  in the page and judged here, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-builds.test.ts).

  One page load (the two champions side by side, or one), then only the page's own state: the
  "Highest win rate" view where offered, each other role, the queue choice (Ranked Flex, then back
  to Ranked Solo/Duo), the offer of another queue where there is one, and Swap (one request). The
  rules are the page's (BUILD_RULES, held equal to src/domain/champion-builds.ts by the unit test):
  every shown choice from 10 games and a tenth of its part, its win and pick rates as counted, each
  win rate's likely range in its ⓘ and the small ones greyed, a "Highest win rate" choice only from
  30 games and 15% of its part, 2 points and 99% clearly above the most common (Newcombe's interval
  re-computed from the page's own counts), the queue one at a time, both columns of Compare on the
  same queue, each part's row level across them. Read in the page only: counts, true or false, px
  and the page's fixed words; the champions are never named in a fact (the live check hides their
  names from everything it writes).
*/

import { BUILDS_LINE, FEW_LINE, QUEUE_NAMES } from "./champion-lookup-facts.mjs";

/** The page's rules (src/domain/champion-builds.ts; the unit test holds them equal). */
export const BUILD_RULES = { section: 20, part: 20, choiceGames: 10, choiceShare: 0.1, performerGames: 30, performerShare: 0.15, performerZ: 2.5758293035489004, margin: 0.02, firmGames: 30 };
const Z_95 = 1.959963984540054;
const PARTS = ["runes", "shards", "spells", "skills", "start", "boots", "core"];
const TIMELINE_PARTS = ["skills", "start", "boots", "core"];

/** The Wilson score interval of wins of games (95% by default); null without games. */
export function wilson(wins, games, z = Z_95) {
  if (!(games > 0)) return null;
  const p = Math.min(Math.max(wins / games, 0), 1);
  const z2 = z * z;
  const centre = (p + z2 / (2 * games)) / (1 + z2 / games);
  const half = (z / (1 + z2 / games)) * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** Newcombe's (1998) interval of a − b from the two Wilson intervals (method 10); null without games. */
export function newcombe(a, b, z = Z_95) {
  const ia = wilson(a.wins, a.games, z);
  const ib = wilson(b.wins, b.games, z);
  if (!ia || !ib) return null;
  const pa = a.wins / a.games;
  const pb = b.wins / b.games;
  const d = pa - pb;
  return { low: d - Math.hypot(pa - ia.low, ib.high - pb), high: d + Math.hypot(ia.high - pa, pb - ib.low) };
}

/** The probe from the environment ("Thresh:solo,Leona:solo"), or the demo's champions for a local run. */
export function probeFrom(value, local) {
  const parsed = String(value ?? "")
    .split(",")
    .map((p) => /^([A-Za-z0-9]{1,40}):(solo|flex|draft|clash)$/.exec(p.trim()))
    .filter(Boolean)
    .map((m) => ({ champion: m[1], queue: m[2] }));
  if (parsed.length) return parsed.slice(0, 2);
  return local ? [{ champion: "Thresh", queue: "solo" }, { champion: "Leona", queue: "solo" }] : [];
}

/** The page's address for the probe: both champions (or one), the queue left out for Ranked Solo/Duo. */
export function probePath(probe) {
  const [a, b] = probe;
  const q = new URLSearchParams();
  q.set("champion", a.champion);
  if (b) q.set("champion2", b.champion);
  if (a.queue !== "solo") q.set("queue", a.queue);
  return `/lookup?${q.toString()}`;
}

/** Both columns' builds sections, read in the page (Playwright's evaluate: self-contained). */
export function readBuildsColumns() {
  const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const num = (el, attr) => (el?.hasAttribute(attr) ? Number(el.getAttribute(attr)) : null);
  const tipOf = (button) => {
    const id = button?.getAttribute("aria-describedby");
    return id ? text(document.getElementById(id)) : "";
  };
  const columns = [1, 2]
    .map((n) => {
      const view = document.querySelector(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-builds-view"]`);
      if (!view) return null;
      const source = view.querySelector('[data-testid="lookup-build-source"]');
      const queue = view.querySelector('[data-testid="lookup-build-queue"]');
      const offer = view.querySelector('[data-testid="lookup-build-other-queue"]');
      return {
        n,
        status: view.getAttribute("data-status"),
        queue: view.getAttribute("data-queue"),
        source: view.getAttribute("data-source"),
        queueShown: queue ? (queue instanceof HTMLSelectElement ? text(queue.selectedOptions[0]) : text(queue.querySelector("[data-select-label]"))) : "",
        role: view.getAttribute("data-role"),
        roles: (view.getAttribute("data-roles") ?? "").split(",").filter(Boolean).map((x) => ({ role: x.split(":")[0], games: Number(x.split(":")[1]) })),
        mode: view.getAttribute("data-mode"),
        offersHighest: !!view.querySelector('[data-testid="lookup-build-mode"]'),
        line: source?.getAttribute("data-line") ?? "",
        games: num(source, "data-games"),
        patches: (source?.getAttribute("data-patches") ?? "").split(",").filter(Boolean),
        currentGames: num(source, "data-current-games"),
        timelineGames: num(source, "data-timeline-games"),
        few: text(view.querySelector('[data-testid="lookup-build-few"]')),
        offer: offer ? { queue: offer.getAttribute("data-queue"), text: text(offer) } : null,
        top: Math.round(view.getBoundingClientRect().top),
        parts: [...view.querySelectorAll('[data-testid="lookup-build-part"]')].map((r) => {
          const win = r.querySelector('[data-testid="lookup-build-win"]');
          const firm = r.querySelector("[data-firm]");
          return {
            part: r.getAttribute("data-part") ?? "",
            state: r.getAttribute("data-state") ?? "",
            choice: r.getAttribute("data-choice"),
            games: num(r, "data-games"),
            wins: num(r, "data-wins"),
            total: num(r, "data-total"),
            key: r.getAttribute("data-key"),
            commonGames: num(r, "data-common-games"),
            commonWins: num(r, "data-common-wins"),
            commonKey: r.getAttribute("data-common-key"),
            fourth: r.hasAttribute("data-fourth-games") ? { games: num(r, "data-fourth-games"), total: num(r, "data-fourth-total") } : null,
            fifth: r.hasAttribute("data-fifth-games") ? { games: num(r, "data-fifth-games"), total: num(r, "data-fifth-total") } : null,
            win: text(win),
            pick: text(r.querySelector('[data-testid="lookup-build-pick"]')),
            tip: tipOf(win),
            firm: firm ? firm.getAttribute("data-firm") === "true" : null,
            greyed: firm ? firm.classList.contains("text-fg-subtle") : null,
            pictures: r.querySelectorAll('[data-testid="lookup-build-choice"] img, [data-testid="lookup-build-choice"] [role=img]').length,
            top: Math.round(r.getBoundingClientRect().top),
          };
        }),
        // A Riot ID ("Name#TAG") or an account id (a long unbroken token) anywhere in the section, text or attributes.
        identity: (() => {
          const said = [view.textContent ?? "", ...[...view.querySelectorAll("*")].flatMap((e) => [...e.attributes].map((a) => a.value))].join(" ");
          return /#[A-Za-z0-9]{2,5}\b/.test(said) || /[A-Za-z0-9_-]{60,}/.test(said);
        })(),
        scrollers: [...view.querySelectorAll("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length,
      };
    })
    .filter(Boolean);
  return { url: location.pathname + location.search, queueInAddress: new URLSearchParams(location.search).get("queue"), loads: performance.getEntriesByType("navigation").length, mark: !!window.__buildsMark, columns };
}

const pct = (x) => `${Math.round(x * 100)}%`;
const publicPatch = (patch) => {
  const m = /^(\d+)\.(\d+)/.exec(patch ?? "");
  if (!m) return null;
  const major = Number(m[1]);
  return `${major >= 15 && major < 25 ? major + 10 : major}.${Number(m[2])}`;
};

/** What is wrong with one column's shown section, as short reasons (empty: nothing). Counts and the page's words only. */
export function sectionProblems(col, rules = BUILD_RULES) {
  const out = [];
  if (col.status !== "shown") return ["not shown"];
  if (!BUILDS_LINE.test(col.line)) out.push("source line");
  if (!(col.games >= rules.section)) out.push("section games");
  if (col.patches.length === 2 ? !(col.currentGames < rules.section) : col.patches.length !== 1) out.push("window");
  if (col.currentGames > col.games) out.push("current games");
  const parts = col.parts.map((p) => p.part);
  for (const p of [...PARTS, "full"]) if (!parts.includes(p)) out.push(`${p} missing`);
  for (const p of col.parts.filter((x) => PARTS.includes(x.part))) {
    if (p.state === "few" ? !(p.total < rules.part) : !(p.total >= rules.part)) out.push(`${p.part} state`);
    if (p.total > col.games || (TIMELINE_PARTS.includes(p.part) && col.timelineGames !== null && p.total > col.timelineGames)) out.push(`${p.part} total`);
    if (p.state !== "shown") continue;
    // The most common, or in the other view the highest win rate's: each from 10 games and a tenth of its part.
    if (!(p.games >= rules.choiceGames) || !(p.games / p.total >= rules.choiceShare)) out.push(`${p.part} threshold`);
    if (p.win !== pct(p.wins / p.games) || p.pick !== pct(p.games / p.total)) out.push(`${p.part} figures`);
    if (!/likely \d{1,3}–\d{1,3}%/.test(p.tip)) out.push(`${p.part} range`);
    if (p.firm !== p.games >= rules.firmGames || p.greyed !== !p.firm) out.push(`${p.part} small sample`);
    if (p.part !== "skills" && p.pictures === 0) out.push(`${p.part} icons`);
  }
  for (const f of col.parts.filter((x) => x.part === "full" && x.state === "shown")) {
    for (const later of [f.fourth, f.fifth].filter(Boolean)) if (!(later.games >= rules.choiceGames) || !(later.games / later.total >= rules.choiceShare)) out.push("full later items");
  }
  return out;
}

/** What is wrong with the "Highest win rate" view's rows (the view open): each such row's rule, re-computed. */
export function highestProblems(col, rules = BUILD_RULES) {
  const out = [];
  const rows = col.parts.filter((p) => p.choice === "highest" && PARTS.includes(p.part));
  if (!rows.length) out.push("no row differs");
  for (const p of rows) {
    const d = newcombe({ wins: p.wins, games: p.games }, { wins: p.commonWins, games: p.commonGames }, rules.performerZ);
    const ok = p.games >= rules.performerGames && p.games / p.total >= rules.performerShare && p.key !== p.commonKey && p.wins / p.games - p.commonWins / p.commonGames >= rules.margin && !!d && d.low > 0;
    if (!ok) out.push(`${p.part} rule`);
  }
  return out;
}

/**
 * What the check asserts on the builds champions (`probe`): the page as it opened (`at`), the
 * "Highest win rate" view where offered (`highest`), each other role of the first column (`roles`),
 * Ranked Flex chosen in the page (`flex`), the offer pressed where there was one (`offered`), Ranked
 * Solo/Duo chosen again (`back`), Swap (`swapped`), and /api/health's patch. An undefined read was
 * not reached (named in the fact that needed it). No champion's name in any fact.
 */
export function buildsVerdicts({ kind, probe, at, highest, roles = [], flex, offered, back, swapped, healthPatch }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: builds champion: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  const warn = (name, detail) => out.push({ name: `${kind}: builds champion: ${name}`, status: "WARN", detail });
  if (!probe?.length) {
    warn("not applicable: no champion has enough games on this patch window yet (or no probe from the builds audit)", null);
    return out;
  }
  const queue = probe[0].queue;
  const cols = at?.columns ?? [];
  fact(`the champion${probe.length > 1 ? "s" : ""} the team's data has builds for show${probe.length > 1 ? "" : "s"} them`, cols.length === probe.length && cols.every((c) => c.status === "shown"), { columns: cols.map((c) => c.status) });
  fact(
    queue === "solo" ? "the builds open on Ranked Solo/Duo, and the address names no queue" : "the builds open on the queue the address names",
    cols.every((c) => c.queue === queue && c.queueShown === QUEUE_NAMES[queue] && c.source === "team") && (queue === "solo" ? at.queueInAddress === null : at.queueInAddress === queue),
    { queues: cols.map((c) => c.queue), shown: cols.map((c) => c.queueShown), inAddress: at?.queueInAddress ?? null },
  );
  const game = publicPatch(healthPatch ?? null);
  const newest = cols.map((c) => {
    const m = BUILDS_LINE.exec(c.line);
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
  });
  if (game) fact("the source line's newest patch is /api/health's", newest.every((p) => p === game), { newest, game });
  const problems = cols.map((c) => sectionProblems(c));
  fact("every part shown with its thresholds kept (10 games and a tenth of its part), its win and pick rates as counted, its likely range in its ⓘ, small samples greyed, items and skills within the games with a timeline", problems.every((p) => p.length === 0), { problems });
  fact("no Riot ID or account id in the builds", cols.every((c) => !c.identity), { identity: cols.map((c) => c.identity) });
  if (cols.length === 2) {
    const level = PARTS.every((p) => {
      const [a, b] = cols.map((c) => c.parts.find((x) => x.part === p)?.top ?? null);
      return a !== null && b !== null && Math.abs(a - b) <= 1;
    });
    fact("Compare: each part's row level across the two champions' builds, nothing scrolling inside", level && cols.every((c) => c.scrollers === 0), { level, scrollers: cols.map((c) => c.scrollers) });
  }
  // "Highest win rate": offered only with a row that qualifies; each such row's rule re-computed from the page's own counts.
  const first = cols[0];
  if (first?.offersHighest) {
    const hp = highest ? highestProblems(highest.columns[0]) : ["not read"];
    fact("a \"Highest win rate\" choice comes from 30 games and 15% of its part, 2 points and 99% clearly above the most common (re-computed from its counts)", hp.length === 0, { problems: hp });
    if (highest) fact("the \"Highest win rate\" view keeps every other rule too", sectionProblems(highest.columns[0]).length === 0, { problems: sectionProblems(highest.columns[0]) });
  } else if (first) {
    fact("no \"Highest win rate\" view without a choice that qualifies: every row the most common", first.parts.every((p) => p.choice === "common"), { choices: first.parts.map((p) => p.choice) });
  }
  // Each other role: its own games, the same rules.
  if (first && first.roles.length > 1) {
    const ok = roles.length === first.roles.length - 1 && roles.every((r) => {
      const c = r.columns[0];
      const asked = first.roles.find((x) => x.role === c.role);
      return !!asked && asked.games >= BUILD_RULES.section && c.games === asked.games && sectionProblems(c).length === 0;
    });
    fact("each other role offered has 20 games or more, and choosing it shows that role's own counts under the same rules", ok, { roles: first.roles, read: roles.map((r) => ({ role: r.columns[0].role, games: r.columns[0].games, problems: sectionProblems(r.columns[0]) })) });
  }
  // The queue, the page's (D5): Ranked Flex chosen here with no page load, both columns on it, the address saying so.
  if (flex === undefined) fact("Ranked Flex chosen in the page (the queue choice could not be used)", false, null);
  else {
    const ok = flex.mark && flex.queueInAddress === "flex" && flex.columns.length === cols.length && flex.columns.every((c) => c.queue === "flex" && c.queueShown === QUEUE_NAMES.flex && (c.status === "shown" ? sectionProblems(c).length === 0 : FEW_LINE.test(c.few) && c.few.includes("Ranked Flex")));
    fact("Ranked Flex chosen in the page: both columns read it, with no page load, the address says queue=flex; its builds, or the honest line naming Ranked Flex", ok, { inAddress: flex.queueInAddress, noLoad: flex.mark, columns: flex.columns.map((c) => ({ queue: c.queue, status: c.status })) });
    const withOffer = flex.columns.find((c) => c.offer);
    if (withOffer && offered) fact("the offer of another queue opens that queue's builds, which the reader chose", offered.columns[withOffer.n - 1]?.queue === withOffer.offer.queue && offered.columns[withOffer.n - 1]?.status === "shown", { offered: withOffer.offer.queue, then: offered.columns.map((c) => ({ queue: c.queue, status: c.status })) });
    for (const c of flex.columns.filter((x) => x.status === "few" && !x.offer)) if (c) warn("no other queue offered beside Ranked Flex's honest line (no other queue has builds for it)", null);
  }
  if (back !== undefined) fact("Ranked Solo/Duo chosen again: the address names no queue, both columns on it", back.queueInAddress === null && back.columns.every((c) => c.queue === "solo"), { inAddress: back.queueInAddress, queues: back.columns.map((c) => c.queue) });
  if (cols.length === 2) {
    if (swapped === undefined) fact("Swap keeps the page's queue (Swap could not be used)", false, null);
    else fact("Swap keeps the page's queue in the address and both columns", swapped.queueInAddress === "flex" && swapped.columns.every((c) => c.queue === "flex"), { inAddress: swapped.queueInAddress, queues: swapped.columns.map((c) => c.queue) });
  }
  return out;
}
