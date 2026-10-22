/*
  CLASH TOURNAMENTS as Riot describes them (CLASH-V1): a tournament ("Bilgewater Cup") has one or
  more days, each with its own registration time and start time, and each may be cancelled. Where
  the workspace stands is read from those times and from what Riot lists, never from a weekday or
  a time of day assumed in advance:

    upcoming      a day whose registration has not opened yet;
    registration  registration is open and none of our accounts is registered;
    preparing     we are registered and the day starts in more than a day;
    approaching   we are registered and the day starts within a day;
    underway      Riot's start time has passed and Riot still lists the day as active. Riot does
                  not say which round is being played, who the opponent is, or when scouting
                  starts, so this is all it claims;
    cancelled     Riot marked the day cancelled.

  A day Riot no longer lists is over; what the team played that day is told from its recorded
  games, not from the schedule.
*/

export interface ClashDay {
  /** Riot's phase id. */
  id: number;
  registrationAt: string;
  startAt: string;
  cancelled: boolean;
}

export interface ClashTournamentView {
  id: number;
  /** "Bilgewater Cup". */
  name: string;
  /** "Day 2", when Riot names the day. */
  dayName: string | null;
  days: ClashDay[];
}

export type ClashStage = "upcoming" | "registration" | "preparing" | "approaching" | "underway" | "cancelled";

const HOUR = 3_600_000;
/** Within this of the start a registered team is "approaching". */
export const APPROACH_MS = 24 * HOUR;

const words = (key: string) =>
  key
    .split(/[_\s-]+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());

/**
 * Riot's keys in words: "bilgewater" → "Bilgewater Cup", "day_2" → "Day 2". Riot names the cups
 * after places; a key that already says "cup" or "clash" is kept as it is. An empty key is "Clash".
 */
export function tournamentName(nameKey: string, nameKeySecondary = ""): { name: string; dayName: string | null } {
  const base = words(nameKey);
  const name = !base.length ? "Clash" : /cup|clash/i.test(nameKey) ? base.join(" ") : `${base.join(" ")} Cup`;
  const day = /^day[_\s-]?(\d+)$/i.exec(nameKeySecondary.trim());
  const dayName = day ? `Day ${Number(day[1])}` : nameKeySecondary.trim() ? nameKeySecondary.split(/[_\s-]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(" ") : null;
  return { name, dayName };
}

export function tournamentView(t: { id: number; nameKey: string; nameKeySecondary: string; schedule: Array<{ id: number; registrationTime: number; startTime: number; cancelled: boolean }> }): ClashTournamentView {
  const { name, dayName } = tournamentName(t.nameKey, t.nameKeySecondary);
  return {
    id: t.id,
    name,
    dayName,
    days: [...t.schedule]
      .sort((a, b) => a.startTime - b.startTime)
      .map((p) => ({ id: p.id, registrationAt: new Date(p.registrationTime).toISOString(), startAt: new Date(p.startTime).toISOString(), cancelled: p.cancelled })),
  };
}

/** The day that matters now: the first not yet started, else the latest started (Riot still lists it). */
export function currentDay(t: ClashTournamentView, now: number): ClashDay | null {
  const live = t.days.filter((d) => !d.cancelled);
  const next = live.find((d) => Date.parse(d.startAt) > now);
  if (next) return next;
  const started = live.filter((d) => Date.parse(d.startAt) <= now);
  return started[started.length - 1] ?? t.days[t.days.length - 1] ?? null;
}

/** Where a day stands for a team that is (or is not) registered for it. */
export function dayStage(day: ClashDay, now: number, registered: boolean): ClashStage {
  if (day.cancelled) return "cancelled";
  const start = Date.parse(day.startAt);
  if (now < Date.parse(day.registrationAt)) return "upcoming";
  if (now >= start) return "underway";
  if (!registered) return "registration";
  return start - now <= APPROACH_MS ? "approaching" : "preparing";
}

/** Most pressing first, when the team has more than one registration. */
const URGENCY: ClashStage[] = ["underway", "approaching", "preparing", "registration", "upcoming", "cancelled"];
export function mostPressing(stages: ClashStage[]): ClashStage | null {
  return URGENCY.find((s) => stages.includes(s)) ?? null;
}

/** Positions as Riot names them, in the order of a lineup. */
export const CLASH_POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", "FILL", "UNSELECTED"] as const;
export const CLASH_POSITION_LABEL: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bottom", UTILITY: "Support", FILL: "Fill", UNSELECTED: "No position" };
export const positionOrder = (p: string) => {
  const i = (CLASH_POSITIONS as readonly string[]).indexOf(p);
  return i < 0 ? CLASH_POSITIONS.length : i;
};

/** Riot's tier 1 is the highest; a team's tier is shown as Riot numbers it, in Roman numerals. */
export function tierLabel(tier: number | null | undefined): string | null {
  if (!tier || tier < 1 || tier > 4) return null;
  return `Tier ${["I", "II", "III", "IV"][tier - 1]}`;
}
