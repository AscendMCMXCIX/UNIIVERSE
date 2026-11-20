/*
  THE OPENED GAME'S POST-GAME VIEW in the Production check (scripts/live-check.mjs, postGameFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; PLAN §6 rows 5.2–5.8): one game of the teammate's Match
  History, open under its card on the desktop, read in the page, and what the check asserts about it,
  apart from the browser so a unit test can hand it any state (src/server/ops/live-check-post-game.test.ts).

  The notes' word rules are the app's own: REFUSED_WORDS and MAX_WORDS are read from
  src/domain/match-notes.ts (the check runs from the repository's checkout), so the check and the app
  can never hold different lists; the unit test holds the reading to the module's exports.

  Read in the page only: counts, true or false, the result word and the notes' word counts. A note's
  text is checked in the page's reading here and never printed (only its word count and any refused
  word, one of the app's fixed list).
*/
import { readFileSync } from "node:fs";

/** The app's note rules, read from its source: { refused: string[], maxWords: number }. */
export function noteRules(source = readFileSync(new URL("../src/domain/match-notes.ts", import.meta.url), "utf8")) {
  const list = /export const REFUSED_WORDS = (\[[^\]]*\]) as const;/.exec(source);
  const max = /export const MAX_WORDS = (\d+);/.exec(source);
  if (!list || !max) throw new Error("src/domain/match-notes.ts: REFUSED_WORDS or MAX_WORDS not found");
  return { refused: JSON.parse(list[1]), maxWords: Number(max[1]) };
}

/** Words in a sentence, as the app counts them (match-notes.ts, wordCount). */
export const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/** The refused words a text contains, as the app finds them (match-notes.ts, refusedWordsIn): whole words, any case. */
export function refusedIn(text, refused) {
  const lower = text.toLowerCase();
  return refused.filter((word) => new RegExp(`(^|[^a-z])${word.replace(" ", "\\s+")}([^a-z]|$)`).test(lower));
}

/** The open game under its card, read in the page (self-contained, for evaluate). */
export function readPostGame() {
  const clean = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const li = document.querySelector("li[data-expanded]");
  if (!li) return { open: false };
  const header = li.querySelector("[data-testid=match-card-header]");
  const items = li.querySelector("[data-testid=post-game-items]");
  const notes = li.querySelector("[data-testid=post-game-notes]");
  // Each figure's own words, counted over the game, its notes left out (a note may quote a figure by design).
  const leaves = [...li.querySelectorAll("span, p, div, td")].filter((e) => !e.closest("[data-testid=post-game-notes]") && e.children.length === 0).map(clean);
  const count = (re) => leaves.filter((t) => re.test(t)).length;
  const lane = li.querySelector("[data-testid=post-game-lane]");
  return {
    open: true,
    result: clean(header?.querySelector(":scope > span > span:first-child")),
    // The inventory: six items and the trinket, or the line saying they were not recorded.
    itemSlots: items ? items.children.length : 0,
    itemsNotRecorded: /^Items not recorded$/.test(clean(items)),
    trinketRound: !!items?.children[3] && (items.children[3].className + " " + (items.children[3].firstElementChild?.className ?? "")).includes("rounded-full"),
    // The two spells, the keystone and the secondary tree beside the portrait, and the rune page's line.
    spellRuneSlots: items?.previousElementSibling ? items.previousElementSibling.children.length : 0,
    runePage: !!li.querySelector("[data-testid=rune-page]"),
    tiles: li.querySelectorAll("[data-testid=post-game-figures] > *").length,
    kda: count(/^(\d+\.\d\d KDA|Perfect KDA)$/),
    csPerMin: count(/^\d+\.\d \/ min$/),
    damageShare: count(/^\d+% of team$/),
    lane: lane?.getAttribute("data-state") ?? null,
    laneWords: lane?.getAttribute("data-state") === "unclear" ? clean(lane) : /^Lane vs/.test(clean(lane?.querySelector("th"))) ? "Lane vs" : "",
    notesShown: !!notes,
    notesFallback: !!li.querySelector("[data-testid=notes-fallback], [data-testid=timeline-missing]"),
    sections: notes ? { well: Number(notes.getAttribute("data-well")), wrong: Number(notes.getAttribute("data-wrong")), focus: Number(notes.getAttribute("data-focus")) } : null,
    notes: notes ? [...notes.querySelectorAll("[data-testid=post-game-note]")].map(clean) : [],
    steps: ["game-header-prev", "game-header-next", "game-header-close", "game-prev", "game-next", "match-close"].filter((t) => li.querySelector(`[data-testid=${t}]`)).length,
  };
}

/**
 * What the check asserts about the open game (`at`, readPostGame), with the app's note rules
 * (`rules`, noteRules()). Each verdict: its name, PASS, FAIL or WARN, and what was found.
 */
export function postGameVerdicts({ kind, at, rules }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!at?.open) {
    fact("the opened game's post-game view is there", false, { open: false });
    return out;
  }
  const said = ["Victory", "Defeat", "No result"].includes(at.result);
  fact("the opened game says its result (Victory, Defeat or No result)", said, { result: said ? at.result : `other words (${(at.result ?? "").length} characters)` });
  if (at.itemsNotRecorded) out.push({ name: `${kind}: skipped: this game's items were not recorded (the six slots and the trinket)`, status: "WARN", detail: { itemSlots: 0 } });
  else fact("the loadout: six item slots and the trinket (round, beside the first row)", at.itemSlots === 7 && at.trinketRound, { itemSlots: at.itemSlots, trinketRound: at.trinketRound });
  fact("the loadout: two summoner spells, the keystone and the secondary tree, and the rune page's line", at.spellRuneSlots === 4 && at.runePage, { spellRuneSlots: at.spellRuneSlots, runePage: at.runePage });
  fact("each figure once: the KDA, CS per minute and the damage share, in six tiles", at.tiles === 6 && at.kda === 1 && at.csPerMin <= 1 && at.damageShare <= 1, { tiles: at.tiles, kda: at.kda, csPerMin: at.csPerMin, damageShare: at.damageShare });
  fact('the lane section, or its "Lane opponent not clear in this game" line', (at.lane === "clear" && at.laneWords === "Lane vs") || (at.lane === "unclear" && at.laneWords === "Lane opponent not clear in this game"), { lane: at.lane });
  if (!at.notesShown) {
    if (at.notesFallback) out.push({ name: `${kind}: skipped: this game has no timeline, so no notes were read`, status: "WARN", detail: { notes: 0 } });
    else fact("the notes, or the line saying why there are none", false, { notesShown: false });
  } else {
    const s = at.sections ?? { well: NaN, wrong: NaN, focus: NaN };
    const words = at.notes.map(wordCount);
    const refused = [...new Set(at.notes.flatMap((n) => refusedIn(n, rules.refused)))];
    const numberless = at.notes.filter((n) => !/\d/.test(n)).length;
    fact(`the notes: at most 2 went well, 2 went wrong and 1 focus, each with a number, at most ${rules.maxWords} words and no refused word`, s.well <= 2 && s.wrong <= 2 && s.focus <= 1 && at.notes.length === s.well + s.wrong + s.focus && numberless === 0 && words.every((w) => w <= rules.maxWords) && refused.length === 0, { ...s, words, numberless, refused });
  }
  fact("Previous, Next and Close, in the game's header and its footer", at.steps === 6, { steps: at.steps });
  return out;
}
