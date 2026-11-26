import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import type { BoardPlayer, MultikillBreakdown, MultikillRole, MultikillRow, MultikillsView, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
import { RECORD_SHORT } from "@/server/leaderboards/recent-view";
import { Milestones, Multikills, SeasonRecords } from "./records";

// The season's choice (a client component) asks for the router, which a markup test has none of.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

/*
  The season's records and achievements as markup (the Leaderboards page's boards beside and under
  Recent form), for the states the demo never shows (its viewer has no profile, every record has a
  holder, and nothing is public): the viewer's own best and a record they hold, a record nobody holds
  yet, a shared place, a split and an unknown role, the team-wide fallback, the public boards linking
  nowhere, empty multikills and milestones. The browser tests check the layout; this checks what each
  cell and row says and how.
*/

const NAMES: Record<string, string> = { ash: "Ash", bo: "Bo", cy: "Cy" };
const players = (profiles: boolean) => (id: string): BoardPlayer => ({ id, name: NAMES[id]!, profileHref: profiles ? `/players/${id}` : null, avatarUrl: null, look: cardLookFor({ id }) });
const champ = (id: string | null) => (id ? { id, name: id === "MissFortune" ? "Miss Fortune" : id, portraitUrl: "" } : null);
const CHAMPIONS = Object.fromEntries(["Ahri", "MissFortune", "Riven", "Thresh", "Zed"].map((id) => [id, champ(id)!]));

const holder = (o: Partial<RecordHolder> & Pick<RecordHolder, "playerId" | "value" | "unit">, profiles = true): RecordHolder => ({ championId: "Zed", role: "MID", kda: "18/2/7", when: "2 Sep 2026", href: profiles ? "/leaderboards?match=OC1_001" : null, game: profiles ? { matchId: "OC1_001", historyHref: `/players/${o.playerId}/matches?match=OC1_001` } : null, ...o });
const record = (o: Partial<RecordView> & Pick<RecordView, "id" | "label">): RecordView => ({ short: RECORD_SHORT[o.id], definition: "", qualifier: null, holder: null, yours: null, ...o });

/** The multikill board as the view sends it: Ash first, Cy and Bo (the viewer) sharing second; Bo's role a split, Cy's unknown. */
const roleOf = (o: Partial<MultikillRole> = {}): MultikillRole => ({ kind: "role", roles: ["MID"], label: "Most played: Mid, 85% of 40 games", rows: [{ role: "MID", label: "Mid", share: "85%", games: "34 games", text: "Mid — 85% (34 games)" }, { role: "TOP", label: "Top", share: "10%", games: "4 games", text: "Top — 10% (4 games)" }, { role: null, label: "Unknown", share: "5%", games: "2 games", text: "Unknown — 5% (2 games)" }], ...o });
const breakdownOf = (o: Partial<MultikillBreakdown> = {}): MultikillBreakdown => ({
  score: "124",
  place: "1st of 3",
  games: "40 games with multikill counts",
  coverage: null,
  role: roleOf(),
  champions: [
    { championId: "Ahri", role: "MID", games: "30 games" },
    { championId: "MissFortune", role: "ADC", games: "8 games" },
  ],
  kinds: [
    { key: "double", label: "Double kills", made: "25", weight: "2", points: "50" },
    { key: "triple", label: "Triple kills", made: "2", weight: "3", points: "6" },
    { key: "quadra", label: "Quadra kills", made: "0", weight: "4", points: "0" },
    { key: "penta", label: "Pentakills", made: "1", weight: "5", points: "5" },
  ],
  calculation: { earned: "61", expected: "41.6", cushion: "40", score: "124" },
  comparison: [
    { basis: "champion-role", label: "By champion and role", games: "30 games" },
    { basis: "role", label: "By role (champion under 50 games)", games: "8 games" },
    { basis: "all", label: "All positions together", games: "2 games" },
  ],
  notAdjusted: false,
  chance: "±15",
  ...o,
});
const rowOf = (o: Partial<MultikillRow> & Pick<MultikillRow, "playerId" | "place" | "score">): MultikillRow => ({ tied: false, status: "ranked", counts: { double: 25, triple: 2, quadra: 0, penta: 1 }, riot: { double: 28, triple: 3, quadra: 1, penta: 1 }, gamesText: "40", gamesSpoken: "40 games with multikill counts", counted: 40, games: 40, role: roleOf(), breakdown: breakdownOf(), you: false, ...o });
const MULTIKILLS: MultikillsView = {
  rows: [
    rowOf({ playerId: "ash", place: 1, score: "124" }),
    rowOf({ playerId: "cy", place: 2, tied: true, score: "97", counts: { double: 4, triple: 0, quadra: 0, penta: 0 }, riot: { double: 4, triple: 0, quadra: 0, penta: 0 }, gamesText: "21", gamesSpoken: "21 of 25 games with multikill counts", counted: 21, games: 25, role: roleOf({ kind: "unknown", roles: [], label: "Role unknown: no position recorded in these games", rows: [{ role: null, label: "Unknown", share: "100%", games: "21 games", text: "Unknown — 100% (21 games)" }] }), breakdown: breakdownOf({ score: "97", place: "Tied for 2nd of 3", coverage: "4 of 25 season games have no multikill counts and are left out, never counted as zero." }) }),
    rowOf({ playerId: "bo", place: 2, tied: true, score: "97", counts: { double: 1, triple: 0, quadra: 0, penta: 0 }, riot: { double: 1, triple: 0, quadra: 0, penta: 0 }, role: roleOf({ kind: "split", roles: ["TOP", "MID"], label: "Split: Top and Mid, 45% each" }), you: true, breakdown: breakdownOf({ score: "97", place: "Tied for 2nd of 3" }) }),
  ],
  basis: "Ranked by multikill performance relative to the champions and roles played.",
  explain: "Multikills earn 2–5 points. The score compares a player's points with typical results for their champions and roles, accounting for games played.",
  source: "same-games",
  sourceText: "Typical results come from 2,400 games of other players in the team's stored season matches, excluding team members — not every League player.",
  rule: "nested",
  ruleShown: true,
  ruleText: "Each multikill counts once, at its largest: a pentakill is not also counted as a double, triple and quadra.",
  rankedFrom: 20,
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
    milestones: {
      items: [
        { playerId: "ash", kind: "mastery", championId: "Riven", short: "1.2M", unit: "mastery", value: "1.2M mastery points", milestone: "1M+", tier: 3 },
        { playerId: "bo", kind: "games", championId: "Thresh", short: "52", unit: "games", value: "52 games this season", milestone: "50+ games", tier: 2 },
        { playerId: "ash", kind: "games", championId: "Riven", short: "25", unit: "games", value: "25 games this season", milestone: "25+ games", tier: 1 },
      ],
      more: 4,
    },
    ...o,
  };
}
/** The three sections in the page's order: the season records, the multikills, the milestones. */
const render = (o: { profiles?: boolean; viewer?: string | null; records?: Partial<RecordsView> } = {}) => {
  const profiles = o.profiles ?? true;
  const records = view(profiles, o.records);
  const player = players(profiles);
  const viewer = o.viewer === undefined ? (profiles ? "bo" : null) : o.viewer;
  return renderToStaticMarkup(createElement(Fragment, null, createElement(SeasonRecords, { records, player, champ, viewer }), createElement(Multikills, { records, player, champions: CHAMPIONS }), createElement(Milestones, { records, player, champ })));
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
    expect(html).toContain('<section id="season-records" aria-labelledby="season-records-title" class="flex min-w-0 flex-col" data-testid="records">');
    expect(html).toContain('<h2 id="season-records-title"');
    // What it counts, under the title: its games and how ties go (the season is the page header's).
    expect(shownOf(html, "records-scope")).toBe("32 games · ties: first to set it");
    // Whose records they are, and what the per-minute and KDA records need, behind one ⓘ (the 30-day rule's records move with it).
    expect(html).toContain('aria-label="Whose records, and what counts"');
    expect(html).toContain("Records among players active in the last 30 days. Per-minute records need 15+ minute games; the KDA record 10 takedowns.");
    // The season's choice is the header's now.
    expect(html).not.toContain("records-season");
  });

  it("place their cells on a grid by the panel's width (two columns from a 34rem panel: the desktop board's, a tablet's), each cell measuring itself, the seventh across both columns", () => {
    const list = /<ul aria-label="Season records" class="([^"]*)" style="([^"]*)" data-testid="season-records">/.exec(html);
    expect(list).not.toBeNull();
    expect(decode(list![1]!)).toMatch(/^grid grid-cols-\[minmax\(0,1fr\)\] .*@min-\[34rem\]\/list:grid-cols-2/);
    // The shorter board of its grid row: its rows of cells share the spare room, up to 3.5rem a row (seven cells, four rows two to a row).
    expect(decode(list![1]!)).toContain("flex-auto min-h-min max-h-[calc(var(--fill-rows)*3.5rem)] @min-[34rem]/list:max-h-[calc(var(--fill-rows-wide)*3.5rem)]");
    expect(list![2]).toBe("--fill-rows:7;--fill-rows-wide:4");
    const cells = [...html.matchAll(/<li class="([^"]*)"><div class="([^"]*)"><div [^>]*data-testid="season-record"/g)];
    expect(cells).toHaveLength(7);
    for (const [, cellClass, colsClass] of cells) {
      const [cell, cols] = [decode(cellClass!), decode(colsClass!)];
      expect(cell).toContain("@container/list");
      expect(cell).toContain("@min-[34rem]/list:[&:last-child:nth-child(odd)]:col-span-2");
      // Each cell holds its own column template, so its row reads the cell's width; a two-line cell (36rem, or any cell on a
      // 59rem page: the record-two variant) has a 36px picture.
      expect(cols).toContain("[--dl-cols:3rem_minmax(5rem,1fr)_auto_1rem]");
      expect(cols).toContain("record-two:[--dl-cols:2.25rem_minmax(0,1fr)_auto_1rem]");
    }
  });

  it("say each record in a few words in a two-line cell (the full label stays its name), in full in a phone's three-line cell", () => {
    // In a two-line cell (record-two) the short label shows and the full one is read; elsewhere the full one shows.
    expect(rows["damage-per-minute"]).toContain('<span class="record-two:hidden">Most damage per minute</span><span class="hidden record-two:inline" aria-hidden="true">Damage per min</span><span class="sr-only hidden record-two:inline">Most damage per minute</span>');
    expect(RECORD_SHORT).toEqual({ kills: "Most kills", assists: "Most assists", "damage-per-minute": "Damage per min", "cs-per-minute": "CS per min", "vision-per-minute": "Vision per min", kda: "Best KDA", "win-streak": "Win streak" });
    // A qualifier is read out, not drawn, in a two-line cell under 24rem (the ⓘ says what they count).
    expect(rows["damage-per-minute"]).toMatch(/record-two:@max-\[24rem\]\/list:sr-only" data-testid="record-qualifier"/);
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
    expect(rows.kills).toMatch(/<span aria-hidden="true" class="[^"]*" data-testid="record-label"><span class="record-two:hidden">Most kills in a game<\/span>/);
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
  const rowHtml = (h: string, id: string) => new RegExp(`<li [^>]*data-testid="multikill-row" data-player-id="${id}"[\\s\\S]*?</li>`).exec(h)![0];

  it("are a table of the ranked players: the place, the player and role, the games, the four kinds and the Score, under sentence-case headings", () => {
    const rows = [...html.matchAll(/<li [^>]*data-testid="multikill-row" data-player-id="(\w+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["ash", "cy", "bo"]);
    const ash = rowHtml(html, "ash");
    // The shown counts are each multikill once (the score's events); Riot's counters ride along for the record.
    expect(ash).toContain('data-place="1" data-status="ranked" data-score="124" data-double="25" data-triple="2" data-quadra="0" data-penta="1" data-riot="28,3,1,1" data-counted="40" data-games="40"');
    expect(shownOf(ash, "multikill-score")).toBe("124");
    expect(shownOf(ash, "multikill-games")).toBe("40");
    expect(ash).toContain('<span class="sr-only">40 games with multikill counts</span>');
    expect([...ash.matchAll(/data-testid="multikill-kind" data-kind="(\w+)">([^<]*)</g)].map((m) => [m[1], m[2]])).toEqual([["double", "25"], ["triple", "2"], ["quadra", "0"], ["penta", "1"]]);
    // A zero is tertiary, a count primary; every count names its kind for screen readers.
    expect(ash).toMatch(/text-fg-subtle[^"]*" data-testid="multikill-kind" data-kind="quadra"/);
    expect(ash).toMatch(/text-fg[^-"]*[^"]*" data-testid="multikill-kind" data-kind="double"/);
    expect(ash).toContain('<span class="sr-only"> pentakills</span>');
    // The headings: aria-hidden, sentence case (label-text, never label-caps), the kinds "2×"–"5×" with their words from a 40rem board.
    const heads = /<div aria-hidden="true" data-testid="multikill-heads" class="([^"]*)">([\s\S]*?)<\/div>/.exec(html)!;
    expect(heads[1]).toContain("label-text");
    expect(heads[1]).not.toContain("label-caps");
    expect(decode(heads[2]!.replace(/<[^>]+>/g, "|")).split("|").filter(Boolean)).toEqual(["#", "Player", "Games", "2×", "Doubles", "3×", "Triples", "4×", "Quadras", "5×", "Pentas", "Score"]);
    expect(innerOf(html, "records-multikills")).not.toContain("label-caps");
  });

  it("place restrainedly: plain numbers, first in gold with no crown, a shared place \"2=\" said \"Tied for 2nd\"", () => {
    const ash = rowHtml(html, "ash");
    expect(ash).not.toContain("First place");
    expect(ash).not.toContain("lucide-crown");
    expect(ash).toMatch(/text-gold[^"]*" data-testid="multikill-place" data-leader="true"/);
    const cy = rowHtml(html, "cy");
    expect(cy).toContain('<span aria-hidden="true">2=</span><span class="sr-only">Tied for 2nd</span>');
    expect(cy).not.toContain("text-gold");
  });

  it("make the Score a button that opens the shared breakdown, named by the score; nothing of the breakdown is drawn until then", () => {
    const ash = rowHtml(html, "ash");
    expect(ash).toMatch(/<button type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Score 124: how it was worked out" data-testid="multikill-score-open" class="relative z-\[2\][^"]*pointer-coarse:min-h-11[^"]*">/);
    expect(ash).not.toContain("multikill-breakdown");
  });

  it("show the most-played role's icon beside the name, named by what it says, its ⓘ every position's share; a split shows both icons; an unknown role no icon", () => {
    const ash = rowHtml(html, "ash");
    expect(ash).toMatch(/aria-label="Most played: Mid, 85% of 40 games"[^>]*data-testid="multikill-role"/);
    expect(ash).toContain('data-role-kind="role" data-roles="MID"');
    // The distribution, for screen readers (the bubble shows it on hover, focus or tap).
    expect(ash).toContain("Mid — 85% (34 games)");
    expect(ash).toContain("Unknown — 5% (2 games)");
    // Above the row's link (the row opens the Peek), 44px on a touch screen.
    expect(ash).toMatch(/class="[^"]*relative z-\[2\][^"]*pointer-coarse:min-h-11[^"]*"[^>]*data-testid="multikill-role"|data-testid="multikill-role"[^>]*class="[^"]*relative z-\[2\]/);
    const bo = rowHtml(html, "bo");
    expect(bo).toContain('aria-label="Split: Top and Mid, 45% each"');
    expect(bo).toContain('data-role-kind="split" data-roles="TOP MID"');
    expect(count(bo, /data-role-icon="(TOP|MID)"/g)).toBe(2);
    const cy = rowHtml(html, "cy");
    expect(cy).not.toContain("data-role-icon");
    expect(cy).toContain('<span class="sr-only" data-testid="multikill-role" data-role-kind="unknown">Role unknown: no position recorded in these games</span>');
  });

  it("say the games and the kinds made in words under the name on a phone (the table's columns from 26rem), read once", () => {
    const ash = rowHtml(html, "ash");
    // A kind with none is left out of the phone's line (its words for screen readers still say every kind).
    // Each item whole, its "·" at its own end after a no-break space (so a wrapped line ends with the dot and the next starts
    // with a figure: "· 2 pentas" started a line until the owner's review of 25 Nov 2026).
    expect(shownOf(ash, "multikill-words")).toBe("40 games\u00a0·25 doubles\u00a0·2 triples\u00a0·1 penta");
    const items = [...innerOf(ash, "multikill-words")!.matchAll(/<span class="whitespace-nowrap" data-word="">(.*?)<\/span><\/span>|<span class="whitespace-nowrap" data-word="">([^<]*)<\/span>/g)].map((m) => (m[1] ?? m[2]!).replace(/<[^>]+>/g, ""));
    expect(items).toEqual(["40 games\u00a0·", "25 doubles\u00a0·", "2 triples\u00a0·", "1 penta"]);
    expect(ash).toMatch(/<span aria-hidden="true" class="[^"]*@min-\[26rem\]\/list:hidden" data-testid="multikill-words">/);
    expect(ash).toContain('<span class="sr-only @min-[26rem]/list:hidden">40 games with multikill counts, 25 double kills, 2 triple kills, 0 quadra kills, 1 pentakills</span>');
  });

  it("open the player's Peek or profile from the whole row; your own row marked", () => {
    const ash = rowHtml(html, "ash");
    expect(ash).toContain('data-row-link="" href="/players/ash"><span class="sr-only">Ash</span>');
    const bo = rowHtml(html, "bo");
    expect(bo).toContain('data-you="true"');
    expect(bo).toContain("bg-accent/5");
  });

  it("say what the score is ranked by under the heading, what earns points behind one short ⓘ, and how to read a score at the foot", () => {
    expect(html).toContain('<h2 id="multikills-title"');
    expect(decode(innerOf(html, "multikills-title" as string) ?? "")).not.toContain("Season");
    expect(html).toMatch(/<h2 id="multikills-title"[^>]*>[\s\S]*?<span class="min-w-0">Multikills<\/span><\/h2>/);
    expect(shownOf(html, "multikill-basis")).toBe("Ranked by multikill performance relative to the champions and roles played.");
    expect(html).toContain('aria-label="How the multikill score works"');
    expect(html).toContain("Multikills earn 2–5 points. The score compares a player&#x27;s points with typical results for their champions and roles, accounting for games played.");
    expect(html).not.toContain("multikill-explain-point");
    expect(shownOf(html, "multikill-score-legend")).toBe("Below 100 below typical100 typicalAbove 100 above typicalFrom 31 of 32 games");
    // The counting rule, for the Production check (it reads no ⓘ).
    expect(html).toMatch(/data-testid="multikill-score-legend" data-counting-rule="nested" data-counting-shown="true"/);
    // Never a raw percentage: no "30% more".
    expect(html).not.toMatch(/% more/);
  });

  it("share the spare room of a shorter board over their rows, the legend right under the last (the review of 25 Nov 2026: one blank band above the legend)", () => {
    const html = render();
    // The section carries the rows' count; the list grows into the board's room up to 3.5rem a row, never shorter than its content.
    expect(html).toMatch(/<section id="multikills"[^>]* style="--fill-rows:3" data-testid="multikills">/);
    const list = /<ol aria-label="Multikill score ranking" data-testid="multikill-rows" class="([^"]*)">/.exec(html);
    expect(decode(list![1]!)).toContain("flex flex-auto flex-col min-h-min max-h-[calc(var(--fill-rows)*3.5rem)]");
    // Each row its equal share (its content centred, DataRow's own).
    const rows = [...html.matchAll(/<li class="([^"]*)" data-testid="multikill-row"/g)];
    expect(rows).toHaveLength(3);
    for (const m of rows) expect(m[1]!.split(" ")).toContain("flex-auto");
    // The legend is the next line: no auto margin pushing it to the panel's foot (the band it left above itself).
    const legend = /<p class="([^"]*)" data-testid="multikill-score-legend"/.exec(html)!;
    expect(legend[1]).not.toContain("mt-auto");
    expect(html.indexOf('data-testid="multikill-score-legend"')).toBeGreaterThan(html.lastIndexOf('data-testid="multikill-row"'));
    // The milestones likewise: their rows of cells share the room (three cells, two rows two to a row).
    const cells = /<ul aria-label="Milestones" class="([^"]*)" style="([^"]*)" data-testid="milestones-list">/.exec(html)!;
    expect(decode(cells[1]!)).toContain("flex-auto min-h-min max-h-[calc(var(--fill-rows)*3.5rem)] @min-[26rem]/list:max-h-[calc(var(--fill-rows-wide)*3.5rem)]");
    expect(cells[2]).toBe("--fill-rows:3;--fill-rows-wide:2");
  });

  it("list nobody who is not ranked: no provisional group, no \"No score yet\", no most-of-each tiles", () => {
    expect(html).not.toContain("multikill-unplaced");
    expect(html).not.toContain("Not placed yet");
    expect(html).not.toContain("No score yet");
    expect(html).not.toContain("multikill-most");
    expect(html).not.toContain("data-fold");
  });

  it("say so when nobody active has a place yet", () => {
    const empty = render({ records: { multikills: { ...MULTIKILLS, rows: [] }, multikillNote: null, multikillShort: null } });
    expect(shownOf(empty, "multikills-empty")).toBe("No active player has 20 games with multikill counts this season yet.");
    expect(empty).not.toContain("multikill-row");
    expect(empty).not.toContain("multikill-heads");
  });
});

describe("milestones", () => {
  const html = render();

  it("are at most eight cells, the most meaningful first: the champion, the player, the figure and its step in its rarity; the rest counted", () => {
    const cells = [...html.matchAll(/<li class="[^"]*" data-testid="milestone" data-tier="(\d)" data-kind="(\w+)" data-player-id="(\w+)">/g)].map((m) => [m[1], m[2], m[3]]);
    expect(cells).toEqual([["3", "mastery", "ash"], ["2", "games", "bo"], ["1", "games", "ash"]]);
    const riven = /data-tier="3"[\s\S]*?<\/li>/.exec(html)![0];
    expect(shownOf(riven, "milestone-champion")).toBe("Riven · 1.2M mastery");
    expect(riven).toContain('<span class="sr-only">, 1.2M mastery points, 1M+ milestone</span>');
    // Rarities on the champion's portrait: violet and gold rings, never a state colour.
    expect(riven).toMatch(/ring-2 ring-gold\/80" data-testid="milestone-portrait"/);
    expect(/data-tier="2"[\s\S]*?<\/li>/.exec(html)![0]).toMatch(/ring-2 ring-violet\/70" data-testid="milestone-portrait"/);
    expect(/data-tier="1"[\s\S]*?<\/li>/.exec(html)![0]).toMatch(/ring-1 ring-border-strong" data-testid="milestone-portrait"/);
    // Each cell opens the player's Peek (the profile on a board drawn alone).
    expect(riven).toContain('data-row-link="" href="/players/ash"');
    // The rest counted at the title's end; what counts behind its ⓘ.
    expect(shownOf(html, "milestones-more")).toBe("4 more on profiles");
    expect(html.indexOf('data-testid="milestones-more"')).toBeLessThan(html.indexOf('data-testid="milestones-list"'));
    expect(html).toContain('aria-label="What counts as a milestone"');
    expect(html).toContain("25, 50 or 100 games on one champion this season, or 100K, 500K or 1M mastery points on one. The rest are on players&#x27; profiles.");
    // One presentation, no kinds' captions, no fold.
    expect(html).not.toContain("milestones-games");
    expect(html).not.toContain("milestones-mastery");
    expect(html).not.toContain("milestone-member");
  });

  it("say so when nobody active has reached one, with no count of more", () => {
    const empty = render({ records: { milestones: { items: [], more: 0 } } });
    expect(shownOf(empty, "milestones-empty")).toBe("No milestones among the active players yet.");
    expect(empty).not.toContain('data-testid="milestone"');
    expect(empty).not.toContain("milestones-more");
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
    // The multikills' coverage stays in words at their foot (which games the counts come from).
    expect(shownOf(html, "multikill-short")).toBe("From 31 of 32 games");
  });

  it("links nowhere on the public boards: no link, no profile or game address, the names read", () => {
    const html = render({ profiles: false });
    expect(html).not.toMatch(/<a (?![^>]*href="#)/);
    expect(html).not.toContain("/players/");
    expect(html).not.toContain("lucide-chevron-right");
    expect(html).not.toMatch(/class="[^"]*\bhover:bg-surface-2[^"]*" data-testid="(multikill-row|milestone)"/);
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
