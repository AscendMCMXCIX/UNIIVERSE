/*
  Match dates as people see them. A match record stores one instant (`played_at`, UTC). The
  editor shows and edits the calendar date of that instant in the viewer's own time zone, and an
  intentional date change keeps the local time of day: moving an evening game to another day
  leaves it an evening game. Nothing here runs unless the date is actually changed.
*/

/** The viewer's IANA time zone, or UTC where the runtime cannot tell (server rendering). */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(ms: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Offset of `timeZone` from UTC at the instant `ms`, in milliseconds (Sydney in summer: +11 h). */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
}

/** "YYYY-MM-DD" of an instant in a time zone (the value of an `<input type="date">`). */
export function localDateKey(iso: string, timeZone: string): string {
  const w = wallClock(Date.parse(iso), timeZone);
  return `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/**
 * The same local time of day as `iso`, on the calendar day `dateKey`, in `timeZone`, as an ISO
 * instant. Daylight-saving changes between the two days are honoured (the wall-clock time is kept,
 * not the UTC offset). A wall-clock time that does not exist on the new day (the skipped hour when
 * clocks go forward) resolves to the instant just after the gap.
 */
export function moveToLocalDate(iso: string, dateKey: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new Error(`Not a date: ${dateKey}`);
  const ms = Date.parse(iso);
  const w = wallClock(ms, timeZone);
  const subSecond = ms - Math.floor(ms / 1000) * 1000;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), w.hour, w.minute, w.second);
  // Two passes settle the offset of the target day, also across a DST change.
  let guess = target - offsetAt(target, timeZone);
  guess = target - offsetAt(guess, timeZone);
  return new Date(guess + subSecond).toISOString();
}
