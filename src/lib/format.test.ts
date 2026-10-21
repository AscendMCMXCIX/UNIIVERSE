import { describe, expect, it } from "vitest";
import { DISPLAY_TIME_ZONE, calendarDay, formatDate, formatDateTime, formatDayMonth, timeAgo } from "./format";

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
