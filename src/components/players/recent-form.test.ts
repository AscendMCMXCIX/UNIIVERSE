import { describe, expect, it } from "vitest";
import { recentForm, type FormGame } from "@/domain/recent-form";
import { RECENT_FORM_HELP } from "./recent-form";

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
