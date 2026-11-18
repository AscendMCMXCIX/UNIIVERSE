import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import type { BoardPlayer, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
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

const holder = (o: Partial<RecordHolder> & Pick<RecordHolder, "playerId" | "value" | "unit">, profiles = true): RecordHolder => ({ championId: "Zed", role: "MID", kda: "18/2/7", when: "2 Sep 2026", href: profiles ? `/players/${o.playerId}/matches?match=OC1_001` : null, ...o });
const record = (o: Partial<RecordView> & Pick<RecordView, "id" | "label">): RecordView => ({ definition: "", qualifier: null, holder: null, yours: null, ...o });

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
      record({ id: "win-streak", label: "Longest win streak", definition: "In the order the games were played.", qualifier: "in game order", holder: { playerId: "ash", value: "5", unit: "wins in a row", championId: null, role: null, kda: null, when: "5 Sep 2026", href: null }, yours: { playerId: "bo", value: "2", unit: "wins in a row", championId: null, role: null, kda: null, when: "5 Sep 2026", href: null } }),
    ],
    multikills: [
      { playerId: "ash", penta: 1, quadra: 1, triple: 1 },
      { playerId: "cy", penta: 0, quadra: 0, triple: 3 },
    ],
    multikillNote: "From the 31 of 32 games this season that carry Riot's multikill figures; the others are left out, not counted as zero.",
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
    expect(shownOf(html, "records-scope")).toBe("Season 2026 · All supported games · 32 games");
    // One season: no choice to make.
    expect(html).not.toContain("records-season");
  });

  it("place their cells on a grid by the panel's width, each cell measuring itself, the seventh across both columns", () => {
    expect(html).toMatch(/<ul aria-label="Season records" class="grid grid-cols-\[minmax\(0,1fr\)\] [^"]*@min-\[40rem\]\/list:grid-cols-2" data-testid="season-records">/);
    const cells = [...html.matchAll(/<li class="([^"]*)"><div class="([^"]*)"><div [^>]*data-testid="season-record"/g)];
    expect(cells).toHaveLength(7);
    for (const [, cellClass, colsClass] of cells) {
      const [cell, cols] = [decode(cellClass!), decode(colsClass!)];
      expect(cell).toContain("@container/list");
      expect(cell).toContain("@min-[40rem]/list:[&:last-child:nth-child(odd)]:col-span-2");
      // Each cell holds its own column template, so its row reads the cell's width.
      expect(cols).toContain("[--dl-cols:3rem_minmax(5rem,1fr)_auto]");
      expect(cols).toContain("@min-[36rem]/list:[--dl-cols:3rem_minmax(0,1fr)_auto_1rem]");
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
      expect(rows[id]).toMatch(/href="\/players\/\w+\/matches\?match=OC1_001"/);
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

  it("shows each record's qualifier on its row, read after a comma, and every definition in one ⓘ", () => {
    // The "·" before it is drawn in the qualifier's own padding (cut off when the qualifier starts a line), hidden from screen readers.
    expect(shownOf(rows["damage-per-minute"]!, "record-qualifier")).toBe("·to champions · 15+ min games");
    expect(rows["damage-per-minute"]).toContain('<span aria-hidden="true" class="absolute left-1">·</span><span class="sr-only">, </span>to champions · 15+ min games');
    expect(shownOf(rows.kda!, "record-qualifier")).toBe("·10+ takedowns");
    expect(shownOf(rows["win-streak"]!, "record-qualifier")).toBe("·in game order");
    expect(rows.kills).not.toContain("record-qualifier");
    // One ⓘ, named "How these records count", holding that records reward playing more, each
    // definition and the tie rule (its text is the trigger's description).
    expect(count(html, /data-testid="records-definitions"/g)).toBe(1);
    expect(html).toContain('aria-label="How these records count"');
    const tip = /<span id="[^"]+" class="sr-only">([\s\S]*?)<\/span><\/span>/.exec(html.slice(html.indexOf('data-testid="records-definitions"')))![1]!;
    for (const words of ["Records reward playing more: every game is another chance.", "Most damage per minute:</span> Damage to champions, in a game of 15 minutes or more.", "Most CS per minute:</span> Lane minions and monsters", "Most vision per minute:</span> Vision score", "Best KDA in a game:</span> (Kills + assists) ÷ deaths", "Longest win streak:</span> In the order the games were played.", "A tie goes to whoever set it first."]) expect(tip).toContain(words);
    // No definition is left on a row: they are in the ⓘ.
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
  const html = render();

  it("are rows, rarest first as given, each count named for screen readers, — for none", () => {
    const rows = [...html.matchAll(/<li [^>]*data-testid="multikill-row"[^>]*data-player-id="(\w+)"[\s\S]*?<\/li>/g)];
    expect(rows.map((m) => m[1])).toEqual(["ash", "cy"]);
    expect(rows[0]![0]).toContain('data-penta="1" data-quadra="1" data-triple="1"');
    expect(rows[1]![0]).toMatch(/<span class="text-fg-subtle">—<\/span><span class="sr-only"> pentakills<\/span>/);
    expect(rows[1]![0]).toMatch(/<span class="font-semibold text-fg">3<\/span><span class="sr-only"> triple kills<\/span>/);
    // The whole row opens the member's profile, named by the member.
    expect(rows[0]![0]).toContain('data-row-link="" href="/players/ash"><span class="sr-only">Ash</span>');
    expect(html).toMatch(/<ol aria-label="Multikills, rarest first" data-testid="multikill-rows"/);
    expect(shownOf(html, "multikill-note")).toContain("left out, not counted as zero");
  });

  it("say so when there are none", () => {
    const empty = render({ records: { multikills: [], multikillNote: null } });
    expect(shownOf(empty, "multikills-empty")).toBe("No triple kills or better this season yet.");
    expect(empty).not.toContain("multikill-note");
    expect(empty).not.toContain("multikill-row");
  });
});

describe("milestones", () => {
  const html = render();

  it("are member rows: the name, then the chips, the figure short (486K), the rest counted", () => {
    const mastery = html.slice(html.indexOf('data-testid="milestones-mastery"'));
    expect(mastery).toContain('data-testid="milestones-mastery-list"');
    const member = /<li [^>]*data-testid="milestone-member" data-player-id="ash"[\s\S]*?<\/ul><\/li>/.exec(mastery)![0];
    expect(count(member, /data-testid="milestone"/g)).toBe(3);
    expect([...member.matchAll(/data-testid="milestone-figure">([^<]*)</g)].map((m) => m[1])).toEqual(["1.2M", "486K", "333K"]);
    // Screen readers hear each in words, the champion's name included (hidden on a phone, D6).
    expect(member).toContain('data-testid="milestone-champion">Zed</span><span aria-hidden="true" class="shrink-0 tabular-nums text-fg-muted" data-testid="milestone-figure">486K</span><span class="sr-only"> 486K points, 100K+ milestone</span>');
    expect(member).toMatch(/@max-\[32rem\]\/list:sr-only" data-testid="milestone-champion"/);
    expect(shownOf(member, "milestone-more")).toBe("+2 more");
    expect(member).toContain('<span class="sr-only">and 2 more on their profile</span>');
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
    expect(innerOf(html, "milestones-mastery")).toMatch(/<span id="[^"]+" class="sr-only">Riot&#x27;s champion mastery over each member&#x27;s linked accounts: 100K, 500K and 1M points\./);
    // The multikills' coverage stays in words under their title: it says which games the counts come from.
    expect(shownOf(html, "multikill-note")).toBe("From the 31 of 32 games this season that carry Riot's multikill figures; the others are left out, not counted as zero.");
  });

  it("links nowhere on the public boards: no link, no profile or game address, the names read and the chips titled", () => {
    const html = render({ profiles: false });
    expect(html).not.toMatch(/<a (?![^>]*href="#)/);
    expect(html).not.toContain("/players/");
    expect(html).not.toContain("lucide-chevron-right");
    expect(html).not.toContain("hover:bg-surface-2");
    expect(html).toContain('title="Zed: 486K points (100K+ milestone)"');
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
