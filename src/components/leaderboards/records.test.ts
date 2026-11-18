import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import type { BoardPlayer, RecordHolder, RecordsView, RecordView } from "@/server/leaderboards/recent-view";
import { Records } from "./records";

/*
  Records & achievements as markup, for the states the demo never shows (its viewer has no profile,
  every record has a holder, and nothing is public): the viewer's own best and a record they hold, a
  record nobody holds yet, the public boards linking nowhere, empty multikills and milestones. The
  browser tests check the layout; this checks what each row says and how.
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
    seasons: [{ value: 16, label: "Season 2026", href: "/leaderboards?view=records" }],
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
const render = (o: { profiles?: boolean; viewer?: string | null; records?: Partial<RecordsView> } = {}) => {
  const profiles = o.profiles ?? true;
  return renderToStaticMarkup(createElement(Records, { records: view(profiles, o.records), player: players(profiles), champ, viewer: o.viewer === undefined ? (profiles ? "bo" : null) : o.viewer }));
};

/** Each season record's row, by record. */
const rowsOf = (html: string) => Object.fromEntries([...html.matchAll(/<li [^>]*data-testid="season-record" data-record="([\w-]+)"[\s\S]*?<\/li>/g)].map((m) => [m[1]!, m[0]]));
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

describe("the record book", () => {
  const html = render();
  const rows = rowsOf(html);

  it("is the page's lead card: seven rows, in the model's order, under one title", () => {
    expect(Object.keys(rows)).toEqual(["kills", "assists", "damage-per-minute", "cs-per-minute", "vision-per-minute", "kda", "win-streak"]);
    expect(html).toMatch(/data-testid="records-book" class="[^"]*"|class="[^"]*surface-lead[^"]*" data-testid="records-book"/);
    expect(count(html, /surface-lead/g)).toBe(1);
    expect(html).toContain('<h3 id="season-records-title"');
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
    // One ⓘ, named "How these records count", holding each definition and the tie rule (its text is the trigger's description).
    expect(count(html, /data-testid="records-definitions"/g)).toBe(1);
    expect(html).toContain('aria-label="How these records count"');
    const tip = /<span id="[^"]+" class="sr-only">([\s\S]*?)<\/span><\/span>/.exec(html.slice(html.indexOf('data-testid="records-definitions"')))![1]!;
    for (const words of ["Most damage per minute:</span> Damage to champions, in a game of 15 minutes or more.", "Most CS per minute:</span> Lane minions and monsters", "Most vision per minute:</span> Vision score", "Best KDA in a game:</span> (Kills + assists) ÷ deaths", "Longest win streak:</span> In the order the games were played.", "A tie goes to whoever set it first."]) expect(tip).toContain(words);
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

describe("the view", () => {
  it("says first that records reward playing more, in one sentence on a phone", () => {
    const html = render();
    expect(shownOf(html, "records-volume-note")).toBe("Records and achievements reward playing more: every game is another chance. How members are doing lately is on Recent form.");
    expect(html).toContain('<span class="@max-[36rem]/records:sr-only"> How members are doing lately is on Recent form.</span>');
  });

  it("indexes its sections for a phone, each link to a section on the page", () => {
    const html = render();
    const links = [...html.matchAll(/<a href="#([\w-]+)"[^>]*data-testid="section-index-link"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["season-records", "Season records"],
      ["multikills", "Multikills"],
      ["milestones", "Milestones"],
    ]);
    for (const [id] of links) expect(html).toContain(`<section id="${id}"`);
    expect(html).toMatch(/<nav aria-label="On this page" class="[^"]*@min-\[36rem\]\/records:hidden[^"]*" data-testid="section-index">/);
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
