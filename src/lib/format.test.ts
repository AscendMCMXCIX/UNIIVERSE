import { describe, expect, it } from "vitest";
import path from "node:path";
import { ESLint } from "eslint";
import { DISPLAY_TIME_ZONE, calendarDay, localPeriodStarts, formatCompactCount, formatCount, formatDate, formatDateTime, formatDateTimeAfter, formatDayMonth, formatIsoDay, formatKilo, formatNumber, formatOrdinal, formatPerRank, formatSeconds, formatTimeOfDay, isoDay, timeAgo, formatLpChange } from "./format";

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

  it("write a later instant without what it shares with an earlier one, by the installation's calendar", () => {
    // The same Sydney day (9:30 am and 11:59 pm on 21 Oct): the time alone.
    expect(formatDateTimeAfter("2026-10-21T12:59:00Z", "2026-10-20T22:30:00Z")).toEqual({ day: null, time: "11:59 pm" });
    // The next Sydney day, though the same UTC one (13:00 UTC on 21 Oct is midnight on the 22nd).
    expect(formatDateTimeAfter("2026-10-21T13:00:00Z", "2026-10-21T01:00:00Z")).toEqual({ day: "22 Oct", time: "12:00 am" });
    // The same year: day and month, no year.
    expect(formatDateTimeAfter("2026-11-02T04:05:00Z", "2026-10-20T22:30:00Z")).toEqual({ day: "2 Nov", time: "3:05 pm" });
    // Another year (Sydney's, 1 Jan 2027 from 13:00 UTC on 31 Dec): the full date.
    expect(formatDateTimeAfter("2026-12-31T13:30:00Z", "2026-12-31T12:00:00Z")).toEqual({ day: "1 Jan 2027", time: "12:30 am" });
    // Epoch milliseconds and dates alike; nothing for an instant that is not one.
    expect(formatDateTimeAfter(Date.UTC(2026, 9, 21, 1), new Date("2026-10-20T22:30:00Z"))).toEqual({ day: null, time: "12:00 pm" });
    expect(formatDateTimeAfter(Number.NaN, Number.NaN)).toEqual({ day: null, time: "—" });
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

  it("write a place in words, the same everywhere: 1st, 2nd, 3rd, and th for the teens (11th, 112th)", () => {
    const places = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 1001];
    expect(places.map(formatOrdinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th", "1,001st"]);
    expect([formatOrdinal(0), formatOrdinal(10), formatOrdinal(4.4)]).toEqual(["0th", "10th", "4th"]);
  });

  it("write a game's LP change with its sign, a true minus for a loss", () => {
    expect(formatLpChange(24)).toBe("+24 LP");
    expect(formatLpChange(-21)).toBe("\u221221 LP");
    expect(formatLpChange(0)).toBe("0 LP");
  });
});

describe("cooldowns (Champion Lookup)", () => {
  it("write decimals as the numbers have them, up to four, with the site's decimal point", () => {
    // A value is never rounded into another: 0.3125 is never written as 0.31.
    expect(formatSeconds(0.3125)).toBe("0.3125");
    expect(formatSeconds(4 / 3)).toBe("1.3333");
    expect(formatSeconds(0.1 + 0.2)).toBe("0.3");
    expect(formatSeconds(16)).toBe("16");
    expect(formatSeconds(Number.NaN)).toBe("—");
  });

  it("write values per rank with their unit, the same value once", () => {
    expect(formatPerRank([8, 7, 6, 5, 4], "s")).toBe("8 / 7 / 6 / 5 / 4\u00a0s");
    expect(formatPerRank([13, 13, 13, 13, 13], "s")).toBe("13\u00a0s at every rank");
    expect(formatPerRank([8.5, 7.75, 7, 6.25, 5.5], "s")).toBe("8.5 / 7.75 / 7 / 6.25 / 5.5\u00a0s");
    expect(formatPerRank([25, 35, 45, 55, 65], "%")).toBe("25 / 35 / 45 / 55 / 65%");
    expect(formatPerRank([40, 40, 40], "%")).toBe("40% at every rank");
    expect(formatPerRank([40, 40, 40], "%", null)).toBe("40%");
    expect(formatPerRank([3, 4, 5], "")).toBe("3 / 4 / 5");
    expect(formatPerRank([20], "s")).toBe("20\u00a0s");
    expect(formatPerRank([6, 6, 6], "s", "level")).toBe("6\u00a0s at every level");
    expect(formatPerRank([17, 16, 15, 14, 13], "s", null)).toBe("17 / 16 / 15 / 14 / 13\u00a0s");
  });

  it("never write a number that is not there", () => {
    expect(formatPerRank([], "s")).toBe("—");
    expect(formatPerRank([8, Number.NaN, 6], "s")).toBe("—");
    expect(formatPerRank([-1, 2], "s")).toBe("—");
    expect(formatPerRank([8, Number.POSITIVE_INFINITY], "s")).toBe("—");
    expect(formatPerRank(["8"] as unknown as number[], "s")).toBe("—");
    expect(formatPerRank(null as unknown as number[], "%")).toBe("—");
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

