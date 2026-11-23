/*
  THE OPENED GAME'S POST-GAME VIEW in the Production check (scripts/live-check.mjs, postGameFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; PLAN §6 rows 5.2–5.8): one game of the teammate's Match
  History, open under its card on the desktop, read in the page, and what the check asserts about it,
  apart from the browser so a unit test can hand it any state (src/server/ops/live-check-post-game.test.ts).

  Since 23 Nov 2026 (the owner's request) the view has no written notes (Went well, Went wrong, Focus
  next) and no folds (Gold over the game, Build and skill order): the check asserts they are gone, as
  it asserts what stays (the result, the loadout, the six figures, the lane, the steps).

  Read in the page only: counts, true or false, the result word and the lane's fixed words. No
  player's name, no champion and no address leaves the page.
*/

/** The removed sections' names, as the view showed them (any one on screen is a regression). */
export const REMOVED_WORDS = ["Went well", "Went wrong", "Focus next", "Gold over the game", "Build and skill order"];

/** The open game under its card, read in the page (self-contained, for evaluate). */
export function readPostGame() {
  const clean = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const li = document.querySelector("li[data-expanded]");
  if (!li) return { open: false };
  const header = li.querySelector("[data-testid=match-card-header]");
  const items = li.querySelector("[data-testid=post-game-items]");
  const breakdown = li.querySelector("[data-testid=match-breakdown]");
  // Each figure's own words, counted over the game.
  const leaves = [...li.querySelectorAll("span, p, div, td")].filter((e) => e.children.length === 0).map(clean);
  const count = (re) => leaves.filter((t) => re.test(t)).length;
  const lane = li.querySelector("[data-testid=post-game-lane]");
  // The removed sections: by their test ids, and by their names anywhere in the open game's text (the
  // list above it, the card's own line and the scoreboard never use these words).
  const words = ["Went well", "Went wrong", "Focus next", "Gold over the game", "Build and skill order"];
  const text = clean(breakdown);
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
    // The timeline's answer, which the lane's 10:00 and 15:00 read: "loading", "ok", or why not.
    timeline: breakdown?.getAttribute("data-timeline") ?? null,
    removed: {
      parts: li.querySelectorAll("[data-testid=post-game-notes], [data-testid=post-game-notes-loading], [data-testid=post-game-note], [data-testid=post-game-folds], [data-testid=fold-gold], [data-testid=fold-build], [data-testid=gold-chart], [data-testid=skill-order]").length,
      words: words.filter((w) => text.includes(w)).length,
    },
    steps: ["game-header-prev", "game-header-next", "game-header-close", "game-prev", "game-next", "match-close"].filter((t) => li.querySelector(`[data-testid=${t}]`)).length,
  };
}

/**
 * What the check asserts about the open game (`at`, readPostGame). Each verdict: its name, PASS,
 * FAIL or WARN, and what was found.
 */
export function postGameVerdicts({ kind, at }) {
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
  fact("the loadout: two summoner spells, the keystone and the secondary tree", at.spellRuneSlots === 4, { spellRuneSlots: at.spellRuneSlots });
  // An older stored game has no rune page (its perks were not kept): the line is left out by design.
  if (!at.runePage) out.push({ name: `${kind}: skipped: this game's rune page was not stored (the rune line)`, status: "WARN", detail: { runePage: false } });
  fact("each figure once: the KDA, CS per minute and the damage share, in six tiles", at.tiles === 6 && at.kda === 1 && at.csPerMin <= 1 && at.damageShare <= 1, { tiles: at.tiles, kda: at.kda, csPerMin: at.csPerMin, damageShare: at.damageShare });
  fact('the lane section, or its "Lane opponent not clear in this game" line', (at.lane === "clear" && at.laneWords === "Lane vs") || (at.lane === "unclear" && at.laneWords === "Lane opponent not clear in this game"), { lane: at.lane });
  // The lane's 10:00 and 15:00 wait for the game's timeline, which a first view may still be asking Riot for.
  if (at.timeline === "loading") out.push({ name: `${kind}: skipped: the game's timeline had not answered after 30 s (the lane's 10:00 and 15:00)`, status: "WARN", detail: { timeline: "loading" } });
  const removed = at.removed ?? { parts: NaN, words: NaN };
  fact("no notes (Went well, Went wrong, Focus next) and no folds (Gold over the game, Build and skill order)", removed.parts === 0 && removed.words === 0, removed);
  fact("Previous, Next and Close, in the game's header and its footer", at.steps === 6, { steps: at.steps });
  return out;
}
