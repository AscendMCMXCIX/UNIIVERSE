import { describe, expect, it } from "vitest";
import { localDateKey, moveToLocalDate } from "./match-time";

/*
  D2: a match's date is shown in the viewer's time zone and an intentional date change keeps the
  local time of day. Australian zones (with and without daylight saving) and day boundaries.
*/

describe("localDateKey", () => {
  it("shows the calendar date in the viewer's zone, not the UTC date", () => {
    // 21:30 UTC on 14 Oct is 08:30 on 15 Oct in Sydney (AEDT, +11).
    expect(localDateKey("2026-10-14T21:30:00.000Z", "Australia/Sydney")).toBe("2026-10-15");
    expect(localDateKey("2026-10-14T21:30:00.000Z", "UTC")).toBe("2026-10-14");
    // Perth has no daylight saving (+8): 15:59 UTC is 23:59 the same day, 16:00 UTC is midnight next day.
    expect(localDateKey("2026-10-14T15:59:00.000Z", "Australia/Perth")).toBe("2026-10-14");
    expect(localDateKey("2026-10-14T16:00:00.000Z", "Australia/Perth")).toBe("2026-10-15");
  });
});

describe("moveToLocalDate", () => {
  it("keeps the local time of day when the date changes (Sydney evening game)", () => {
    // 20:15 AEDT on 15 Oct = 09:15 UTC.
    const moved = moveToLocalDate("2026-10-15T09:15:00.000Z", "2026-10-17", "Australia/Sydney");
    expect(moved).toBe("2026-10-17T09:15:00.000Z");
    expect(localDateKey(moved, "Australia/Sydney")).toBe("2026-10-17");
  });

  it("keeps the wall-clock time across a daylight-saving change", () => {
    // Sydney moves from +10 (AEST) to +11 (AEDT) on Sunday 4 October 2026.
    // 19:00 AEST on 1 Oct = 09:00 UTC; 19:00 AEDT on 8 Oct = 08:00 UTC.
    expect(moveToLocalDate("2026-10-01T09:00:00.000Z", "2026-10-08", "Australia/Sydney")).toBe("2026-10-08T08:00:00.000Z");
    // And back again in April (AEDT → AEST on 5 April 2026): 19:00 AEDT 1 Apr = 08:00 UTC; 19:00 AEST 8 Apr = 09:00 UTC.
    expect(moveToLocalDate("2026-04-01T08:00:00.000Z", "2026-04-08", "Australia/Sydney")).toBe("2026-04-08T09:00:00.000Z");
  });

  it("handles a game just after local midnight, whose UTC date is the day before", () => {
    // 00:30 AEDT on 16 Oct = 13:30 UTC on 15 Oct. Moving to 20 Oct keeps 00:30 local.
    const moved = moveToLocalDate("2026-10-15T13:30:00.000Z", "2026-10-20", "Australia/Sydney");
    expect(moved).toBe("2026-10-19T13:30:00.000Z");
    expect(localDateKey(moved, "Australia/Sydney")).toBe("2026-10-20");
  });

  it("is the identity when the date does not change, in any zone", () => {
    for (const tz of ["Australia/Sydney", "Australia/Perth", "Australia/Adelaide", "UTC", "America/Los_Angeles"]) {
      const iso = "2026-10-15T13:30:45.123Z";
      expect(moveToLocalDate(iso, localDateKey(iso, tz), tz)).toBe(iso);
    }
  });

  it("resolves a time that does not exist on the new day (clocks skip 02:00–03:00) to just after the gap", () => {
    // 02:30 AEST on 3 Oct = 16:30 UTC 2 Oct. On 4 Oct 02:30 does not exist in Sydney.
    const moved = moveToLocalDate("2026-10-02T16:30:00.000Z", "2026-10-04", "Australia/Sydney");
    expect(localDateKey(moved, "Australia/Sydney")).toBe("2026-10-04");
  });

  it("rejects something that is not a date", () => {
    expect(() => moveToLocalDate("2026-10-15T09:15:00.000Z", "15/10/2026", "UTC")).toThrow();
  });
});
