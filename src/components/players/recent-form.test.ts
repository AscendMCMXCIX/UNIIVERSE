import { describe, expect, it } from "vitest";
import { recentForm, type FormGame } from "@/domain/recent-form";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RECENT_CHAMPIONS_SHOWN, RECENT_FORM_HELP, RecentFormStrip } from "./recent-form";

describe("Recent form's champions (the Overview's 2×2)", () => {
  // 20 recent games: Ahri 9 (5 won), Orianna 6, Azir 2, then one game each of Syndra, Galio and Jax.
  const plan = [...Array<string>(9).fill("Ahri"), ...Array<string>(6).fill("Orianna"), "Azir", "Azir", "Syndra", "Galio", "Jax"];
  const form = recentForm(plan.map((championId, i) => ({ matchId: `m${i}`, win: championId === "Ahri" ? i < 5 : i % 2 === 0, gameCreation: 1_000_000 - i, championId, kills: 5, deaths: 3, assists: 6, cs: 180, visionScore: 20, gameDuration: 1800 })));
  const render = (champions: boolean) => renderToStaticMarkup(createElement(RecentFormStrip, { form, championsById: {}, historyHref: "/h", champions }));

  it("lists the champions of the same games, most played first, each with its record: two to four in the server's drawing by the window's height, the rest as a count on the heading's line, every row there for the fitted list", () => {
    const html = render(true);
    const rows = [...html.matchAll(/data-champion="([^"]+)"/g)].map((m) => m[1]);
    // Every champion's row is drawn (the list shows as many as fit once interactive: FitChampions); each carries its rank.
    expect(rows).toEqual(["Ahri", "Orianna", "Azir", "Syndra", "Galio", "Jax"]);
    expect(html).toContain('data-champion="Jax" data-ov-rank="6"');
    expect(html).toContain("9 games · 5W 4L");
    // Until measured ("css"), "and N more" for the window's height: two rows shown under board-at-mid, three from it, RECENT_CHAMPIONS_SHOWN from board-at-short.
    expect(RECENT_CHAMPIONS_SHOWN).toBe(4);
    expect(html).toContain('<span class="board-at-mid:hidden">and 4 more</span><span class="hidden board-at-mid:board-below-short:inline">and 3 more</span><span class="hidden board-at-short:inline">and 2 more</span>');
    expect(html).toMatch(/class="flex min-w-0 items-center gap-2.5 py-1 group-data-\[fit=css\]\/fit:board-below-mid:hidden" data-champion="Azir"/);
    expect(html).toMatch(/class="flex min-w-0 items-center gap-2.5 py-1 group-data-\[fit=css\]\/fit:board-below-short:hidden" data-champion="Syndra"/);
    expect(html).toMatch(/class="flex min-w-0 items-center gap-2.5 py-1 group-data-\[fit=css\]\/fit:hidden" data-champion="Galio"/);
    expect(html).toContain('data-fit="css"');
    // Only where the 2×2 applies (a 1440px window, a 68rem dashboard), by CSS: no other layout grows.
    expect(html).toMatch(/class="hidden min-\[90rem\]:@min-\[68rem\]\/ov:block" data-testid="recent-form-champions"/);
  });

  it("draws one champion fewer in each height where Ranked progress has an account select (its title can take two lines)", () => {
    const html = renderToStaticMarkup(createElement(RecentFormStrip, { form, championsById: {}, historyHref: "/h", champions: true, fewer: true }));
    expect(html).toContain('<span class="board-at-mid:hidden">and 5 more</span><span class="hidden board-at-mid:board-below-short:inline">and 4 more</span><span class="hidden board-at-short:inline">and 3 more</span>');
    expect(html).toMatch(/class="flex min-w-0 items-center gap-2.5 py-1 group-data-\[fit=css\]\/fit:board-below-mid:hidden" data-champion="Orianna"/);
    expect(html).toMatch(/class="flex min-w-0 items-center gap-2.5 py-1 group-data-\[fit=css\]\/fit:board-below-short:hidden" data-champion="Azir"/);
    expect(html).toMatch(/class="flex min-w-0 items-center gap-2.5 py-1 group-data-\[fit=css\]\/fit:hidden" data-champion="Syndra"/);
  });

  it("is left out where the Overview has no Ranked progress beside Recent form", () => {
    expect(render(false)).not.toContain("recent-form-champions");
  });
});

/** n games, newest first: the newest `recentWins` of the first 20 won, every older game lost. */
function games(n: number, recentWins: number): FormGame[] {
  return Array.from({ length: n }, (_, i) => ({ matchId: `m${i}`, win: i < recentWins, gameCreation: 1_000_000 - i, championId: "Ahri", kills: 5, deaths: 3, assists: 6, cs: 180, visionScore: 20, gameDuration: 1800 }));
}

describe("Recent form's tip says what recentForm does", () => {
  it("names the window, the older games a trend needs and every figure's gap", () => {
    expect(RECENT_FORM_HELP).toBe("The latest 20 games against all in this filter. Trends and arrows need 10+ older games too and a clear gap: 8+ win-rate points, 15% KDA or vision, 0.5 CS/min.");
  });

  it("calls no trend with fewer than 10 games before the latest 20, however large the gap", () => {
    expect(recentForm(games(29, 20)).trend).toBeNull();
    expect(recentForm(games(30, 20)).trend).toBe("up");
  });
});
