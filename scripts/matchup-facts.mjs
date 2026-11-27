/*
  MATCHUP INTEL in the Production check (scripts/live-check.mjs, matchupFacts; docs/LIVE_VALIDATION.md,
  "What it checks"; docs/MATCHUP_INTEL.md): Champion Intel's Compare with a lane, read in the page,
  and what the check asserts about it, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-matchup.test.ts).

  One page load of a common pair in a lane (Ahri against Zed in Mid) at the check's 1440 × 900, the
  band waited for (streamed after the abilities); then Swap (one request), read again. On production
  data, whatever it holds: the band's blocks named in words (the team's block only for an account that
  may see teammates' statistics; the verification account may), the lane in the control and the
  address, each of Riot's differences equal to the two columns' own figures, the team's figures from
  ten games with their 95% ranges or the honest line, the notes labelled by their review or hidden
  with why, no instruction or verdict words, no player named, and the band and both champions' five
  abilities on one screen. Read in the page only: counts, true or false, px, numbers and the page's
  own fixed words; no name but champions'.

  The verdict words are the notes' own refused words (src/domain/matchup/refused-words-list.mjs, the
  one list the notes' save, the editor and the browser tests hold too), handed to the page as
  MATCHUP_READ and tested on each text of the band apart (each point, each source's title, each fixed
  sentence: two texts side by side, "Zed W" then "In lane…", are never read as one word). So a note
  the editor accepts can never fail this fact, and the fact refuses no word a note may hold. Only the
  listed word found is reported, never the page's text.
*/

import { REFUSED_FLAGS, refusedSources } from "../src/domain/matchup/refused-words-list.mjs";

/** What the page reader needs from outside the page (page.evaluate(readMatchup, MATCHUP_READ)): the refused words' patterns. */
export const MATCHUP_READ = { refused: refusedSources().map(({ word, source }) => ({ word, source })), flags: REFUSED_FLAGS };

/** What the band and the board show, read in the page (Playwright's evaluate: self-contained; `words` is MATCHUP_READ). */
export function readMatchup(words) {
  const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const band = document.querySelector('[data-testid="matchup-band"]');
  const team = band?.querySelector('[data-testid="matchup-team"]') ?? null;
  const notes = band?.querySelector('[data-testid="matchup-notes"]') ?? null;
  const riot = band?.querySelector('[data-testid="matchup-riot"]') ?? null;
  const panels = [...document.querySelectorAll('[data-testid="lookup-panel"]')];
  const panel = (n) => panels.find((p) => p.getAttribute("data-panel") === String(n)) ?? null;
  const range = (n) => text(panel(n)?.querySelector('[data-testid="lookup-facts"] [data-testid="lookup-range"]')).replace(/,/g, "");
  const kit = [...(riot?.querySelectorAll('[data-testid="matchup-kit-line"]') ?? [])].map((l) => ({ key: l.getAttribute("data-key"), values: l.getAttribute("data-values"), more: l.getAttribute("data-more"), words: text(l.querySelector("dd")) }));
  const share = (id) => {
    const el = team?.querySelector(`[data-testid="${id}"]`);
    return el ? { n: Number(el.getAttribute("data-n")), of: Number(el.getAttribute("data-of")), low: Number(el.getAttribute("data-low") ?? "NaN"), high: Number(el.getAttribute("data-high") ?? "NaN"), words: text(el.querySelector("dd [aria-hidden]") ?? el.querySelector("dd")) } : null;
  };
  // The band's own words: Riot's quoted descriptions are elsewhere (the rows), never in the band.
  const own = text(band);
  // Each text of the band apart, against the notes' refused words (none handed in: not read, and the fact fails).
  const refused = Array.isArray(words?.refused) ? words.refused.map((r) => ({ word: r.word, pattern: new RegExp(r.source, words.flags) })) : null;
  const texts = [];
  if (band) {
    const walk = document.createTreeWalker(band, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) texts.push(t);
    }
  }
  const verdictWord = refused ? (refused.find((r) => texts.some((t) => r.pattern.test(t)))?.word ?? null) : null;
  const lowest = Math.max(...["P", "Q", "W", "E", "R"].flatMap((slot) => [1, 2].map((n) => document.querySelector(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-ability"][data-slot="${slot}"]`)?.getBoundingClientRect().bottom ?? Infinity)));
  const scrolls = (el) => {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY + st.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  };
  const lane = document.querySelector('[data-testid="lookup-lane"] [aria-checked="true"]');
  return {
    size: `${innerWidth}x${innerHeight}`,
    innerHeight,
    url: location.pathname + location.search,
    band: !!band,
    bandLane: band?.getAttribute("data-lane") ?? null,
    a: band?.getAttribute("data-a") ?? null,
    b: band?.getAttribute("data-b") ?? null,
    champion: panel(1)?.getAttribute("data-champion") ?? null,
    secondChampion: panel(2)?.getAttribute("data-champion") ?? null,
    sides: [text(panel(1)?.querySelector('[data-testid="lookup-side"]')), text(panel(2)?.querySelector('[data-testid="lookup-side"]'))],
    lanePressed: lane?.getAttribute("data-value") ?? null,
    headings: [...(band?.querySelectorAll("h3") ?? [])].map(text),
    ranges: [range(1), range(2)],
    kit,
    team: team ? { state: team.getAttribute("data-state"), games: Number(team.getAttribute("data-games")), queue: team.getAttribute("data-queue"), ahead: share("matchup-ahead"), won: share("matchup-won"), percents: (text(team).match(/\d+%/g) ?? []).length, line: text(team.querySelector('[data-testid="matchup-team-line"]')) } : null,
    notes: notes ? { state: notes.getAttribute("data-state"), shown: [...notes.querySelectorAll('[data-testid="matchup-note"]')].map((n) => ({ freshness: n.getAttribute("data-freshness"), reviewed: n.getAttribute("data-reviewed") })), hidden: [...notes.querySelectorAll('[data-testid="matchup-note-hidden"]')].map((n) => ({ freshness: n.getAttribute("data-freshness"), words: text(n) })), meta: text(notes.querySelector('[data-testid="matchup-notes-meta"]')) } : null,
    verdictWords: refused ? verdictWord !== null : null,
    verdictWord,
    identity: /#[A-Za-z0-9]{2,5}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|[A-Za-z0-9_-]{60,}/.test(own),
    bandBottom: band ? Math.round(band.getBoundingClientRect().bottom) : null,
    lastBottom: Number.isFinite(lowest) ? Math.round(lowest) : null,
    scrollers: [...document.querySelectorAll("main *")].filter(scrolls).length,
  };
}

/** The current patch in the notes' words ("26.23"), from /api/health's internal one ("16.23"); null for none. */
const publicPatch = (p) => {
  const m = /^(\d+)\.(\d+)$/.exec(p ?? "");
  if (!m) return null;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${Number(m[2])}` : p;
};

/** The facts, PASS or FAIL each, from the reads (a unit test hands any state). */
export function matchupVerdicts({ at, swapped, stopped, healthPatch, mayStats = true }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name, status: ok ? "PASS" : "FAIL", detail: detail ?? null });
  const want = ["Reviewed notes", ...(mayStats ? ["In the team's matches"] : []), "From Riot's data"];
  fact("Compare with a lane shows Matchup Intel's band above the board, its blocks named in words (Reviewed notes, In the team's matches for an account that may see teammates' statistics, From Riot's data)", at.band && at.bandLane === "MID" && want.every((h) => at.headings.includes(h)) && at.headings.length === want.length, { band: at.band, lane: at.bandLane, headings: at.headings });
  fact("the lane control shows Mid pressed and the address carries lane=MID; the columns say which side is played and which is against", at.lanePressed === "MID" && /[?&]lane=MID(&|$)/.test(at.url) && at.sides[0] === "Playing" && at.sides[1] === "Against", { pressed: at.lanePressed, url: at.url, sides: at.sides });
  const kitOk = (r) =>
    r.kit.length >= 1 &&
    r.kit.every((l) => {
      const [a, b] = String(l.values ?? "").split(",").map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (a === b) return l.words === "the same" && !l.more;
      const more = a > b ? r.a : r.b;
      const diff = Math.round(Math.abs(a - b) * 10_000) / 10_000;
      const m = /^([\d,]+(?:\.\d+)?) more for (.+)$/.exec(l.words);
      return l.more === more && !!m && Number(m[1].replace(/,/g, "")) === diff;
    }) &&
    (() => {
      const range = r.kit.find((l) => l.key === "attackrange");
      return !range || range.values === `${r.ranges[0]},${r.ranges[1]}`;
    })();
  fact("From Riot's data: each difference is of one quantity, in neutral words, and equals the two columns' own figures (attack range from each column's facts)", kitOk(at), { lines: at.kit.length, ranges: at.ranges, attack: at.kit.find((l) => l.key === "attackrange")?.values ?? null });
  if (mayStats) {
    const t = at.team;
    const shareOk = (s) => !!s && s.of === t.games && s.n >= 0 && s.n <= s.of && s.low <= s.n / s.of + 1e-9 && s.high >= s.n / s.of - 1e-9 && s.low >= 0 && s.high <= 1;
    const ok = !!t && (t.state === "shown" ? t.games >= 10 && shareOk(t.ahead) && shareOk(t.won) && /\(\d+–\d+%\)/.test(t.ahead.words) : t.state === "few" || t.state === "none" ? t.percents === 0 && t.games < 10 : t.state === "mirror" || t.state === "unavailable");
    fact("In the team's matches: the figures from 10 games, each share with its 95% range, or the honest line with fewer: never a percentage from fewer than 10", ok, { state: t?.state ?? null, games: t?.games ?? null, queue: t?.queue ?? null, percents: t?.percents ?? null });
    fact("the team's figures are Ranked Solo/Duo by default: one queue, never mixed", !!t && t.queue === "solo" && !/[?&]queue=/.test(at.url), { queue: t?.queue ?? null });
  }
  const current = publicPatch(healthPatch);
  const n = at.notes;
  const notesOk = !!n && (n.state === "none" || n.state === "shown" || n.state === "unavailable") && n.shown.every((s) => (s.freshness === "fresh" && (!current || s.reviewed === current || /^\d+\.\d+$/.test(s.reviewed ?? ""))) || s.freshness === "stale") && n.hidden.every((h) => /^A reviewed note is hidden: /.test(h.words)) && (n.shown.every((s) => s.freshness !== "stale") || /not re-checked/.test(n.meta));
  fact("Reviewed notes: none, or each shown note labelled with its review patch (not re-checked when two or three patches old), a hidden note saying why", notesOk, { state: n?.state ?? null, shown: n?.shown.length ?? null, hidden: n?.hidden.length ?? null, meta: n?.meta ?? null });
  fact("no instruction or verdict words in the band (the notes' refused words: you, should, counter, favoured, faster, wins…)", at.verdictWords === false && (!swapped || swapped.verdictWords === false), { word: at.verdictWord ?? swapped?.verdictWord ?? null, read: at.verdictWords !== null });
  fact("no player named in the band: no Riot ID or account id", !at.identity && !(swapped?.identity ?? false), null);
  fact("one screen at 1440 × 900: the band and both champions' five abilities on it, nothing scrolling inside", at.size === "1440x900" && at.bandBottom !== null && at.lastBottom !== null && at.lastBottom <= at.innerHeight && at.scrollers === 0, { bandBottom: at.bandBottom, lastBottom: at.lastBottom, innerHeight: at.innerHeight, scrollers: at.scrollers });
  if (stopped) fact("Swap finished (a step that did not is named)", false, { stopped });
  else if (swapped) {
    const flipped = swapped.kit.every((l) => {
      const before = at.kit.find((k) => k.key === l.key);
      return !before || l.values === String(before.values).split(",").reverse().join(",");
    });
    fact("Swap keeps the lane, exchanges the champions and flips the direction (Riot's differences name the other champion, or 'the same')", swapped.champion === at.secondChampion && swapped.secondChampion === at.champion && /[?&]lane=MID(&|$)/.test(swapped.url) && swapped.bandLane === "MID" && swapped.a === at.b && flipped && kitOk(swapped), { champion: swapped.champion, second: swapped.secondChampion, url: swapped.url, flipped });
  }
  return out;
}
