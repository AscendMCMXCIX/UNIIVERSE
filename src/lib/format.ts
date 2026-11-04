/*
  Dates as people read them: one time zone and one way of writing a date for the whole
  installation, the same on the server and in every browser. A date written in the reader's own
  locale and time zone differs from the one the server sent whenever the two disagree (an
  Australian browser against a server in UTC, say): the page then fails to hydrate, React throws
  that part away and draws it again, and a game played on a Tuesday morning in Sydney reads as
  Monday. The time zone is the installation's, NEXT_PUBLIC_UNIIVERSE_TIME_ZONE (an IANA name),
  Sydney by default, home of the OCE server; an unknown name falls back to UTC. The words are built
  here from the calendar's numbers, not by the runtime's locale data, which differs between Node
  and browser versions (spaces, am/pm), so every runtime writes exactly the same text.
*/

function installationTimeZone(): string {
  const zone = process.env.NEXT_PUBLIC_UNIIVERSE_TIME_ZONE?.trim() || "Australia/Sydney";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** The installation's time zone: every date and time on the site is written in it. */
export const DISPLAY_TIME_ZONE = installationTimeZone();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const calendar = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });

type DateInput = Date | string | number;

/** The calendar day and time of an instant in the installation's time zone; null for no date. */
function clock(date: DateInput): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = calendar.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** The calendar day of an instant in the installation's time zone ({ day: 21, month: "Oct", year: 2026 }). */
export function calendarDay(date: DateInput): { day: number; month: (typeof MONTHS)[number]; year: number } | null {
  const c = clock(date);
  return c ? { day: c.day, month: MONTHS[c.month - 1]!, year: c.year } : null;
}

/** The calendar day of an instant in the installation's time zone as a date input writes it ("2026-10-21"); "" for no date. */
export function isoDay(date: DateInput): string {
  const c = clock(date);
  return c ? `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}` : "";
}

/** "21 Oct 2026" for a calendar day as a date input writes it ("2026-10-21"); "—" for anything else. */
export function formatIsoDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : "—";
}

/** "21 Oct 2026". */
export function formatDate(date: DateInput): string {
  const c = clock(date);
  return c ? `${c.day} ${MONTHS[c.month - 1]} ${c.year}` : "—";
}

/** "21 Oct": a recent date, where the year goes without saying. */
export function formatDayMonth(date: DateInput): string {
  const c = clock(date);
  return c ? `${c.day} ${MONTHS[c.month - 1]}` : "—";
}

/** "3:04 pm": the time of day in the installation's time zone; "—" for no date. */
export function formatTimeOfDay(date: DateInput): string {
  const c = clock(date);
  return c ? `${c.hour % 12 || 12}:${String(c.minute).padStart(2, "0")} ${c.hour < 12 ? "am" : "pm"}` : "—";
}

/** "21 Oct 2026, 3:04 pm". */
export function formatDateTime(date: DateInput): string {
  const c = clock(date);
  if (!c) return "—";
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year}, ${c.hour % 12 || 12}:${String(c.minute).padStart(2, "0")} ${c.hour < 12 ? "am" : "pm"}`;
}

/**
 * "3m ago". In a client component, show it through RelativeTime or useNow
 * (components/ui/relative-time.tsx): the server's clock and the browser's rarely agree to the minute.
 */
export function timeAgo(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.max(0, now.getTime() - d.getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPoints(value: number, digits = 1): string {
  const pts = value * 100;
  return `${pts >= 0 ? "+" : ""}${pts.toFixed(digits)}`;
}

/** A game's LP change as a match card writes it: "+24 LP", "−21 LP" (a true minus sign), "0 LP". */
export function formatLpChange(delta: number): string {
  const n = Math.round(delta);
  return `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)} LP`;
}

/** A whole number with thousands separators, written the same in every browser ("12,345"). */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en");
}

/** A number with exactly `digits` decimals and thousands separators ("1,234.5"). */
export function formatNumber(value: number, digits: number): string {
  return value.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Gold and damage as a scoreboard writes them, in thousands with one decimal: "12.4k"; the whole number below 1,000. */
export function formatKilo(value: number): string {
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : formatCount(value);
}

/** A large count shortened for a tight space: "1.2M", "45K", or the whole number below 10,000. */
export function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  return formatCount(value);
}
