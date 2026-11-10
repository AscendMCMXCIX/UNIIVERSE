import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLookFor } from "@/domain/card-style";
import type { BoardPlayer, FormRow, FormView } from "@/server/leaderboards/recent-view";
import { RecentForm, gapToken } from "./recent-leaderboards";

/*
  Recent form's board as markup, for the states the demo board never shows (it has no provisional
  window, no You row, no shared first place nor multi-win gap): a fixture of Ash first, Bo and Cy
  sharing second, Di (the viewer) fourth, Ed provisional at 9 of 14, and Fi and Gu without enough
  games. The browser tests check the layout; this checks what each row says and how.
*/

const WINDOW: FormView["window"] = { games: 20, provisionalFrom: 10, days: 60 };
const row = (o: Partial<FormRow> & Pick<FormRow, "playerId">): FormRow => ({ place: null, tied: false, status: "established", games: 20, wins: 10, losses: 10, winRate: 50, dates: "7 Oct – 6 Nov", role: { role: "MID", games: 14 }, note: null, gap: null, you: false, ...o });
const ROWS: FormRow[] = [
  row({ playerId: "ash", place: 1, wins: 13, losses: 7, winRate: 65, role: { role: "SUPPORT", games: 14 } }),
  row({ playerId: "bo", place: 2, tied: true, wins: 12, losses: 8, winRate: 60, note: "Win your next game to draw level with Ash", gap: { kind: "level", place: 1 } }),
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
    expect(rows.bo).toContain('<span aria-hidden="true" title="Tied for 2nd. Win your next game to draw level with Ash. Mid: 14 of 20 games" class="absolute inset-0 rounded-[inherit]"></span></a>');
    expect(rows.di).not.toMatch(/data-tie=|Tied for/);
  });

  it("names no list item: no row's li has a title, on the members' board or the public one", () => {
    const publicRows = rowsOf(render({}, false));
    expect(Object.keys(publicRows)).toEqual(["ash", "bo", "cy", "di", "ed"]);
    for (const [id, r] of [...Object.entries(rows), ...Object.entries(publicRows)]) expect(r, id).not.toMatch(/<li[^>]* title=/);
    // The public board has no link, so no row tooltip: the gap's sentence is its own cell's title.
    expect(publicRows.bo).not.toContain("absolute inset-0 rounded-[inherit]");
    expect(publicRows.bo).toMatch(/<span aria-hidden="true" data-testid="form-gap" title="Win your next game to draw level with Ash"/);
  });

  it("shows the gap short and keeps the sentence for screen readers: Next win: 2=, 1 win behind", () => {
    expect(textOf(rows.bo!, "form-gap")).toBe("Next win: 1=");
    expect(textOf(rows.cy!, "form-gap")).toBe("1 win behind");
    expect(textOf(rows.di!, "form-gap")).toBe("Next win: 2=");
    expect(textOf(rows.di!, "form-note")).toBe("Win your next game to draw level with Bo and Cy");
    expect(rows.di).toMatch(/<span aria-hidden="true" data-testid="form-gap"/);
    expect(rows.di).toMatch(/<span class="sr-only" data-testid="form-note">/);
  });

  it("marks your own row: the accent wash and bar, and You", () => {
    expect(rows.di).toMatch(/^<li class="[^"]*bg-accent\/5[^"]*"[^>]*data-you="true"/);
    expect(rows.di).toContain('<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent"></span>');
    expect(rows.di).toContain(">You<");
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
    expect(rows.ash).toContain('<span class="min-w-0 text-fg" aria-hidden="true">');
  });
});

describe("the board's last group: members without enough recent games", () => {
  const html = render();
  const members = [...html.matchAll(/<li [^>]*data-testid="form-not-enough-member" data-player-id="(\w+)"[\s\S]*?<\/li>/g)];

  it("lists each with the games they need and their last game, linked to their profile", () => {
    expect(members.map((m) => m[1])).toEqual(["fi", "gu"]);
    const visible = (li: string) => li.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "");
    expect(visible(members[0]![0])).toContain("Needs 4 more games · last game 3 Sep 2026");
    expect(visible(members[1]![0])).toContain("Needs 10 more games · no games yet");
    expect(members[0]![0]).toContain('href="/players/fi"');
    expect(members[1]![0]).toContain('href="/players/gu"');
    for (const [li] of members) {
      expect(count(li, /data-testid="card-name"/g)).toBe(1);
      expect(count(li, /data-row-link=""/g)).toBe(1);
    }
    expect(textOf(html, "form-not-enough-head")).toBe("Not enough recent games · 10 needed in the last 60 days");
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
    expect(html).not.toContain('<span class="min-w-0 text-fg" aria-hidden="true">');
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

  it("keeps the footnote's caveats, gaps for notes, and says what the bar counts", () => {
    const foot = textOf(render(), "form-footnote")!;
    expect(foot).toContain("places within 2 wins of each other are close");
    expect(foot).toContain("The gaps assume the players above don't play in the meantime");
    expect(foot).toContain("Each bar counts the window's games, wins first, not the order they were played");
  });
});

describe("gapToken (D5)", () => {
  it("is the gap short, in one place", () => {
    expect(gapToken(null, WINDOW)).toBe("—");
    expect(gapToken({ kind: "level", place: 3 }, WINDOW)).toBe("Next win: 3=");
    expect(gapToken({ kind: "behind", wins: 1, place: 2 }, WINDOW)).toBe("1 win behind");
    expect(gapToken({ kind: "behind", wins: 3, place: 2 }, WINDOW)).toBe("3 wins behind");
    expect(gapToken({ kind: "provisional", games: 14 }, WINDOW)).toBe("14 of 20 games");
  });
});
