import { describe, expect, it } from "vitest";
import path from "node:path";
import { ESLint } from "eslint";
import { DISPLAY_TIME_ZONE, calendarDay, localPeriodStarts, formatCompactCount, formatCooldowns, formatCount, formatDate, formatDateTime, formatDayMonth, formatIsoDay, formatKilo, formatNumber, formatPerRank, formatSeconds, formatTimeOfDay, isoDay, keepUnitsWithNumbers, timeAgo, formatLpChange } from "./format";

/*
  Every date on the site is written in the installation's time zone (Sydney unless
  NEXT_PUBLIC_UNIIVERSE_TIME_ZONE says otherwise) and in one fixed form, so the server and every
  browser write exactly the same text whatever their own locale and time zone.
*/
describe("dates", () => {
  it("are written in the installation's time zone, Sydney by default", () => {
    expect(DISPLAY_TIME_ZONE).toBe("Australia/Sydney");
    // 22:30 UTC on 20 Oct is 9:30 the next morning in Sydney (daylight saving, UTC+11).
    expect(formatDate("2026-10-20T22:30:00Z")).toBe("21 Oct 2026");
    expect(formatDayMonth("2026-10-20T22:30:00Z")).toBe("21 Oct");
    expect(formatDateTime("2026-10-20T22:30:00Z")).toBe("21 Oct 2026, 9:30 am");
    // Winter (UTC+10): 13:05 UTC is 11:05 pm the same day.
    expect(formatDateTime("2026-06-15T13:05:00Z")).toBe("15 Jun 2026, 11:05 pm");
  });

  it("follow daylight saving on the day it starts", () => {
    // Clocks went forward at 2 am on Sunday 4 Oct 2026: 15:59 UTC on 3 Oct is 1:59 am, 16:00 UTC is 3 am.
    expect(formatDateTime("2026-10-03T15:59:00Z")).toBe("4 Oct 2026, 1:59 am");
    expect(formatDateTime("2026-10-03T16:00:00Z")).toBe("4 Oct 2026, 3:00 am");
  });

  it("write midnight and noon in twelve-hour time", () => {
    expect(formatDateTime("2026-10-20T13:00:00Z")).toBe("21 Oct 2026, 12:00 am");
    expect(formatDateTime("2026-10-21T01:00:00Z")).toBe("21 Oct 2026, 12:00 pm");
  });

  it("accept dates, ISO strings and epoch milliseconds alike", () => {
    const at = new Date("2026-01-02T03:04:05Z");
    expect(formatDate(at)).toBe(formatDate(at.toISOString()));
    expect(formatDate(at)).toBe(formatDate(at.getTime()));
    expect(calendarDay(at)).toEqual({ day: 2, month: "Jan", year: 2026 });
  });

  it("show a dash for a date that is not one", () => {
    expect(formatDate("not a date")).toBe("—");
    expect(formatDateTime(Number.NaN)).toBe("—");
    expect(calendarDay("")).toBeNull();
  });

  it("name a calendar day as a date input does, in the installation's time zone", () => {
    expect(isoDay("2026-10-20T22:30:00Z")).toBe("2026-10-21");
    expect(isoDay(Date.UTC(2026, 0, 2, 3))).toBe("2026-01-02");
    expect(isoDay("not a date")).toBe("");
    expect(formatIsoDay("2026-10-21")).toBe("21 Oct 2026");
    expect(formatIsoDay("2026-13-01")).toBe("—");
    expect(formatTimeOfDay("2026-10-20T22:30:00Z")).toBe("9:30 am");
    expect(formatTimeOfDay("2026-10-21T01:00:00Z")).toBe("12:00 pm");
    expect(formatTimeOfDay(Number.NaN)).toBe("—");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("counts minutes, hours, then days", () => {
    expect(timeAgo(new Date("2026-10-21T11:59:40Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-10-21T11:57:00Z"), now)).toBe("3m ago");
    expect(timeAgo(new Date("2026-10-21T07:00:00Z"), now)).toBe("5h ago");
    expect(timeAgo(new Date("2026-10-17T12:00:00Z"), now)).toBe("4d ago");
  });
  it("never runs ahead of the clock", () => {
    // A device clock behind the server's: a moment in its future still reads "just now".
    expect(timeAgo(new Date("2026-10-21T12:02:00Z"), now)).toBe("just now");
    expect(timeAgo(null, now)).toBe("never");
  });
});

describe("pages and components", () => {
  /*
    A date or number written in the browser's own language or time zone differs from the server's
    copy of the page, so the page fails to hydrate (and a Sydney morning reads as the day before).
    An ESLint rule (eslint.config.mjs, run by pnpm verify) keeps pages and components to this
    module; this proves it fires there and only there.
  */
  it("cannot format dates or numbers themselves", async () => {
    const eslint = new ESLint({ cwd: path.join(__dirname, "../..") });
    const code = [
      "export const a = (d: Date) => d.toLocaleDateString();",
      "export const b = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });",
      "export const c = (d: Date) => d.toLocaleString(\"en-AU\");",
      "export const d = (n: number) => new Intl.NumberFormat().format(n);",
      "export const e = (d: Date) => Intl.DateTimeFormat().format(d);",
      "export const f = (d: Date) =>",
      "  d",
      "    .toLocaleTimeString();",
    ].join("\n");
    const lines = async (filePath: string) =>
      (await eslint.lintText(code, { filePath: path.join(__dirname, "..", filePath) }))[0]!.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.line);
    expect(await lines("components/example.tsx")).toEqual([1, 2, 3, 4, 5, 7]);
    expect(await lines("app/example/page.tsx")).toEqual([1, 2, 3, 4, 5, 7]);
    expect(await lines("lib/format-example.ts")).toEqual([]);
  }, 30_000);
});

describe("numbers", () => {
  it("are written the same in every browser", () => {
    expect(formatCount(12345.4)).toBe("12,345");
    expect(formatNumber(1234.5, 1)).toBe("1,234.5");
    expect(formatNumber(2, 2)).toBe("2.00");
    expect(formatCompactCount(9_999)).toBe("9,999");
    expect(formatCompactCount(45_400)).toBe("45K");
    expect(formatCompactCount(1_250_000)).toBe("1.3M");
    // A scoreboard's gold and damage: one decimal of thousands, whatever the size, so a column reads alike.
    expect(formatKilo(7_504)).toBe("7.5k");
    expect(formatKilo(29_120)).toBe("29.1k");
    expect(formatKilo(950)).toBe("950");
  });

  it("write a game's LP change with its sign, a true minus for a loss", () => {
    expect(formatLpChange(24)).toBe("+24 LP");
    expect(formatLpChange(-21)).toBe("\u221221 LP");
    expect(formatLpChange(0)).toBe("0 LP");
  });
});

describe("cooldowns (Matchup Intel)", () => {
  it("write a base cooldown per rank, the same value once, and one value alone", () => {
    expect(formatCooldowns([8, 7, 6, 5, 4])).toBe("8 / 7 / 6 / 5 / 4\u00a0s");
    expect(formatCooldowns([13, 13, 13, 13, 13])).toBe("13\u00a0s at every rank");
    expect(formatCooldowns([120, 100, 80])).toBe("120 / 100 / 80\u00a0s");
    expect(formatCooldowns([12])).toBe("12\u00a0s");
    // A passive that changes with the champion's level says so.
    expect(formatCooldowns([6, 6, 6], "level")).toBe("6\u00a0s at every level");
  });

  it("write decimals as the numbers have them, up to four, with the site's decimal point", () => {
    expect(formatCooldowns([8.5, 7.75, 7, 6.25, 5.5])).toBe("8.5 / 7.75 / 7 / 6.25 / 5.5\u00a0s");
    expect(formatCooldowns([0.25, 0.25, 0.25])).toBe("0.25\u00a0s at every rank");
    // A checked wait between casts keeps its four decimals: 0.3125 is never written as 0.31.
    expect(formatSeconds(0.3125)).toBe("0.3125");
    expect(formatSeconds(4 / 3)).toBe("1.3333");
    expect(formatSeconds(0.1 + 0.2)).toBe("0.3");
    expect(formatSeconds(16)).toBe("16");
    expect(formatSeconds(Number.NaN)).toBe("—");
  });

  it("write any values per rank with their unit, the same value once", () => {
    expect(formatPerRank([25, 35, 45, 55, 65], "%")).toBe("25 / 35 / 45 / 55 / 65%");
    expect(formatPerRank([40, 40, 40], "%")).toBe("40% at every rank");
    expect(formatPerRank([40, 40, 40], "%", null)).toBe("40%");
    expect(formatPerRank([3, 4, 5], "")).toBe("3 / 4 / 5");
    expect(formatPerRank([20], "s")).toBe("20\u00a0s");
    expect(formatPerRank([17, 16, 15, 14, 13], "s", null)).toBe("17 / 16 / 15 / 14 / 13\u00a0s");
  });

  it("never write a number that is not there", () => {
    expect(formatCooldowns([])).toBe("—");
    expect(formatCooldowns([8, Number.NaN, 6])).toBe("—");
    expect(formatCooldowns([-1, 2])).toBe("—");
    expect(formatCooldowns([8, Number.POSITIVE_INFINITY])).toBe("—");
    expect(formatPerRank(["8"] as unknown as number[], "s")).toBe("—");
    expect(formatPerRank(null as unknown as number[], "%")).toBe("—");
  });
});

describe("numbers and their units in curated text (Matchup Intel)", () => {
  const NBSP = "\u00a0";
  it("joins a number and the word after it with a no-break space, so a line never ends between them", () => {
    expect(keepUnitsWithNumbers("with no tenacity the stun lasts 1.625 s or 1.3 s, and she takes")).toBe(`with no tenacity the stun lasts 1.625${NBSP}s or 1.3${NBSP}s, and she takes`);
    expect(keepUnitsWithNumbers("For 4 seconds, within 300 units; at 50 Fury, 3 charges, 1 health, 600 range, 55 energy.")).toBe(`For 4${NBSP}seconds, within 300${NBSP}units; at 50${NBSP}Fury, 3${NBSP}charges, 1${NBSP}health, 600${NBSP}range, 55${NBSP}energy.`);
    expect(keepUnitsWithNumbers("5 (+30% AP) plus 1 second and 2 stacks (Ornn's 4 s forge)")).toBe(`5 (+30%${NBSP}AP) plus 1${NBSP}second and 2${NBSP}stacks (Ornn's 4${NBSP}s forge)`);
    // Units no list named before: distances, speeds, stats, counts and angles.
    expect(keepUnitsWithNumbers("The shockwave (360 radius) at 770 speed; 30% armour, 6 snips, 9 needles, a 180\u00b0 sweep.")).toBe(`The shockwave (360${NBSP}radius) at 770${NBSP}speed; 30%${NBSP}armour, 6${NBSP}snips, 9${NBSP}needles, a 180\u00b0${NBSP}sweep.`);
    // Any word: the number never ends a line. A unit of several words keeps only its first word.
    expect(keepUnitsWithNumbers("75 bonus range, 20% bonus AD; Can be cast 2 more times, at levels 6, 11 and 16")).toBe(`75${NBSP}bonus range, 20%${NBSP}bonus AD; Can be cast 2${NBSP}more times, at levels 6, 11${NBSP}and 16`);
    // A word ends where its letters do, whatever follows it.
    expect(keepUnitsWithNumbers("a 3 seconds-long window")).toBe(`a 3${NBSP}seconds-long window`);
    // Any letter, not only ASCII; and a digit that ends a word ("Q2") holds the next word too.
    expect(keepUnitsWithNumbers("5 Éclat, then Q2 cast")).toBe(`5${NBSP}Éclat, then Q2${NBSP}cast`);
  });

  it("changes nothing else: a number before anything but a word, a word with no number before it, a space already joined", () => {
    for (const text of ["8 / 7 / 6 / 5 / 4", "at levels 6, 11", "320 (by level)", "Q2: 40 + 10", "lasts 4. Then", "R's second pass", "the s and the units", "ends with 16", ""]) {
      expect(keepUnitsWithNumbers(text), text).toBe(text);
    }
    const joined = `already 1.625${NBSP}s`;
    expect(keepUnitsWithNumbers(joined)).toBe(joined);
  });
});

describe("localPeriodStarts", () => {
  it("gives each Sydney midnight in a stretch, daylight saving's start (4 Oct 2026) included", () => {
    const H = 3_600_000;
    expect(localPeriodStarts(Date.UTC(2026, 9, 2), Date.UTC(2026, 9, 6), "day")).toEqual([Date.UTC(2026, 9, 2, 14), Date.UTC(2026, 9, 3, 14), Date.UTC(2026, 9, 4, 13), Date.UTC(2026, 9, 5, 13)]);
    expect(localPeriodStarts(Date.UTC(2026, 9, 2, 14), Date.UTC(2026, 9, 2, 14) + 23 * H, "day")).toEqual([]);
  });

  it("gives each Sydney month start, and labels read as the day they mark", () => {
    const starts = localPeriodStarts(Date.UTC(2026, 8, 15), Date.UTC(2026, 10, 15), "month");
    expect(starts).toEqual([Date.UTC(2026, 8, 30, 14), Date.UTC(2026, 9, 31, 13)]);
    expect(starts.map((s) => formatDayMonth(s))).toEqual(["1 Oct", "1 Nov"]);
  });
});

