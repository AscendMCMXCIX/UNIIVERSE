import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import type { BoardPlayer, MultikillDetail, MultikillsView, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
import { Milestones, Multikills, SeasonRecords } from "./records";

// The season's choice (a client component) asks for the router, which a markup test has none of.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

/*
  The season's records and achievements as markup (the Leaderboards page's sections after Recent
  form), for the states the demo never shows (its viewer has no profile, every record has a holder,
  and nothing is public): the viewer's own best and a record they hold, a record nobody holds yet,
  the public boards linking nowhere, empty multikills and milestones. The browser tests check the
  layout; this checks what each cell and row says and how.
*/

const NAMES: Record<string, string> = { ash: "Ash", bo: "Bo", cy: "Cy" };
const players = (profiles: boolean) => (id: string): BoardPlayer => ({ id, name: NAMES[id]!, profileHref: profiles ? `/players/${id}` : null, avatarUrl: null, look: cardLookFor({ id }) });
const champ = (id: string | null) => (id ? { id, name: id === "MissFortune" ? "Miss Fortune" : id, portraitUrl: "" } : null);

const holder = (o: Partial<RecordHolder> & Pick<RecordHolder, "playerId" | "value" | "unit">, profiles = true): RecordHolder => ({ championId: "Zed", role: "MID", kda: "18/2/7", when: "2 Sep 2026", href: profiles ? "/leaderboards?match=OC1_001" : null, game: profiles ? { matchId: "OC1_001", historyHref: `/players/${o.playerId}/matches?match=OC1_001` } : null, ...o });
const record = (o: Partial<RecordView> & Pick<RecordView, "id" | "label">): RecordView => ({ definition: "", qualifier: null, holder: null, yours: null, ...o });

/** The multikill board as the view sends it: Ash ranked, Cy provisional, Bo (the viewer) with too few games. */
const detail = (o: Partial<MultikillDetail> = {}): MultikillDetail => ({ score: null, status: "not-enough", gamesText: "3 games", chance: null, kinds: [], note: null, usualIs: "usual for their roles and champions", ...o });
const MULTIKILLS: MultikillsView = {
  rows: [
    { playerId: "ash", place: 1, tied: false, status: "ranked", score: "124", counts: { double: 25, triple: 2, quadra: 0, penta: 1 }, riot: { double: 28, triple: 3, quadra: 1, penta: 1 }, kinds: [{ key: "penta", text: "1 penta" }, { key: "triple", text: "2 triples" }, { key: "double", text: "25 doubles" }], gamesText: "40 games", gamesSpoken: "40 games", counted: 40, games: 40, breakdown: "Score 124 from 40 games, give or take about 15 by chance. Each multikill once, at its largest, with the number usual for their roles and champions in brackets: 25 doubles (19), 2 triples (2.1), no quadras (0.4), 1 penta (0.1).", detail: detail({ score: "124", status: "ranked", gamesText: "40 games", chance: "±15" }), you: false },
    { playerId: "cy", place: null, tied: false, status: "provisional", score: "97", counts: { double: 4, triple: 0, quadra: 0, penta: 0 }, riot: { double: 4, triple: 0, quadra: 0, penta: 0 }, kinds: [{ key: "double", text: "4 doubles" }], gamesText: "14/15 games", gamesSpoken: "14 of 15 games with multikill counts", counted: 14, games: 15, breakdown: "Score 97 from 14 games.", detail: detail({ score: "97", status: "provisional" }), you: false },
    { playerId: "bo", place: null, tied: false, status: "not-enough", score: null, counts: { double: 1, triple: 0, quadra: 0, penta: 0 }, riot: { double: 1, triple: 0, quadra: 0, penta: 0 }, kinds: [{ key: "double", text: "1 double" }], gamesText: "3 games", gamesSpoken: "3 games", counted: 3, games: 3, breakdown: "3 games with multikill counts: a score needs 10.", detail: detail({ note: "3 games with multikill counts: a score needs 10." }), you: true },
  ],
  most: [
    { key: "double", label: "Most doubles", count: "25", holders: ["ash"] },
    { key: "triple", label: "Most triples", count: "2", holders: ["ash", "cy"] },
    { key: "quadra", label: "Most quadras", count: null, holders: [] },
    { key: "penta", label: "Most pentas", count: "1", holders: ["ash"] },
  ],
  basis: "Per game, against the same roles and champions · 100 is usual",
  explain: ["What it is: each member's multikills per game against the same roles and champions.", "How it counts: each multikill once, at its largest.", "How sure it is: with few games a score stays near 100."],
  source: "same-games",
  rankedFrom: 20,
  provisionalFrom: 10,
};

function view(profiles: boolean, o: Partial<RecordsView> = {}): RecordsView {
  const h = (x: Partial<RecordHolder> & Pick<RecordHolder, "playerId" | "value" | "unit">) => holder(x, profiles);
  return {
    season: 16,
    seasonLabel: "Season 2026",
    seasons: [{ value: 16, label: "Season 2026", href: "/leaderboards" }],
    games: 32,
    records: [
      // Bo (the viewer) has a best of their own.
      record({ id: "kills", label: "Most kills in a game", holder: h({ playerId: "ash", value: "18", unit: "kills" }), yours: h({ playerId: "bo", value: "4", unit: "kills", when: "6 Sep 2026" }) }),
      // Bo holds this one.
      record({ id: "assists", label: "Most assists in a game", holder: h({ playerId: "bo", value: "24", unit: "assists", championId: "Thresh", role: "SUPPORT", kda: "1/3/24" }) }),
      record({ id: "damage-per-minute", label: "Most damage per minute", definition: "Damage to champions, in a game of 15 minutes or more.", qualifier: "to champions · 15+ min games", holder: h({ playerId: "cy", value: "1,640", unit: "damage/min", championId: "MissFortune", role: "ADC", kda: "9/1/4" }) }),
      // Nobody holds it yet.
      record({ id: "cs-per-minute", label: "Most CS per minute", definition: "Lane minions and monsters, in a game of 15 minutes or more.", qualifier: "15+ min games" }),
      record({ id: "vision-per-minute", label: "Most vision per minute", definition: "Vision score, in a game of 15 minutes or more.", qualifier: "15+ min games", holder: h({ playerId: "bo", value: "3.20", unit: "vision/min" }) }),
      record({ id: "kda", label: "Best KDA in a game", definition: "(Kills + assists) ÷ deaths, in a game with 10 or more takedowns; no deaths counts as one.", qualifier: "10+ takedowns", holder: h({ playerId: "cy", value: "13.0", unit: "KDA" }) }),
      // A streak opens no single game.
      record({ id: "win-streak", label: "Longest win streak", definition: "In the order the games were played.", qualifier: "in game order", holder: { playerId: "ash", value: "5", unit: "wins in a row", championId: null, role: null, kda: null, when: "5 Sep 2026", href: null, game: null }, yours: { playerId: "bo", value: "2", unit: "wins in a row", championId: null, role: null, kda: null, when: "5 Sep 2026", href: null, game: null } }),
    ],
    multikills: MULTIKILLS,
    multikillNote: "Counted from 31 of 32 games this season; the rest are left out, never counted as zero.",
    multikillShort: "From 31 of 32 games",
    championGames: [{ playerId: "ash", items: [{ championId: "Riven", value: "25 games", short: "25", milestone: "25+ games", tier: 1 }], more: 0 }],
    mastery: [
      {
        playerId: "ash",
        items: [
          { championId: "Riven", value: "1.2M points", short: "1.2M", milestone: "1M+", tier: 3 },
          { championId: "Zed", value: "486K points", short: "486K", milestone: "100K+", tier: 1 },
          { championId: "Yasuo", value: "333K points", short: "333K", milestone: "100K+", tier: 1 },
        ],
        more: 2,
      },
    ],
    ...o,
  };
}
/** The three sections in the page's order: the season records, the multikills, the milestones. */
const render = (o: { profiles?: boolean; viewer?: string | null; records?: Partial<RecordsView> } = {}) => {
  const profiles = o.profiles ?? true;
  const records = view(profiles, o.records);
  const player = players(profiles);
  const viewer = o.viewer === undefined ? (profiles ? "bo" : null) : o.viewer;
  return renderToStaticMarkup(createElement(Fragment, null, createElement(SeasonRecords, { records, player, champ, viewer }), createElement(Multikills, { records, player }), createElement(Milestones, { records, player, champ })));
};

/** Each season record's cell (its li, holding its row), by record. */
const rowsOf = (html: string) => Object.fromEntries([...html.matchAll(/<li class="[^"]*"><div class="[^"]*"><div [^>]*data-testid="season-record" data-record="([\w-]+)"[\s\S]*?<\/li>/g)].map((m) => [m[1]!, m[0]]));
/** The markup inside the first element with this test id (its nested elements of the same tag included). */
const innerOf = (html: string, testId: string): string | null => {
  const open = new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>`).exec(html);
  if (!open) return null;
  const tag = open[1]!;
  const re = new RegExp(`<${tag}[ >]|</${tag}>`, "g");
  re.lastIndex = open.index + open[0].length;
  for (let depth = 1, m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, m.index);
  }
  return null;
};
/** The visible text of an element with this test id: tags and screen-reader words removed. */
const shownOf = (html: string, testId: string) => {
  const inner = innerOf(html, testId);
  return inner === null ? null : decode(inner.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, ""));
};
const decode = (text: string) => text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

describe("the season records", () => {
  const html = render();
  const rows = rowsOf(html);

  it("are seven cells of one panel, in the model's order, under one title: a plain panel, Recent form leads the page", () => {
    expect(Object.keys(rows)).toEqual(["kills", "assists", "damage-per-minute", "cs-per-minute", "vision-per-minute", "kda", "win-streak"]);
    expect(html).toMatch(/<div class="[^"]*panel-depth[^"]*" data-testid="records-book">/);
    expect(html).not.toContain("surface-lead");
    expect(html).toContain('<section id="season-records" aria-labelledby="season-records-title" class="min-w-0" data-testid="records">');
    expect(html).toContain('<h2 id="season-records-title"');
    // What it counts, under the title: the season and its games.
    expect(shownOf(html, "records-scope")).toBe("Season 2026 · All supported games · 32 games · ties: first to set it");
    // One season: no choice to make.
    expect(html).not.toContain("records-season");
  });

  it("place their cells on a grid by the panel's width (two columns on a one-column page, never beside Recent form), each cell measuring itself, the seventh across both columns", () => {
    expect(html).toMatch(/<ul aria-label="Season records" class="grid grid-cols-\[minmax\(0,1fr\)\] [^"]*@min-\[40rem\]\/list:@max-\[59rem\]\/dash:grid-cols-2" data-testid="season-records">/);
    const cells = [...html.matchAll(/<li class="([^"]*)"><div class="([^"]*)"><div [^>]*data-testid="season-record"/g)];
    expect(cells).toHaveLength(7);
    for (const [, cellClass, colsClass] of cells) {
      const [cell, cols] = [decode(cellClass!), decode(colsClass!)];
      expect(cell).toContain("@container/list");
      expect(cell).toContain("@min-[40rem]/list:@max-[59rem]/dash:[&:last-child:nth-child(odd)]:col-span-2");
      // Each cell holds its own column template, so its row reads the cell's width; a two-line cell (36rem, or any cell on a
      // 59rem page: the record-two variant) has a 36px picture.
      expect(cols).toContain("[--dl-cols:3rem_minmax(5rem,1fr)_auto_1rem]");
      expect(cols).toContain("record-two:[--dl-cols:2.25rem_minmax(0,1fr)_auto_1rem]");
    }
  });

  it("offer the season where there are two to choose from", () => {
    const two = render({ records: { seasons: [{ value: 16, label: "Season 2026", href: "/leaderboards" }, { value: 17, label: "Season 2027", href: "/leaderboards?season=17" }] } });
    expect(two).toContain('data-testid="records-season"');
    // In the records' own title row.
    expect(two.indexOf('data-testid="records-season"')).toBeGreaterThan(two.indexOf('id="season-records-title"'));
    expect(two.indexOf('data-testid="records-season"')).toBeLessThan(two.indexOf('data-testid="season-records"'));
  });

  it("opens each record's game from the whole row, named by the record; the streak and an empty record open none", () => {
    for (const id of ["kills", "assists", "damage-per-minute", "vision-per-minute", "kda"]) {
      expect(count(rows[id]!, /data-row-link=""/g), id).toBe(1);
      expect(rows[id]).toMatch(/href="\/leaderboards\?match=OC1_001"/);
      // The chevron where a row opens its game.
      expect(rows[id]).toContain("lucide-chevron-right");
    }
    expect(rows.kills).toContain('<span class="sr-only">Most kills in a game: open the game</span>');
    // The link says the record, so its visible words are not read twice.
    expect(rows.kills).toMatch(/<span aria-hidden="true" class="[^"]*" data-testid="record-label">Most kills in a game<\/span>/);
    for (const id of ["cs-per-minute", "win-streak"]) {
      expect(rows[id], id).not.toContain("data-row-link");
      expect(rows[id], id).not.toContain("lucide-chevron-right");
      expect(rows[id], id).toMatch(/<span class="[^"]*" data-testid="record-label">/);
    }
  });

  it("shows each record's qualifier on its row, read after a comma, with no ⓘ of definitions", () => {
    // The "·" before it is drawn in the qualifier's own padding (cut off when the qualifier starts a line), hidden from screen readers.
    expect(shownOf(rows["damage-per-minute"]!, "record-qualifier")).toBe("·to champions · 15+ min games");
    expect(rows["damage-per-minute"]).toContain('<span aria-hidden="true" class="absolute left-1">·</span><span class="sr-only">, </span>to champions · 15+ min games');
    expect(shownOf(rows.kda!, "record-qualifier")).toBe("·10+ takedowns");
    expect(shownOf(rows["win-streak"]!, "record-qualifier")).toBe("·in game order");
    expect(rows.kills).not.toContain("record-qualifier");
    // No ⓘ of definitions (the tooltip inventory's L04): each row's qualifier says what it counts, and the scope line how ties go.
    expect(count(html, /data-testid="records-definitions"/g)).toBe(0);
    expect(Object.values(rows).join("")).not.toContain("Lane minions and monsters");
  });

  it("names the holder as their card does, then the champion, role, K/D/A and date, and the value with its unit", () => {
    expect(shownOf(rows["damage-per-minute"]!, "record-context")).toBe("Miss Fortune · Bottom · 9/1/4 · 2 Sep 2026");
    expect(rows["damage-per-minute"]).toMatch(/data-testid="record-holder"[\s\S]*?data-testid="card-name"[^>]*>Cy</);
    expect(shownOf(rows["damage-per-minute"]!, "record-value")).toBe("1,640");
    expect(shownOf(rows["damage-per-minute"]!, "record-unit")).toBe("damage/min");
    // The streak: its last win's date, no champion, its mark for a picture.
    expect(shownOf(rows["win-streak"]!, "record-context")).toBe("5 Sep 2026");
    expect(rows["win-streak"]).toContain("lucide-trending-up");
    // The champion's picture is decorative: the row names the champion in words.
    expect(rows["damage-per-minute"]).toMatch(/<span aria-hidden="true" class="[^"]*" data-testid="record-picture">/);
  });

  it("gives the viewer their own best, or says they hold the record", () => {
    expect(shownOf(rows.kills!, "record-yours")).toBe("Your best: 4 · 6 Sep 2026");
    expect(shownOf(rows.assists!, "record-yours")).toBe("You hold this record");
    expect(shownOf(rows["win-streak"]!, "record-yours")).toBe("Your best: 2 · 5 Sep 2026");
    // Nothing to compare with a record nobody holds.
    expect(rows["cs-per-minute"]).not.toContain("record-yours");
    // A viewer without a profile of their own (an administrator) has no best.
    expect(render({ viewer: null })).not.toContain("record-yours");
    // A viewer with no game that sets a record holds nothing there and has no best: nothing is said
    // (the record cards said "You hold this record"). Cy holds damage and KDA, and has no best elsewhere.
    const cy = rowsOf(render({ viewer: "cy", records: { records: view(true).records.map((r) => ({ ...r, yours: null })) } }));
    expect(shownOf(cy["damage-per-minute"]!, "record-yours")).toBe("You hold this record");
    expect(shownOf(cy.kda!, "record-yours")).toBe("You hold this record");
    for (const id of ["kills", "assists", "vision-per-minute", "win-streak"]) expect(cy[id], id).not.toContain("record-yours");
  });

  it("says when nobody holds a record yet, with no figure", () => {
    expect(shownOf(rows["cs-per-minute"]!, "record-none")).toBe("No game sets this record yet this season.");
    expect(rows["cs-per-minute"]).not.toContain("record-value");
  });
});

describe("multikills", () => {
  const html = render({ viewer: "bo" });
  const rowOf = (h: string, id: string) => new RegExp(`<li [^>]*data-testid="multikill-row" data-player-id="${id}"[\\s\\S]*?</li>`).exec(h)![0];

  it("rank by the score: the place (a crown on first), the picture, the name over the kinds made in words (each multikill once, rarest first), the score over its games; no column headings to decode", () => {
    const rows = [...html.matchAll(/<li [^>]*data-testid="multikill-row" data-player-id="(\w+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["ash", "cy", "bo"]);
    const ash = rowOf(html, "ash");
    // The shown counts are each multikill once (the score's events); Riot's counters ride along for the record.
    expect(ash).toContain('data-place="1" data-status="ranked" data-score="124" data-double="25" data-triple="2" data-quadra="0" data-penta="1" data-riot="28,3,1,1" data-counted="40"');
    expect(ash).toContain('aria-label="First place"');
    expect(shownOf(ash, "multikill-score")).toBe("124");
    expect(ash).toContain('<span class="sr-only"> multikill score</span>');
    expect(shownOf(ash, "multikill-games")).toBe("40 games");
    expect([...ash.matchAll(/<span data-kind="(\w+)" class="whitespace-nowrap">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]])).toEqual([["penta", "1 penta"], ["triple", "2 triples"], ["double", "25 doubles"]]);
    // No headings row: every figure says its own name.
    expect(innerOf(html, "records-multikills")).not.toContain("label-caps");
  });

  it("open the member's profile from the whole row, its tooltip and its words for screen readers the score's sentence", () => {
    const ash = rowOf(html, "ash");
    expect(ash).toContain('data-row-link="" href="/players/ash"><span class="sr-only">Ash</span><span aria-hidden="true" title="Score 124 from 40 games, give or take about 15 by chance.');
    expect(ash).toContain('<span class="sr-only">Score 124 from 40 games, give or take about 15 by chance. Each multikill once, at its largest, with the number usual for their roles and champions in brackets: 25 doubles (19)');
  });

  it("list a provisional member after the ranked ones, place –, the score muted; a member with too few games last, with no score; your own row marked", () => {
    const cy = rowOf(html, "cy");
    expect(cy).toContain('data-status="provisional"');
    expect(cy).toContain('<span class="sr-only">Provisional</span>');
    expect(cy).toMatch(/text-fg-muted" data-figure="" data-testid="multikill-score"|data-testid="multikill-score" class="[^"]*text-fg-muted/);
    // "14/15 games" on one line; in words for screen readers.
    expect(shownOf(cy, "multikill-games")).toBe("14/15 games");
    expect(cy).toContain('<span class="sr-only">14 of 15 games with multikill counts</span>');
    expect(cy).toMatch(/whitespace-nowrap[^"]*" data-testid="multikill-games"/);
    expect(shownOf(html, "multikill-unplaced-head")).toBe("Not placed yet\u00a0·\u00a0under 20 games with multikill counts");
    expect(cy).toContain("<span class=\"sr-only\"> multikill score, provisional</span>");
    const bo = rowOf(html, "bo");
    expect(bo).not.toContain("multikill-score\"");
    expect([...bo.matchAll(/<span data-kind="(\w+)" class="whitespace-nowrap">([^<]*)<\/span>/g)].map((m) => m[2]), "its counts in words still").toEqual(["1 double"]);
    expect(bo).toContain('data-you="true"');
    expect(bo).toContain("bg-accent/5");
    expect(shownOf(bo, "multikill-no-score")).toBe("No score yet");
    // One group for both, provisional first.
    expect(html.indexOf("data-player-id=\"cy\"")).toBeLessThan(html.indexOf("data-player-id=\"bo\""));
    expect(innerOf(html, "multikill-unplaced")).toContain("data-player-id=\"bo\"");
  });

  it("explain the score behind one ⓘ in short points (with which games the counts come from), and say what it is on the board's line", () => {
    expect(html).toContain('aria-label="How the multikill score works"');
    const points = [...html.matchAll(/data-testid="multikill-explain-point"><span aria-hidden="true">• <\/span>([^<]*)/g)].map((m) => decode(m[1]!).trim());
    // Each point twice: the bubble's and its screen-reader copy (drawn only while open, so here the copy alone).
    expect(points.slice(0, 4)).toEqual(["What it is: each member's multikills per game against the same roles and champions.", "How it counts: each multikill once, at its largest.", "How sure it is: with few games a score stays near 100.", "Counted from 31 of 32 games this season; the rest are left out, never counted as zero."]);
    expect(shownOf(html, "multikill-basis")).toBe("Per game, against the same roles and champions · 100 is usual");
    expect(shownOf(html, "multikill-short")).toBe("From 31 of 32 games");
  });

  it("keep the most of each kind as records of their own: the count and its holder, every holder of a shared one, \"None yet\" for none", () => {
    const most = innerOf(html, "multikill-most")!;
    const kinds = [...most.matchAll(/data-testid="multikill-most-kind" data-kind="(\w+)"/g)].map((m) => m[1]);
    expect(kinds).toEqual(["double", "triple", "quadra", "penta"]);
    const triple = /data-kind="triple"[\s\S]*?<\/li>/.exec(most)![0];
    expect(shownOf(triple, "multikill-most-count")).toBe("2");
    expect(shownOf(triple, "multikill-most-holders")).toBe("Ash, Cy");
    expect(/data-kind="quadra"[\s\S]*?<\/li>/.exec(most)![0]).toContain("None yet");
  });

  it("are the one-screen board's overview: a fold group whose Show all, at the title's end, is drawn only where a row folds", () => {
    // Three members, fewer than either window's count: no row folds and the Show all is never drawn.
    expect(html).toMatch(/<section id="multikills" aria-labelledby="multikills-title" data-fold="closed" class="group\/fold min-w-0">/);
    expect(html).toMatch(/<span class="hidden items-center" data-testid="multikill-show-all">/);
    expect(innerOf(html, "records-multikills")).not.toContain("group-data-[fold=closed]/fold:hidden");
    // The Show all is in the board's title row, before the line saying what the score is.
    expect(html.indexOf('data-testid="multikill-show-all"')).toBeLessThan(html.indexOf('data-testid="multikill-note-line"'));
    expect(html.indexOf('data-testid="multikill-show-all"')).toBeGreaterThan(html.indexOf('id="multikills-title"'));
  });

  it("say so when nobody has a game with counts", () => {
    const empty = render({ records: { multikills: { ...MULTIKILLS, rows: [] }, multikillNote: null, multikillShort: null } });
    expect(shownOf(empty, "multikills-empty")).toBe("No games with multikill counts this season yet.");
    expect(empty).not.toContain("multikill-row");
    expect(empty).not.toContain("multikill-most");
  });
});

describe("milestones", () => {
  const html = render();

  it("are member rows: the name, then the top milestone, its figure short (1.2M), the rest counted (+4)", () => {
    const mastery = html.slice(html.indexOf('data-testid="milestones-mastery"'));
    expect(mastery).toContain('data-testid="milestones-mastery-list"');
    const member = /<li [^>]*data-testid="milestone-member" data-player-id="ash"[\s\S]*?<\/ul><\/li>/.exec(mastery)![0];
    expect(count(member, /data-testid="milestone"/g)).toBe(1);
    expect([...member.matchAll(/data-testid="milestone-figure">([^<]*)</g)].map((m) => m[1])).toEqual(["1.2M"]);
    // Screen readers hear it in words, the champion's name included (hidden on a phone, D6).
    expect(member).toContain('data-testid="milestone-champion">Riven</span><span aria-hidden="true" class="shrink-0 tabular-nums text-fg-muted" data-testid="milestone-figure">1.2M</span><span class="sr-only"> 1.2M points, 1M+ milestone</span>');
    expect(member).toMatch(/@max-\[32rem\]\/list:sr-only" data-testid="milestone-champion"/);
    // The two other shown before and the two more on the profile: "+4".
    expect(shownOf(member, "milestone-more")).toBe("+4");
    expect(member).toContain('<span class="sr-only">and 4 more on their profile</span>');
    // Rarities: violet and gold marks, never a state colour.
    expect(member).toMatch(/border-gold\/60 bg-gold\/10[^"]*" data-testid="milestone" data-tier="3"/);
    // The row opens the profile; its tooltip names each milestone (no chip's own title shows under the link).
    expect(member).toContain('title="Riven: 1.2M points (1M+ milestone). Zed: 486K points (100K+ milestone). Yasuo: 333K points (100K+ milestone). 2 more on the profile"');
    expect(member).not.toMatch(/data-testid="milestone"[^>]* title=|title="[^"]*"[^>]*data-testid="milestone"/);
  });

  it("say so for a kind nobody has reached", () => {
    const empty = render({ records: { championGames: [], mastery: [] } });
    expect(empty).toContain("Nobody has 25 games on one champion this season yet.");
    expect(empty).toContain("Nobody has 100K mastery points on one champion yet.");
    expect(empty).not.toContain("milestone-member");
  });
});

describe("the sections", () => {
  it("are the page's sections, each under its h2, with no paragraph of explanation: what counts is behind each ⓘ", () => {
    const html = render();
    for (const [id, title] of [["season-records", "season-records-title"], ["multikills", "multikills-title"], ["milestones", "milestones-title"]]) {
      expect(html).toContain(`<section id="${id}" aria-labelledby="${title}"`);
      expect(html).toContain(`<h2 id="${title}"`);
    }
    expect(html).not.toContain("records-volume-note");
    expect(html).not.toContain("How members are doing lately is on Recent form");
    // Each milestone's thresholds behind the ⓘ beside its kind, not a line of text.
    const games = innerOf(html, "milestones-games")!;
    expect(games).toContain('aria-label="What counts: Games on one champion · Season 2026"');
    expect(games).toMatch(/<span id="[^"]+" class="sr-only">Champions with 25, 50 or 100 games this season\.<\/span>/);
    expect(innerOf(html, "milestones-mastery")).toMatch(/<span id="[^"]+" class="sr-only">100K, 500K or 1M mastery points on one champion, added up over their Riot accounts\./);
    // A row shows each member's best milestone and counts the rest ("+N"), so the ⓘ says the same (not "the best three").
    expect(innerOf(html, "milestones-mastery")).toContain("Each member&#x27;s best is shown; the rest are on their profile.");
    // The multikills' coverage stays in words under their title (which games the counts come from), the sentence behind its ⓘ.
    expect(shownOf(html, "multikill-short")).toBe("From 31 of 32 games");
  });

  it("links nowhere on the public boards: no link, no profile or game address, the names read and the chips titled", () => {
    const html = render({ profiles: false });
    expect(html).not.toMatch(/<a (?![^>]*href="#)/);
    expect(html).not.toContain("/players/");
    expect(html).not.toContain("lucide-chevron-right");
    expect(html).not.toContain("hover:bg-surface-2");
    expect(html).toContain('title="Riven: 1.2M points (1M+ milestone)"');
    // Every label and name is read where no link says it.
    expect(html).not.toMatch(/aria-hidden="true"[^>]*data-testid="record-label"/);
    expect(html).not.toContain('<span class="min-w-0 text-fg" aria-hidden="true">');
  });

  it("nests nothing a browser would rearrange: no block inside a paragraph, only li in a list, no link in a link", () => {
    const html = render();
    expect(html).not.toMatch(/<p[ >](?:(?!<\/p>)[\s\S])*<(div|ul|ol|p|h\d)[ >]/);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /);
    for (const list of html.match(/<(ol|ul)[^>]*>(?:(?!<(?:ol|ul)[ >])[\s\S])*?<\/\1>/g) ?? []) expect(list.replace(/^<(ol|ul)[^>]*>|<\/(ol|ul)>$/g, "")).toMatch(/^(<li[\s\S]*?<\/li>)*$/);
  });
});
