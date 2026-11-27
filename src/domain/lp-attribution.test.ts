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

  it("never calls a game without a stored length a remake, and still places the games after it", () => {
    // Riot counted "x" (its count rises), but its length is unknown: it stays out of the match, the
    // offset moves there, and "m" is matched from the readings after it.
    const games = [...history, { ...game("x", 22, 25, true), durationS: null }, game("m", 60, 30, false)];
    const out = attributeLp([read("GOLD", "II", 46, 10, 10, 0, 30), read("GOLD", "II", 70, 11, 10, 50, 58), read("GOLD", "II", 50, 11, 11, 95)], games);
    expect(out.get("x")).toEqual({ kind: "none", reason: "unknown-length" });
    expect(out.get("m")).toMatchObject({ kind: "lp", delta: -20 });
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

  // Riot counted a win (+24 LP) played from minute 5 to 30 that the store lacks; the stored game
  // "n" follows, from 35 to 60.
  it("moves the match at the first reading that counts a missing game before the next game can have ended", () => {
    const games = [...history, game("n", 35, 25, true)];
    // Read during "n" with the missing win counted: "n" gets its own change (+20), not the missing one's.
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 2), read("GOLD", "II", 70, 11, 10, 40, 58), read("GOLD", "II", 90, 12, 10, 62)];
    expect(attributeLp(readings, games).get("n")).toMatchObject({ kind: "lp", delta: 20, before: { leaguePoints: 70 } });
  });

  it("leaves the next game without a figure when the first reading that counts a missing game is too far, or counts the next game too", () => {
    const win = [...history, game("n", 35, 25, true)];
    // No reading from before the missing game until after "n": "n" is matched to the missing win's change, too far from it.
    expect(attributeLp([read("GOLD", "II", 46, 10, 10, 0, 2), read("GOLD", "II", 70, 11, 10, 62)], win).get("n")).toMatchObject({ kind: "none", reason: "readings-too-far" });
    // The same reading counting both games: the match moves there, and "n" has no figure.
    expect(attributeLp([read("GOLD", "II", 46, 10, 10, 0, 2), read("GOLD", "II", 90, 12, 10, 65, 90)], win).get("n")).toMatchObject({ kind: "none", reason: "inconsistent" });
    // A loss is never given the missing win's change.
    const loss = [...history, game("n", 35, 25, false)];
    expect(attributeLp([read("GOLD", "II", 46, 10, 10, 0, 32), read("GOLD", "II", 70, 11, 10, 62)], loss).get("n")).toMatchObject({ kind: "none", reason: "inconsistent" });
  });

  it("cannot tell a missing game from the next one of the same result when no reading counts it until that one has ended", () => {
    const games = [...history, game("n", 35, 25, true)];
    // Read during "n" without the missing win (Riot counting it late), then after "n" with it only: "n" is given its +24.
    expect(attributeLp([read("GOLD", "II", 46, 10, 10, 0, 58), read("GOLD", "II", 70, 11, 10, 62)], games).get("n")).toMatchObject({ kind: "lp", delta: 24, before: { leaguePoints: 46 } });
    // Read in the missing game's last minute, "n" created four minutes later, and no reading in between: the same.
    const soon = [...history, game("n", 33, 25, true)];
    expect(attributeLp([read("GOLD", "II", 46, 10, 10, 0, 29), read("GOLD", "II", 70, 11, 10, 61)], soon).get("n")).toMatchObject({ kind: "lp", delta: 24, before: { leaguePoints: 46 } });
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

describe("attributeLp across the 2027 ranked year's reset (Iron IV, Riot's count restarting)", () => {
  it("records nothing for the game between the last 2026 reading and the reset reading, and the 2027 games from the 2027 readings", () => {
    // d: a 16.24 game read in; x: a game after the last 2026 reading and before the reset reading;
    // e and f: 17.1 games after it ("Ranked Rush": a promotion, then an LP figure).
    const games = [...history, game("d", 22, 25, true), game("x", 200, 25, false), game("e", 380, 25, true), game("f", 440, 25, true)];
    const readings = [
      read("GOLD", "II", 46, 10, 10, 0, 20),
      read("GOLD", "II", 70, 11, 10, 50, 190),
      read("IRON", "IV", 0, 0, 0, 360, 385),
      read("IRON", "III", 20, 1, 0, 410, 445),
      read("IRON", "III", 60, 2, 0, 470),
    ];
    const out = attributeLp(readings, games);
    expect(out.get("d")).toMatchObject({ kind: "lp", delta: 24 });
    expect(out.get("x")).toMatchObject({ kind: "none", reason: "season-reset" });
    expect(out.get("e")).toMatchObject({ kind: "promoted", before: { label: "Iron IV" }, after: { label: "Iron III" } });
    expect(out.get("f")).toMatchObject({ kind: "lp", delta: 40 });
  });

  it("an unranked reading at the reset (no entry until a game) marks the games before the first 2027 rank as unranked, never an LP figure", () => {
    const games = [...history, game("x", 200, 25, false), game("e", 380, 25, true)];
    const readings = [read("GOLD", "II", 46, 10, 10, 0, 190), read(null, null, null, null, null, 360, 385), read("IRON", "IV", 50, 1, 0, 410)];
    const out = attributeLp(readings, games);
    expect(out.get("x")).toMatchObject({ kind: "none" });
    expect(out.get("e")).toMatchObject({ kind: "none", reason: "unranked" });
  });
});

describe("mergeReadings", () => {
  it("joins consecutive identical rows (overlapping runs) into one reading seen from the first to the last", () => {
    const merged = mergeReadings([read("GOLD", "II", 46, 10, 10, 10), read("GOLD", "II", 46, 10, 10, 0, 5), read("GOLD", "II", 50, 11, 10, 40)]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ capturedAt: t(0), confirmedAt: t(10) });
  });
});
