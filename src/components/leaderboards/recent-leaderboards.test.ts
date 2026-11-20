import { describe, expect, it, vi } from "vitest";

// The names link with IntentLink (prefetch on intent), which asks for the router: none in a markup test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: () => {} }), usePathname: () => "/leaderboards", useSearchParams: () => new URLSearchParams() }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import { buildFormView, type BoardPlayer, type FormRow, type FormView } from "@/server/leaderboards/recent-view";
import type { LeaderboardGame } from "@/domain/leaderboards";
import type { LeaderboardData } from "@/server/leaderboards/service";
import { RecentForm, gapToken } from "./recent-leaderboards";

/*
  Recent form's board (the Leaderboards page's lead card) as markup, for the states the demo board never shows (it has no provisional
  window, no You row, no shared first place nor multi-win gap): a fixture of Ash first, Bo and Cy
  sharing second, Di (the viewer) fourth, Ed provisional at 9 of 14, and Fi and Gu without enough
  games. The browser tests check the layout; this checks what each row says and how.
*/

const WINDOW: FormView["window"] = { games: 20, provisionalFrom: 10, days: 60 };
const row = (o: Partial<FormRow> & Pick<FormRow, "playerId">): FormRow => ({ place: null, tied: false, status: "established", games: 20, wins: 10, losses: 10, winRate: 50, dates: "7 Oct – 6 Nov", role: { role: "MID", games: 14 }, note: null, gap: null, you: false, ...o });
const ROWS: FormRow[] = [
  row({ playerId: "ash", place: 1, wins: 13, losses: 7, winRate: 65, role: { role: "SUPPORT", games: 14 } }),
  row({ playerId: "bo", place: 2, tied: true, wins: 12, losses: 8, winRate: 60, note: "Bo draws level with Ash by winning their next game", gap: { kind: "level", place: 1 } }),
  row({ playerId: "cy", place: 2, tied: true, wins: 12, losses: 8, winRate: 60, note: "1 win behind Ash", gap: { kind: "behind", wins: 1, place: 1 } }),
  row({ playerId: "di", place: 4, wins: 11, losses: 9, winRate: 55, note: "Win your next game to draw level with Bo and Cy", gap: { kind: "level", place: 2 }, you: true }),
  row({ playerId: "ed", status: "provisional", games: 14, wins: 9, losses: 5, winRate: 64, note: "Provisional · 14 of 20 games", gap: { kind: "provisional", games: 14 }, role: null }),
];
const NOT_ENOUGH: FormView["notEnough"] = [
  { playerId: "fi", games: 6, needed: 4, lastGame: "3 Sep 2026" },
  { playerId: "gu", games: 0, needed: 10, lastGame: null },
];
const NAMES: Record<string, string> = { ash: "Ash", bo: "Bo", cy: "Cy", di: "Di", ed: "Ed", fi: "Fi", gu: "Gu" };
const players = (profiles: boolean) => (id: string): BoardPlayer => ({ id, name: NAMES[id]!, profileHref: profiles ? `/players/${id}` : null, avatarUrl: null, look: cardLookFor({ id }) });
const render = (form: Partial<FormView> = {}, profiles = true) => renderToStaticMarkup(createElement(RecentForm, { form: { rows: ROWS, notEnough: NOT_ENOUGH, window: WINDOW, ...form }, player: players(profiles), viewer: "di" }));

/** Each form-row's markup, by member. */
const rowsOf = (html: string) => Object.fromEntries([...html.matchAll(/<li [^>]*data-testid="form-row"[^>]*data-player-id="(\w+)"[\s\S]*?<\/li>/g)].map((m) => [m[1]!, m[0]]));
/** The text of the first element with this test id (its own text, tags removed). */
const textOf = (html: string, testId: string) => {
  const m = new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  return m ? decode(m[2]!.replace(/<[^>]+>/g, "")) : null;
};
const decode = (text: string) => text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

describe("Recent form's rows", () => {
  const html = render();
  const rows = rowsOf(html);

  it("say each fact once: one record, dates, role, bar and name per row, ranked rows first", () => {
    expect(Object.keys(rows)).toEqual(["ash", "bo", "cy", "di", "ed"]);
    for (const [id, r] of Object.entries(rows)) {
      for (const testId of ["form-record", "form-dates", "form-role", "form-bar", "card-name", "form-gap", "form-place", "form-win-rate", "form-meta"]) expect(count(r, new RegExp(`data-testid="${testId}"`, "g")), `${id}: ${testId}`).toBe(1);
      expect(count(r, /data-row-link=""/g), `${id}: one link`).toBe(1);
    }
    // The ranked rows, then the provisional strip and its row, then the last group.
    expect(html.indexOf('data-testid="form-rows"')).toBeLessThan(html.indexOf('data-testid="form-provisional-head"'));
    expect(html.indexOf('data-testid="form-provisional"')).toBeLessThan(html.indexOf('data-testid="form-not-enough-head"'));
    // Its caption's "·" held to its words by no-break spaces, as the last group's.
    expect(textOf(html, "form-provisional-head")).toBe("Provisional\u00a0·\u00a010 to 19 recent games, listed after every full window");
  });

  it("first place: the crown, no gap (—) and no sentence", () => {
    expect(rows.ash).toContain('aria-label="First place"');
    expect(textOf(rows.ash!, "form-gap")).toBe("—");
    expect(rows.ash).not.toContain("form-note");
    expect(rows.ash).toMatch(/title="Support: 14 of 20 games"/);
  });

  it("a shared place reads 2=, Tied for 2nd, and its bracket joins the two rows", () => {
    for (const [id, tie] of [["bo", "start"], ["cy", "end"]] as const) {
      expect(rows[id]).toMatch(new RegExp(`data-testid="form-place" data-tie="${tie}" title="Tied for 2nd"`));
      expect(rows[id]).toContain('<span aria-hidden="true">2=</span><span class="sr-only">Tied for 2nd</span>');
      expect(rows[id]).toMatch(/pointer-events-none absolute col-\[1\/2\] -right-1/);
      expect(rows[id]).toContain("data-tied");
    }
    // The row's tooltip names the tie first, then the gap's sentence and the role's games, from the
    // aria-hidden layer inside the row's link (RowLink's hint).
    expect(rows.bo).toContain('<span aria-hidden="true" title="Tied for 2nd. Bo draws level with Ash by winning their next game. Mid: 14 of 20 games" class="absolute inset-0 rounded-[inherit]"></span></a>');
    expect(rows.di).not.toMatch(/data-tie=|Tied for/);
  });

  it("names no list item: no row's li has a title, on the members' board or the public one", () => {
    const publicRows = rowsOf(render({}, false));
    expect(Object.keys(publicRows)).toEqual(["ash", "bo", "cy", "di", "ed"]);
    for (const [id, r] of [...Object.entries(rows), ...Object.entries(publicRows)]) expect(r, id).not.toMatch(/<li[^>]* title=/);
    // The public board has no link, so no row tooltip: the gap's sentence is its own cell's title.
    expect(publicRows.bo).not.toContain("absolute inset-0 rounded-[inherit]");
    expect(publicRows.bo).toMatch(/<span aria-hidden="true" data-testid="form-gap" title="Bo draws level with Ash by winning their next game"/);
  });

  it("shows the gap short and keeps the sentence for screen readers: A win ties 2nd, 1 win behind", () => {
    expect(textOf(rows.bo!, "form-gap")).toBe("A win ties 1st");
    expect(textOf(rows.cy!, "form-gap")).toBe("1 win behind");
    expect(textOf(rows.di!, "form-gap")).toBe("A win ties 2nd");
    expect(textOf(rows.di!, "form-note")).toBe("Win your next game to draw level with Bo and Cy");
    expect(rows.di).toMatch(/<span aria-hidden="true" data-testid="form-gap"/);
    expect(rows.di).toMatch(/<span class="sr-only" data-testid="form-note">/);
  });

  it("marks your own row: the accent wash and bar, and You", () => {
    expect(rows.di).toMatch(/^<li class="[^"]*bg-accent\/5[^"]*"[^>]*data-you="true"/);
    expect(rows.di).toContain('<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent"></span>');
    expect(rows.di).toContain(">You<");
    // On a narrow board "You" drops under a name whose longest word would not fit beside it (MemberCell's youWraps; e2e/large-text-leaderboards.spec.ts).
    expect(rows.di).toMatch(/<span class="flex min-w-0 items-center gap-1\.5 @max-\[36rem\]\/list:flex-wrap"><a [^>]*class="[^"]*min-w-0[^"]*text-fg[^"]*@max-\[36rem\]\/list:w-min @max-\[36rem\]\/list:max-w-max @max-\[36rem\]\/list:grow"[\s\S]*?data-testid="card-you"/);
    for (const id of ["ash", "bo", "cy", "ed"]) expect(rows[id]).not.toMatch(/bg-accent\/5|data-you|>You</);
  });

  it("a provisional window: no place (–), its games as the gap, its missing games outlined in the bar", () => {
    expect(rows.ed).toContain('<span aria-hidden="true">–</span><span class="sr-only">Provisional</span>');
    expect(rows.ed).not.toContain("data-place=");
    expect(textOf(rows.ed!, "form-gap")).toBe("14 of 20 games");
    expect(textOf(rows.ed!, "form-note")).toBe("Provisional · 14 of 20 games");
    expect(rows.ed).toMatch(/data-testid="form-bar" data-segments="20" data-filled="9" data-known="14"/);
    expect(count(rows.ed!, /data-state="missing"/g)).toBe(6);
    expect(rows.ed).toContain("No role recorded");
  });

  it("reads each figure in words: the win rate, the record, the dates, the role", () => {
    expect(rows.ash).toContain('65%<span class="sr-only"> win rate</span>');
    expect(rows.ash).toContain('<span aria-hidden="true">13W 7L</span><span class="sr-only">13 wins, 7 losses</span>');
    expect(rows.ash).toContain('<span class="sr-only">Games from </span>7 Oct – 6 Nov');
    expect(rows.ash).toContain("Support</span><span class=\"sr-only\"> main role (14 of 20 games)</span>");
    // The link says the member's name (its tooltip layer after it is aria-hidden), so the visible one is not read twice.
    expect(rows.ash).toContain('data-row-link="" href="/players/ash"><span class="sr-only">Ash</span><span aria-hidden="true" title=');
    // The name itself is the profile's link (over the row's own, which opens the player Peek on the page: PLAN S8a).
    const nameLink = /<a [^>]*data-testid="board-member-profile"[^>]*>/.exec(rows.ash!)?.[0] ?? "";
    expect(nameLink).toContain('href="/players/ash"');
    expect(nameLink).toContain('data-prefetch="intent"');
  });
});

describe("the board's last group: members without enough recent games", () => {
  const html = render();
  const members = [...html.matchAll(/<li [^>]*data-testid="form-not-enough-member" data-player-id="(\w+)"[\s\S]*?<\/li>/g)];

  it("lists each with the games they need and their last game, linked to their profile", () => {
    expect(members.map((m) => m[1])).toEqual(["fi", "gu"]);
    const visible = (li: string) => li.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "");
    // The "·" held to its words by no-break spaces, so it never ends or starts a line.
    expect(visible(members[0]![0])).toContain("Needs 4 more games\u00a0·\u00a0last game 3 Sep 2026");
    expect(visible(members[1]![0])).toContain("Needs 10 more games\u00a0·\u00a0no games yet");
    expect(members[0]![0]).toContain('href="/players/fi"');
    expect(members[1]![0]).toContain('href="/players/gu"');
    for (const [li] of members) {
      expect(count(li, /data-testid="card-name"/g)).toBe(1);
      expect(count(li, /data-row-link=""/g)).toBe(1);
    }
    expect(textOf(html, "form-not-enough-head")).toBe("Not enough recent games\u00a0·\u00a010 needed in the last 60 days");
    expect(html).toMatch(/<ul aria-label="Not enough recent games" data-testid="form-not-enough"/);
  });
});

describe("the board's markup", () => {
  it("nests nothing a browser would rearrange: no block inside a paragraph, only li in a list", () => {
    const html = render();
    expect(html).not.toMatch(/<p[ >](?:(?!<\/p>)[\s\S])*<(div|ul|ol|p)[ >]/);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /);
    for (const list of html.match(/<(ol|ul)[^>]*>[\s\S]*?<\/\1>/g) ?? []) expect(list.replace(/^<(ol|ul)[^>]*>|<\/(ol|ul)>$/g, "")).toMatch(/^(<li[\s\S]*?<\/li>)*$/);
  });

  it("links nowhere on the public board: no link, no profile address", () => {
    const html = render({}, false);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/players/");
    expect(html).not.toContain("hover:bg-surface-2");
    // The names are read where there is no link to say them.
    expect(html).not.toMatch(/<span class="min-w-0 text-fg[^"]*" aria-hidden="true">/);
    expect(html).toMatch(/<span class="min-w-0 text-fg[^"]*"><span class="flex min-w-0 items-start/);
  });

  it("with no window of 10 games yet: one row saying so inside the board, no headings, and the last group", () => {
    const html = render({ rows: [] });
    const board = html.slice(html.indexOf('data-testid="form-board"'));
    expect(board).toContain('data-testid="form-empty"');
    expect(textOf(html, "form-empty")).toBe("Nobody has 10 games in the last 60 days yet. Members appear here from their 10th recent game.");
    expect(html).not.toContain("form-heads");
    expect(html).toContain('data-testid="form-not-enough"');
    expect(html.indexOf('data-testid="form-empty"')).toBeLessThan(html.indexOf('data-testid="form-not-enough"'));
  });

  it("keeps the board's caveats behind the ⓘ in its title (no footnote under it), in two short sentences: a small sample, what the bar counts", () => {
    const html = render();
    expect(html).toContain('aria-label="How Recent form counts"');
    // The ⓘ's text is its trigger's description, always in the page for screen readers.
    const tip = /<span id="[^"]+" class="sr-only">([^<]*)<\/span>/.exec(html.slice(html.indexOf('data-testid="form-footnote"')))![1]!;
    const foot = decode(tip);
    expect(foot).toBe("20 games is a small sample, so places within 2 wins are close. Bars show wins first, not the order the games were played.");
    expect(html).not.toMatch(/<p[^>]*data-testid="form-footnote"/);
  });

  it("is the page's lead card, its first row its title: Recent form, what it counts, ranked by win rate for screen readers", () => {
    const html = render();
    expect(html).toContain('<section id="recent-form" aria-labelledby="form-board-title"');
    expect(html).toMatch(/class="[^"]*surface-lead[^"]*" data-testid="form-board"/);
    expect(html).toMatch(/<h2 id="form-board-title" class="[^"]*">(?:(?!<\/h2>)[\s\S])*Recent form<span class="sr-only">, ranked by win rate over each member&#x27;s latest 20 games<\/span>/);
    expect(textOf(html, "form-scope")).toBe("Latest 20 games from the last 60 days · Summoner's Rift, 5 minutes or longer");
    // The title row comes first, then the column headings, then the ranking.
    expect(html.indexOf('id="form-board-title"')).toBeLessThan(html.indexOf('data-testid="form-heads"'));
    expect(html.indexOf('data-testid="form-heads"')).toBeLessThan(html.indexOf('data-testid="form-rows"'));
  });
});

describe("gapToken (D5)", () => {
  it("is the gap short, in one place", () => {
    expect(gapToken(null, WINDOW)).toBe("—");
    expect(gapToken({ kind: "level", place: 3 }, WINDOW)).toBe("A win ties 3rd");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map((place) => gapToken({ kind: "level", place }, WINDOW))).toEqual(["A win ties 1st", "A win ties 2nd", "A win ties 3rd", "A win ties 4th", "A win ties 11th", "A win ties 12th", "A win ties 13th", "A win ties 21st", "A win ties 22nd"]);
    expect(gapToken({ kind: "behind", wins: 1, place: 2 }, WINDOW)).toBe("1 win behind");
    expect(gapToken({ kind: "behind", wins: 3, place: 2 }, WINDOW)).toBe("3 wins behind");
    expect(gapToken({ kind: "provisional", games: 14 }, WINDOW)).toBe("14 of 20 games");
  });
});

describe("the draw-level sentence follows the viewer (PLAN §1.12)", () => {
  // Built by the page's own view: Ash 13 of 20, Bo 12 of 20 with the oldest a loss, so one win draws Bo level with Ash.
  const T0 = Date.UTC(2026, 9, 1, 10);
  const DAY = 86_400_000;
  let seq = 0;
  const game = (playerId: string, day: number, win: boolean): LeaderboardGame => {
    seq += 1;
    return { matchId: `OC1_${seq}`, playerId, championId: "Ahri", role: "MID", queueId: 420, patch: "16.20", win, gameCreation: T0 + day * DAY, durationS: 1800, kills: 4, deaths: 4, assists: 6, cs: 200, damage: 20_000, vision: 30, gold: 11_000, wardsPlaced: 10, teamKills: 20, teamDamage: 80_000, extra: null };
  };
  const games = [...Array.from({ length: 20 }, (_, i) => game("ash", 1 + i, i >= 7)), ...Array.from({ length: 20 }, (_, i) => game("bo", 1 + i, i >= 8))];
  const person = (id: string, name: string) => ({ id, name, avatarUrl: null, look: cardLookFor({ id }), art: null, rank: null, primaryRole: null });
  const data: LeaderboardData = { players: [person("ash", "Ash"), person("bo", "Bo")], games, mastery: [], lineupIds: ["ash", "bo"], currentSeason: 16, seasons: [16], lastUpdated: null, extraSince: null, rawGames: 0 };
  const noteFor = (viewer: string) => {
    const form = buildFormView(data, viewer, { now: new Date(T0 + 30 * DAY) });
    const html = renderToStaticMarkup(createElement(RecentForm, { form, player: players(true), viewer }));
    return textOf(rowsOf(html).bo!, "form-note");
  };

  it("says \"your\" on the viewer's own row", () => {
    expect(noteFor("bo")).toBe("Win your next game to draw level with Ash");
  });

  it("names the player on a teammate's row, never \"you\" or \"your\"", () => {
    const note = noteFor("ash");
    expect(note).toBe("Bo draws level with Ash by winning their next game");
    expect(note).not.toMatch(/\byour?\b/i);
  });
});
