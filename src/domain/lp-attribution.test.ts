import { describe, expect, it } from "vitest";
import { attributeLp, mergeReadings, type QueueGame, type RankReadingRow } from "./lp-attribution";

const BASE = Date.UTC(2026, 9, 20, 8, 0);
/** Minutes after BASE, in ms. */
const t = (min: number) => BASE + min * 60_000;
const game = (matchId: string, createdMin: number, durationMin: number, win: boolean): QueueGame => ({ matchId, createdAt: t(createdMin), durationS: Math.round(durationMin * 60), win });
const read = (tier: string | null, division: string | null, lp: number | null, wins: number | null, losses: number | null, atMin: number, confirmedMin?: number): RankReadingRow => ({
  tier,
  division,
  leaguePoints: lp,
  wins,
  losses,
  capturedAt: t(atMin),
  confirmedAt: confirmedMin === undefined ? null : t(confirmedMin),
});

/** Twenty games before the first reading (10 wins, 10 losses), so Riot's count and the stored games agree. */
const history = Array.from({ length: 20 }, (_, i) => game(`old${i}`, -2000 + i * 60, 25, i % 2 === 0));

describe("attributeLp", () => {
  it("gives a game the LP between a reading taken during it and one taken just after it", () => {
    const games = [...history, game("m", 22, 25, true)];
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 70, 11, 10, 50)];
    const lp = attributeLp(readings, games).get("m");
    expect(lp).toEqual({ kind: "lp", delta: 24, before: { label: "Gold II", leaguePoints: 46, at: t(30) }, after: { label: "Gold II", leaguePoints: 70, at: t(50) } });
  });

  it("records a loss as the LP it cost", () => {
    const games = [...history, game("m", 22, 31, false)];
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 21), read("GOLD", "II", 25, 10, 11, 56)];
    expect(attributeLp(readings, games).get("m")).toMatchObject({ kind: "lp", delta: -21 });
  });

  it("never gives one game the change across several: every game between the readings is not recorded", () => {
    const games = [...history, game("a", 22, 25, true), game("b", 55, 28, false)];
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 50, 11, 11, 90)];
    const out = attributeLp(readings, games);
    for (const id of ["a", "b"]) expect(out.get(id)).toMatchObject({ kind: "none", reason: "several-games", games: 2, before: { leaguePoints: 46 }, after: { leaguePoints: 50 } });
  });

  it("needs the earlier reading to hold when the game began (no room for a dodge before it)", () => {
    const games = [...history, game("m", 130, 25, true)];
    // Last seen two hours before the game was created.
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 10), read("GOLD", "II", 70, 11, 10, 160)];
    expect(attributeLp(readings, games).get("m")).toMatchObject({ kind: "none", reason: "readings-too-far" });
    // Seen four minutes before the game was created: inside the dodge lockout, so it holds.
    const close = [read("GOLD", "II", 46, 10, 10, 0, 126), read("GOLD", "II", 70, 11, 10, 160)];
    expect(attributeLp(close, games).get("m")).toMatchObject({ kind: "lp", delta: 24 });
  });

  it("needs the later reading soon after the game ended", () => {
    const games = [...history, game("m", 22, 25, true)];
    const late = [read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 70, 11, 10, 22 + 25 + 30)];
    expect(attributeLp(late, games).get("m")).toMatchObject({ kind: "none", reason: "readings-too-far" });
  });

  it("shows a change of division as the promotion or demotion it is, with no LP figure", () => {
    const up = attributeLp([read("GOLD", "II", 90, 10, 10, 0, 30), read("GOLD", "I", 12, 11, 10, 50)], [...history, game("m", 22, 25, true)]).get("m");
    expect(up).toEqual({ kind: "promoted", before: { label: "Gold II", leaguePoints: 90, at: t(30) }, after: { label: "Gold I", leaguePoints: 12, at: t(50) } });
    const down = attributeLp([read("GOLD", "IV", 3, 10, 10, 0, 30), read("SILVER", "I", 75, 10, 11, 50)], [...history, game("m", 22, 25, false)]).get("m");
    expect(down).toMatchObject({ kind: "demoted", after: { label: "Silver I" } });
  });

  it("reads Master and above as one LP ladder, across apex tiers too", () => {
    expect(attributeLp([read("MASTER", null, 120, 10, 10, 0, 30), read("MASTER", null, 141, 11, 10, 50)], [...history, game("m", 22, 25, true)]).get("m")).toMatchObject({ kind: "lp", delta: 21 });
    expect(attributeLp([read("MASTER", null, 480, 10, 10, 0, 30), read("GRANDMASTER", null, 502, 11, 10, 50)], [...history, game("m", 22, 25, true)]).get("m")).toMatchObject({ kind: "lp", delta: 22 });
  });

  it("gives no figure in a promotion series (100 LP below Master), but a won series is a promotion", () => {
    expect(attributeLp([read("PLATINUM", "I", 100, 10, 10, 0, 30), read("PLATINUM", "I", 100, 11, 10, 50)], [...history, game("m", 22, 25, true)]).get("m")).toMatchObject({ kind: "none", reason: "series" });
    expect(attributeLp([read("PLATINUM", "I", 100, 10, 10, 0, 30), read("EMERALD", "IV", 0, 11, 10, 50)], [...history, game("m", 22, 25, true)]).get("m")).toMatchObject({ kind: "promoted" });
  });

  it("leaves a remake out: Riot does not count it, and the game after it still gets its figure", () => {
    const games = [...history, game("remake", 5, 3.5, false), game("m", 22, 25, true)];
    const out = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 70, 11, 10, 50)], games);
    expect(out.get("remake")).toEqual({ kind: "none", reason: "remake" });
    expect(out.get("m")).toMatchObject({ kind: "lp", delta: 24 });
  });

  it("marks games before the first reading, and after the last, as not recorded", () => {
    const games = [...history, game("m", 22, 25, true), game("later", 100, 25, false)];
    const out = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 70, 11, 10, 50)], games);
    expect(out.get("old0")).toEqual({ kind: "none", reason: "before-tracking", trackingSince: t(0) });
    expect(out.get("later")).toEqual({ kind: "none", reason: "awaiting-reading" });
    expect(attributeLp([], games).get("m")).toEqual({ kind: "none", reason: "before-tracking" });
  });

  it("attributes nothing where Riot counted a game the store does not have", () => {
    // Riot's count rises by two, but only one game is stored between the readings.
    const games = [...history, game("m", 22, 25, true)];
    const out = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 60, 11, 11, 90)], games);
    expect(out.get("m")).toMatchObject({ kind: "none", reason: "inconsistent" });
  });

  it("attributes nothing when the result disagrees with what Riot counted", () => {
    const out = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 25, 10, 11, 50)], [...history, game("m", 22, 25, true)]);
    expect(out.get("m")).toMatchObject({ kind: "none", reason: "inconsistent" });
  });

  it("allows for Riot counting a game a few minutes late", () => {
    // Read once more a minute after the game ended (not counted yet), then counted at the next reading.
    const games = [...history, game("m", 22, 25, true)];
    const readings = [read("GOLD", "II", 46, 10, 10, 0), read("GOLD", "II", 46, 10, 10, 30), read("GOLD", "II", 46, 10, 10, 48), read("GOLD", "II", 70, 11, 10, 53)];
    expect(attributeLp(readings, games).get("m")).toMatchObject({ kind: "lp", delta: 24, before: { at: t(48) } });
  });

  it("keeps an LP change without a game (a dodge, decay) out of every game's figure", () => {
    const games = [...history, game("m", 40, 25, true)];
    // A dodge (−5 LP, no game) is read before the game; the game's figure starts from it.
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 20), read("GOLD", "II", 41, 10, 10, 30, 45), read("GOLD", "II", 65, 11, 10, 70)];
    expect(attributeLp(readings, games).get("m")).toMatchObject({ kind: "lp", delta: 24, before: { leaguePoints: 41 } });
  });

  it("attributes nothing across a reset or placements", () => {
    const games = [...history, game("a", 22, 25, true), game("b", 300, 25, true), game("c", 400, 25, false)];
    // Count goes down: a reset between the first and second readings.
    // The reading after the reset is confirmed during game c, so c's own figure is recorded.
    const reset = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read("SILVER", "I", 10, 1, 0, 360, 402), read("SILVER", "I", 0, 1, 1, 430)], games);
    expect(reset.get("a")).toMatchObject({ kind: "none", reason: "season-reset" });
    expect(reset.get("b")).toMatchObject({ kind: "none", reason: "season-reset" });
    expect(reset.get("c")).toMatchObject({ kind: "lp", delta: -10 });
    const placements = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read(null, null, null, null, null, 200), read("SILVER", "I", 10, 1, 0, 340)], games);
    expect(placements.get("b")).toMatchObject({ kind: "none", reason: "unranked" });
  });
});

describe("mergeReadings", () => {
  it("joins consecutive identical rows (overlapping runs) into one reading seen from the first to the last", () => {
    const merged = mergeReadings([read("GOLD", "II", 46, 10, 10, 10), read("GOLD", "II", 46, 10, 10, 0, 5), read("GOLD", "II", 50, 11, 10, 40)]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ capturedAt: t(0), confirmedAt: t(10) });
  });
});
