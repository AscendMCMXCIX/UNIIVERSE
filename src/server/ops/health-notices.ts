import { formatDate, isoDay } from "@/lib/format";

/*
  /api/health's notices: what is off by someone's choice rather than failing. A failing job fails the
  scheduled Data jobs run (the owner's email); a notice does not. The Production check prints each
  one as a warning, so a schedule turned off stays in view until it is turned on again.

  The endpoint is public and its answer is printed in public Actions logs, so a notice says what is
  off and since which day, never who turned it off, an audit entry or a link: Admin → Audit Logs
  (Data & jobs) names who ran it.
*/

export type HealthNotice =
  /** The five-minute rank schedule was removed (rank-schedule-off) after it had been installed. */
  | { kind: "schedule-off"; job: "rank-schedule"; since: string; message: string }
  /** Jobs the tick runs whose interval was set to 0 in Admin (the schedule overrides). */
  | { kind: "disabled"; jobs: string[]; message: string };

export function healthNotices(input: {
  /** When rank-schedule and rank-schedule-off last succeeded (ms; 0 for never). */
  rankScheduleOnAt: number;
  rankScheduleOffAt: number;
  /** The schedule overrides (app_settings "schedule"): job key → minutes, 0 for off. */
  intervals: Partial<Record<string, number>>;
  /** The jobs the scheduler's tick runs: an interval means nothing for any other job. */
  scheduledJobs: readonly string[];
}): HealthNotice[] {
  const notices: HealthNotice[] = [];
  // Off after on. Never installed (a preview, a local server, before the first install) says nothing:
  // there is no schedule to miss. Installed again since, the silence rule takes over (failingJobs).
  if (input.rankScheduleOnAt > 0 && input.rankScheduleOffAt > input.rankScheduleOnAt) {
    notices.push({ kind: "schedule-off", job: "rank-schedule", since: isoDay(input.rankScheduleOffAt), message: `LP five-minute schedule off since ${formatDate(input.rankScheduleOffAt)}` });
  }
  const off = input.scheduledJobs.filter((key) => input.intervals[key] === 0);
  if (off.length) notices.push({ kind: "disabled", jobs: off, message: `Off by choice (interval 0 in Admin): ${off.join(", ")}` });
  return notices;
}
