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

  The owner's brief of 24 Nov 2026 redrew the view as one integrated post-game screen: nothing in it
  scrolls, and on a desktop the card and its game fit the window at 100% text (readFit and
  fitVerdicts, at 1440 × 900 and 1280 × 720); the comparison select and table, the written "why",
  the team averages, the ten score tiles, the build path's legend and sideways row and the grey notes
  under the scoreboard were removed, and the check asserts they stay gone (REMOVED_WORDS, the parts'
  test ids). The owner's requirements of 25 Nov 2026 removed the score through the game (the chart
  under the scoreboard, its heading and its (i)), added to both lists, and gave every place one
  badge (MVP gold on the winning side, ACE violet on the losing side): the check asserts the MVP's
  row is on the team that won and the ACE's on the team that lost, and that the open card's header
  shows the game's score and place, the same as the player's row. The chart's room (review of 26
  Nov 2026): on a desktop's two columns the lane is under the scoreboard and the build panels take
  the height beside it, so the two columns end level (layoutVerdict, from readPostGame's layout).

  Read in the page only: counts, true or false, heights in px, places in the record (0–9), scores
  (0–10), the result word and the lane's fixed words. No player's name, no champion and no address
  leaves the page.
*/

/** The removed sections' names and sentences, as the view showed them (any one on screen is a regression). */
export const REMOVED_WORDS = ["Went well", "Went wrong", "Focus next", "Gold over the game", "No comparison", "Compare with", "Stood out:", "Held back by", "Ranks around the time of this game", "Ranks read later", "not enough recorded history", "no other players to assess", "inferred from", "skill points in this game", "All 18 skill points", "Maxed ", "Score through the game", "About the score through the game", "Minute-by-minute record incomplete for this game"];

/** The removed parts, by their test ids (the notes and folds of 23 Nov 2026; the comparison, the narrative, the strip, the legend and the sideways row of 24 Nov 2026; the score through the game of 25 Nov 2026). */
export const REMOVED_PARTS = "[data-testid=post-game-notes], [data-testid=post-game-notes-loading], [data-testid=post-game-note], [data-testid=post-game-folds], [data-testid=fold-gold], [data-testid=fold-build], [data-testid=gold-chart], [data-testid=performance-compare], [data-testid=performance-compare-table], [data-testid=performance-why], [data-testid=performance-teams], [data-testid=performance-strip], [data-testid=build-legend], [data-testid=build-row], [data-testid=score-chart-legend], [data-testid=inspected-jump], [data-testid=performance], [data-testid=performance-chart-area], [data-testid=performance-chart-info], [data-testid=performance-timeline-missing], [data-testid=score-chart], [data-testid=score-chart-table]";

/** The three segmented headings, in order, read before the lane (Release 16; from 26 Nov 2026 the lane sits under the scoreboard on a desktop). */
export const PANEL_WORDS = ["Build Path", "Skill Order", "Runes"];

/**
 * The open game, read in the page (self-contained, for evaluate): under its card (the flow: a tablet, a short
 * window), or in the one-screen workspace's game window (a desktop window in the gate, since 28 Nov 2026:
 * docs/RESPONSIVE.md, "One-screen desktop pages"), whose header line holds the result and the steps.
 */
export function readPostGame() {
  const clean = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const card = document.querySelector("li[data-expanded]");
  const li = card ?? document.querySelector("dialog[open][data-testid=match-detail]");
  if (!li) return { open: false };
  const where = card ? "card" : "window";
  const header = li.querySelector("[data-testid=match-card-header], [data-testid=match-detail-header]");
  const items = li.querySelector("[data-testid=post-game-items]");
  const breakdown = li.querySelector("[data-testid=match-breakdown]");
  // Each figure's own words, counted over the game.
  const leaves = [...li.querySelectorAll("span, p, div, td")].filter((e) => e.children.length === 0).map(clean);
  const count = (re) => leaves.filter((t) => re.test(t)).length;
  const lane = li.querySelector("[data-testid=post-game-lane]");
  // The removed sections: by their test ids, and by their names anywhere in the open game's text (the
  // list above it, the card's own line and the scoreboard never use these words).
  const words = ["Went well", "Went wrong", "Focus next", "Gold over the game", "No comparison", "Compare with", "Stood out:", "Held back by", "Ranks around the time of this game", "Ranks read later", "not enough recorded history", "no other players to assess", "inferred from", "skill points in this game", "All 18 skill points", "Maxed ", "Score through the game", "About the score through the game", "Minute-by-minute record incomplete for this game"];
  const removedParts = "[data-testid=post-game-notes], [data-testid=post-game-notes-loading], [data-testid=post-game-note], [data-testid=post-game-folds], [data-testid=fold-gold], [data-testid=fold-build], [data-testid=gold-chart], [data-testid=performance-compare], [data-testid=performance-compare-table], [data-testid=performance-why], [data-testid=performance-teams], [data-testid=performance-strip], [data-testid=build-legend], [data-testid=build-row], [data-testid=score-chart-legend], [data-testid=inspected-jump], [data-testid=performance], [data-testid=performance-chart-area], [data-testid=performance-chart-info], [data-testid=performance-timeline-missing], [data-testid=score-chart], [data-testid=score-chart-table]";
  const text = clean(breakdown);
  const panels = li.querySelector("[data-testid=participant-panels]");
  const scores = [...li.querySelectorAll("[data-testid=participant-score]")];
  return {
    open: true,
    where,
    result: clean(where === "card" ? header?.querySelector(":scope > span > span:first-child") : header?.querySelector("[data-testid=match-result]")),
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
    laneWords: lane?.getAttribute("data-state") === "unclear" ? clean(lane.querySelector("p:last-child")) : /^Lane vs/.test(clean(lane?.querySelector("th"))) ? "Lane vs" : "",
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
      // The player inspected's own score beside their name (the panel under the scoreboard was removed on 24 Nov 2026).
      panel: !!li.querySelector("[data-testid=inspected-score] [data-testid=performance-value]"),
      // MVP on the side that won, ACE on the side that lost (each team's section says its result in words).
      mvpOnWin: [...li.querySelectorAll("[data-testid=participant-mvp]")].every((b) => /victory$/.test(b.closest("section[data-testid^=team-]")?.getAttribute("aria-label") ?? "")),
      aceOnLoss: [...li.querySelectorAll("[data-testid=participant-ace]")].every((b) => /defeat$/.test(b.closest("section[data-testid^=team-]")?.getAttribute("aria-label") ?? "")),
    },
    // Where the parts sit (px from the view's top, rounded): on a desktop's two columns (the lane right
    // of the build column) the lane under the scoreboard with the notes beside it, and the build
    // panels' area down to the end of its column, level with the lane (the room the score through the
    // game left, 26 Nov 2026).
    layout: (() => {
      const box = (sel) => li.querySelector(sel)?.getBoundingClientRect() ?? null;
      const [side, laneBox, board, body, notes] = [box("[data-testid=post-game-side]"), box("[data-testid=post-game-lane]"), box("[data-testid=post-game-scoreboard]"), box("[data-testid=panel-body]"), box("[data-testid=scoreboard-notes]")];
      if (!breakdown || !side || !laneBox || !board || !body || !notes) return null;
      const top = breakdown.getBoundingClientRect().top;
      const y = (v) => Math.round(v - top);
      return { columns: laneBox.left >= side.right - 1, sideBottom: y(side.bottom), bodyBottom: y(body.bottom), laneTop: y(laneBox.top), laneBottom: y(laneBox.bottom), boardBottom: y(board.bottom), notesBottom: y(notes.bottom) };
    })(),
    // The open card's header: the score and place its card showed (absent where the card had none), against the inspected player's row as the game opens.
    header: (() => {
      const mark = header?.querySelector("[data-testid=match-header-score]");
      if (!mark) return null;
      const slot = breakdown?.getAttribute("data-selected");
      const row = li.querySelector(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-score]`);
      return { score: Number(mark.getAttribute("data-score")), rank: Number(mark.getAttribute("data-rank")), rowScore: row?.hasAttribute("data-score") ? Number(row.getAttribute("data-score")) : null, rowRank: row?.hasAttribute("data-rank") ? Number(row.getAttribute("data-rank")) : null };
    })(),
    removed: {
      parts: li.querySelectorAll(removedParts).length,
      words: words.filter((w) => text.includes(w)).length,
    },
    steps: (where === "card" ? ["game-header-prev", "game-header-next", "game-header-close", "game-prev", "game-next", "match-close"] : ["match-detail-prev", "match-detail-next", "match-detail-close"]).filter((t) => li.querySelector(`[data-testid=${t}]`)).length,
  };
}

/**
 * Who the open game shows (self-contained, for evaluate): the player inspected and the row marked
 * current, by place in the record, and whether the view's header names the same player as that row
 * (compared in the page: no name leaves it).
 */
export function readInspection() {
  const li = document.querySelector("li[data-expanded]") ?? document.querySelector("dialog[open][data-testid=match-detail]");
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
  fact("Build Path, Skill Order and Runes: three segmented headings, read before the lane", !!p && p.words.join("|") === PANEL_WORDS.join("|") && p.above, { words: p?.words.length ?? 0, above: p?.above ?? false });
  // The score through the game's room (26 Nov 2026): on a desktop's two columns the lane under the
  // scoreboard, the build panels' area to the end of its column, and that column no shorter than the
  // scoreboard's with the lane. A view in one column (a narrow window) has nothing to compare.
  const l = at.layout ?? null;
  if (!l || !l.columns) out.push({ name: `${kind}: skipped: the open game is not in two columns here (the lane under the scoreboard, the build panels beside it)`, status: "WARN", detail: { layout: l ? "one column" : "not read" } });
  else fact("the lane under the scoreboard and the build panels taking the height beside it: the two columns end level", l.laneTop >= l.boardBottom && Math.abs(l.bodyBottom - l.sideBottom) <= 1 && l.sideBottom >= Math.max(l.laneBottom, l.boardBottom, l.notesBottom ?? 0) - 1, l);
  if (at.timeline !== "loading") {
    // With a timeline the build path shows its shop visits; without, one plain line says so (never a path guessed from the final items).
    const shown = at.timeline === "ok" ? (p?.path ?? 0) > 0 || !!p?.missing : !!p?.missing && (p?.path ?? 0) === 0;
    fact(at.timeline === "ok" ? "the build path from the timeline (its shop visits, or the line saying the player is not in it)" : "the build path's plain unavailable line, the game having no timeline", shown, { timeline: at.timeline, path: p?.path ?? 0, missing: p?.missing ?? false });
    const s = at.scores ?? { rows: 0, shown: 0, inRange: false, mvp: 0, ace: 0, removed: 0, panel: false, mvpOnWin: false, aceOnLoss: false };
    fact("a performance score 0–10 beside each of the ten players (a removed player has none), one MVP and one ACE, and the inspected player's score", s.rows === 10 && s.shown === 10 - s.removed && s.inRange && s.mvp === 1 && s.ace === 1 && s.panel, s);
    fact("the MVP is on the team that won and the ACE on the team that lost", s.mvp === 1 && s.ace === 1 && s.mvpOnWin === true && s.aceOnLoss === true, { mvp: s.mvp, ace: s.ace, mvpOnWin: s.mvpOnWin ?? false, aceOnLoss: s.aceOnLoss ?? false });
    // The open card's header keeps its card's score and place: the same as the player's row (not applicable where the card had no score).
    const h = at.header ?? null;
    if (!h) out.push({ name: `${kind}: the open card's header shows the game's score and place, the same as the player's row`, status: "PASS", detail: "not applicable: this game's card had no score" });
    else fact("the open card's header shows the game's score and place, the same as the player's row", h.score === h.rowScore && h.rank === h.rowRank, h);
  }
  const removed = at.removed ?? { parts: NaN, words: NaN };
  fact("no notes, no gold curve, no comparison, no written why, no score strip, no build legend, no grey notes under the scoreboard and no score through the game", removed.parts === 0 && removed.words === 0, removed);
  if (at.where === "window") fact("Previous, Next and Close, in the game window's header line", at.steps === 3, { steps: at.steps });
  else fact("Previous, Next and Close, in the game's header and its footer", at.steps === 6, { steps: at.steps });
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

/**
 * The open game against the window (self-contained, for evaluate; the owner's brief of 24 Nov 2026,
 * §2): its height from its card's top to the game's end against the room under what is pinned above
 * the page, how many elements inside it scroll (overflow auto or scroll with more than they show)
 * and how many are cut off sideways by a box that clips (text ending in its own ellipsis aside).
 * Where it runs over, where the height goes: each part's test id and height in px (no names, no text).
 */
export function readFit() {
  const dialog = document.querySelector("dialog[open][data-testid=match-detail][data-size=workspace]");
  const li = document.querySelector("li[data-expanded]") ?? dialog;
  // Under its card: the card's top to the game's end; in the workspace's game window: the window's top to the view's end, against the window inside the screen.
  const card = dialog ? dialog : li?.querySelector("[data-testid=match-card]");
  const region = dialog ? dialog.querySelector("[data-testid=match-breakdown]") : li?.querySelector("[data-testid=match-expanded]");
  const bd = li?.querySelector("[data-testid=match-breakdown]");
  if (!li || !card || !region || !bd) return { open: false };
  const pinned = dialog ? 0 : parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const height = Math.round(region.getBoundingClientRect().bottom - card.getBoundingClientRect().top);
  const room = dialog ? Math.floor(Math.min(innerHeight, dialog.getBoundingClientRect().bottom) - dialog.getBoundingClientRect().top - (parseFloat(getComputedStyle(region.parentElement.parentElement).paddingBottom) || 0)) : Math.floor(innerHeight - pinned);
  let scrollers = 0;
  let clipped = 0;
  for (const el of [bd, ...bd.querySelectorAll("*")]) {
    const cs = getComputedStyle(el);
    if ((/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)) scrollers += 1;
    const b = el.getBoundingClientRect();
    if (!b.width || el.closest(".sr-only") || el.closest("[hidden]")) continue;
    let p = el.parentElement;
    while (p && p !== bd.parentElement && !/(hidden|clip|auto|scroll)/.test(getComputedStyle(p).overflowX)) p = p.parentElement;
    if (p && p !== bd.parentElement && !p.closest(".truncate") && b.right > p.getBoundingClientRect().right + 1) clipped += 1;
  }
  const h = (el) => Math.round(el.getBoundingClientRect().height);
  const kids = (el) => (el ? [...el.children].map((c) => `${c.getAttribute("data-testid") || c.tagName.toLowerCase()}:${h(c)}`) : []);
  const parts =
    height > room
      ? {
          card: h(card),
          breakdown: h(bd),
          player: kids(li.querySelector("[data-testid=post-game-yours]")),
          side: kids(li.querySelector("[data-testid=post-game-side]")),
          lane: h(li.querySelector("[data-testid=post-game-lane]") ?? li),
          scoreboard: kids(li.querySelector("[data-testid=post-game-scoreboard]")),
          notes: h(li.querySelector("[data-testid=scoreboard-notes]") ?? li),
          panels: kids(li.querySelector("[data-testid=participant-panels]")),
          rows: [...li.querySelectorAll("[data-testid=participant]")].map(h),
        }
      : null;
  return { open: true, where: dialog ? "window" : "card", size: `${innerWidth}x${innerHeight}`, height, room, scrollers, clipped, parts };
}

/** What the check asserts about the open game against the window (`at`, readFit): it fits the room under the pinned bars, and nothing inside it scrolls or is cut off. */
export function fitVerdicts({ kind, at }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!at?.open) {
    fact("the opened game is there to measure", false, { open: false });
    return out;
  }
  if (at.where === "window") fact(`at ${at.size} the game window is inside the screen and the game fits it (${at.height}px of ${at.room})`, at.height <= at.room, at.parts ? { height: at.height, room: at.room, ...at.parts } : { height: at.height, room: at.room });
  else fact(`at ${at.size} the card and its open game fit the window (${at.height}px of ${at.room})`, at.height <= at.room, at.parts ? { height: at.height, room: at.room, ...at.parts } : { height: at.height, room: at.room });
  fact(`at ${at.size} nothing inside the open game scrolls or is cut off`, at.scrollers === 0 && at.clipped === 0, { scrollers: at.scrollers, clipped: at.clipped });
  return out;
}
