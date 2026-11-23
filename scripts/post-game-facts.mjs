/*
  THE OPENED GAME'S POST-GAME VIEW in the Production check (scripts/live-check.mjs, postGameFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; PLAN §6 rows 5.2–5.8): one game of the teammate's Match
  History, open under its card on the desktop, read in the page, and what the check asserts about it,
  apart from the browser so a unit test can hand it any state (src/server/ops/live-check-post-game.test.ts).

  Since 23 Nov 2026 (the owner's request) the view has no written notes (Went well, Went wrong, Focus
  next) and no gold curve (Gold over the game): the check asserts they are gone. Release 16 brought
  Build Path | Skill Order | Runes back as three segmented headings above the lane (no longer the
  fold "Build and skill order"), the performance score beside each of the ten players with one MVP
  and one ACE, and the inspection of any player: the check asserts the headings, the ten scores and,
  after a press on another player's row, that the view follows that player (switchVerdicts).

  Read in the page only: counts, true or false, places in the record (0–9), scores (0–10), the result
  word and the lane's fixed words. No player's name, no champion and no address leaves the page.
*/

/** The removed sections' names, as the view showed them (any one on screen is a regression). */
export const REMOVED_WORDS = ["Went well", "Went wrong", "Focus next", "Gold over the game"];

/** The three segmented headings above the lane, in order (Release 16). */
export const PANEL_WORDS = ["Build Path", "Skill Order", "Runes"];

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
  const words = ["Went well", "Went wrong", "Focus next", "Gold over the game"];
  const text = clean(breakdown);
  const panels = li.querySelector("[data-testid=participant-panels]");
  const scores = [...li.querySelectorAll("[data-testid=participant-score]")];
  return {
    open: true,
    result: clean(header?.querySelector(":scope > span > span:first-child")),
    // The inventory: six items and the trinket, or the line saying they were not recorded.
    itemSlots: items ? items.children.length : 0,
    itemsNotRecorded: /^Items not recorded$/.test(clean(items)),
    trinketRound: !!items?.children[3] && (items.children[3].className + " " + (items.children[3].firstElementChild?.className ?? "")).includes("rounded-full"),
    // The two spells, the keystone and the secondary tree beside the portrait.
    spellRuneSlots: items?.previousElementSibling ? items.previousElementSibling.children.length : 0,
    tiles: li.querySelectorAll("[data-testid=post-game-figures] > *").length,
    kda: count(/^(\d+\.\d\d KDA|Perfect KDA)$/),
    csPerMin: count(/^\d+\.\d \/ min$/),
    damageShare: count(/^\d+% of team$/),
    lane: lane?.getAttribute("data-state") ?? null,
    laneWords: lane?.getAttribute("data-state") === "unclear" ? clean(lane) : /^Lane vs/.test(clean(lane?.querySelector("th"))) ? "Lane vs" : "",
    // The timeline's answer, which the lane's 10:00 and 15:00, the build path, the skill order and the scores read: "loading", "ok", or why not.
    timeline: breakdown?.getAttribute("data-timeline") ?? null,
    // Build Path | Skill Order | Runes above the lane: the headings' words, and what the one shown holds.
    panels: panels
      ? {
          words: [...panels.querySelectorAll("[data-testid=panel-tabs] [role=radio]")].map(clean),
          above: !!lane && !!(panels.compareDocumentPosition(lane) & Node.DOCUMENT_POSITION_FOLLOWING),
          // The build path's visits, or the plain line saying the timeline is not there.
          path: panels.querySelectorAll("[data-testid=build-visit]").length,
          missing: !!panels.querySelector("[data-testid=panel-timeline-missing]"),
        }
      : null,
    // The ten players' scores (a removed player has none), each 0–10 with one decimal, and MVP and ACE.
    scores: {
      rows: li.querySelectorAll("[data-testid=participant]").length,
      shown: scores.filter((s) => s.hasAttribute("data-score")).length,
      inRange: scores.filter((s) => s.hasAttribute("data-score")).every((s) => /^\d+(\.\d)?$/.test(s.getAttribute("data-score")) && Number(s.getAttribute("data-score")) >= 0 && Number(s.getAttribute("data-score")) <= 10),
      mvp: li.querySelectorAll("[data-testid=participant-mvp]").length,
      ace: li.querySelectorAll("[data-testid=participant-ace]").length,
      removed: li.querySelectorAll("[data-testid=participant][data-removed]").length,
      panel: !!li.querySelector("[data-testid=performance] [data-testid=performance-value]"),
    },
    removed: {
      parts: li.querySelectorAll("[data-testid=post-game-notes], [data-testid=post-game-notes-loading], [data-testid=post-game-note], [data-testid=post-game-folds], [data-testid=fold-gold], [data-testid=fold-build], [data-testid=gold-chart]").length,
      words: words.filter((w) => text.includes(w)).length,
    },
    steps: ["game-header-prev", "game-header-next", "game-header-close", "game-prev", "game-next", "match-close"].filter((t) => li.querySelector(`[data-testid=${t}]`)).length,
  };
}

/**
 * Who the open game shows (self-contained, for evaluate): the player inspected and the row marked
 * current, by place in the record, and whether the view's header names the same player as that row
 * (compared in the page: no name leaves it).
 */
export function readInspection() {
  const li = document.querySelector("li[data-expanded]");
  const breakdown = li?.querySelector("[data-testid=match-breakdown]");
  if (!breakdown) return { open: false };
  const current = breakdown.querySelectorAll("[data-testid=participant-select][aria-current=true]");
  const slot = current.length === 1 ? Number(current[0].getAttribute("data-slot")) : null;
  const row = slot === null ? null : breakdown.querySelector(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-name]`);
  const name = breakdown.querySelector("[data-testid=inspected-name]")?.textContent?.trim() ?? "";
  return {
    open: true,
    selected: Number(breakdown.getAttribute("data-selected")),
    current: slot,
    currents: current.length,
    headerMatchesRow: !!row && !!name && row.textContent.trim().startsWith(name),
    own: !!breakdown.querySelector("[data-testid=post-game-yours][data-own]"),
    panels: !!breakdown.querySelector("[data-testid=participant-panels]"),
    lane: !!breakdown.querySelector("[data-testid=post-game-lane]"),
    back: !!breakdown.querySelector("[data-testid=inspect-back]"),
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
  fact("each figure once: the KDA, CS per minute and the damage share, in six tiles", at.tiles === 6 && at.kda === 1 && at.csPerMin <= 1 && at.damageShare <= 1, { tiles: at.tiles, kda: at.kda, csPerMin: at.csPerMin, damageShare: at.damageShare });
  fact('the lane section, or its "Lane opponent not clear in this game" line', (at.lane === "clear" && at.laneWords === "Lane vs") || (at.lane === "unclear" && at.laneWords === "Lane opponent not clear in this game"), { lane: at.lane });
  // The lane's 10:00 and 15:00, the build path and the scores wait for the game's timeline, which a first view may still be asking Riot for.
  if (at.timeline === "loading") out.push({ name: `${kind}: skipped: the game's timeline had not answered after 30 s (the lane's 10:00 and 15:00, the build path and the scores)`, status: "WARN", detail: { timeline: "loading" } });
  const p = at.panels;
  fact("Build Path, Skill Order and Runes: three segmented headings above the lane", !!p && p.words.join("|") === PANEL_WORDS.join("|") && p.above, { words: p?.words.length ?? 0, above: p?.above ?? false });
  if (at.timeline !== "loading") {
    // With a timeline the build path shows its shop visits; without, one plain line says so (never a path guessed from the final items).
    const shown = at.timeline === "ok" ? (p?.path ?? 0) > 0 || !!p?.missing : !!p?.missing && (p?.path ?? 0) === 0;
    fact(at.timeline === "ok" ? "the build path from the timeline (its shop visits, or the line saying the player is not in it)" : "the build path's plain unavailable line, the game having no timeline", shown, { timeline: at.timeline, path: p?.path ?? 0, missing: p?.missing ?? false });
    const s = at.scores ?? { rows: 0, shown: 0, inRange: false, mvp: 0, ace: 0, removed: 0, panel: false };
    fact("a performance score 0–10 beside each of the ten players (a removed player has none), one MVP and one ACE, and the score panel", s.rows === 10 && s.shown === 10 - s.removed && s.inRange && s.mvp === 1 && s.ace === 1 && s.panel, s);
  }
  const removed = at.removed ?? { parts: NaN, words: NaN };
  fact("no notes (Went well, Went wrong, Focus next) and no gold curve (Gold over the game)", removed.parts === 0 && removed.words === 0, removed);
  fact("Previous, Next and Close, in the game's header and its footer", at.steps === 6, { steps: at.steps });
  return out;
}

/**
 * What the check asserts about inspecting another player (`before`, `after` and `back`:
 * readInspection as the game opened, after a press on another player's row, and after "Back to …"):
 * the view follows the row pressed (one row current, the header naming it, the headings and the lane
 * still there), and Back returns to the profile's player.
 */
export function switchVerdicts({ kind, before, after, back }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!before?.open || !after?.open) {
    fact("inspecting another player of the open game", false, { open: false });
    return out;
  }
  fact("as the game opens it shows the profile's player, their row the one marked current", before.own && before.currents === 1 && before.current === before.selected && before.headerMatchesRow, { own: before.own, currents: before.currents, current: before.current, selected: before.selected });
  fact("a press on another player's row shows that player: one row current, the header naming it, Build Path and the lane still there", after.selected !== before.selected && after.currents === 1 && after.current === after.selected && after.headerMatchesRow && after.panels && after.lane && !after.own && after.back, { selected: after.selected, current: after.current, currents: after.currents, panels: after.panels, lane: after.lane, back: after.back });
  fact('"Back to …" returns to the profile\'s player', !!back?.open && back.own && back.selected === before.selected && back.currents === 1, { selected: back?.selected ?? null, own: back?.own ?? false });
  return out;
}
