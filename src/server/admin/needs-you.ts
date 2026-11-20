import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { auditEvents, dataRefreshStatus } from "@/server/db/schema";
import type { AccountView } from "@/server/auth/account-admin";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { getScheduleOverrides, TICK_JOB_ORDER } from "@/server/jobs/scheduler";
import { healthNotices } from "@/server/ops/health-notices";
import { failuresInARow, RETIRED_JOB_KEYS } from "@/server/ops/refresh-status";
import { formatDate, isoDay } from "@/lib/format";

/*
  The Dashboard's "Needs you" card (the overhaul's S9c): what an administrator should act on, each
  item a sentence with a link to where it is done. The schedule items name who did it and when, from
  the audit log: Admin is the only place that names them (/api/health and the Production check give
  the day alone, S1a). Reads small tables only: accounts, Riot account states, job status rows, the
  schedule overrides and a few audit rows.
*/

export interface NeedsYouItem {
  key: string;
  text: string;
  href: string;
  tone: "bad" | "warn";
}

const day = (at: Date) => isoDay(at);

/** Who changed a job's schedule last, and when, from the audit log (null when it was not Admin). */
async function lastAudit(db: Db, action: string, targetNames: string[]): Promise<{ who: string | null; at: Date; details: unknown } | null> {
  const [row] = await db
    .select({ who: auditEvents.actorName, at: auditEvents.at, details: auditEvents.details })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, action), inArray(auditEvents.targetName, targetNames)))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(1);
  return row ?? null;
}

export async function loadNeedsYou(db: Db, accounts: AccountView[], now = new Date()): Promise<NeedsYouItem[]> {
  const items: NeedsYouItem[] = [];
  const active = accounts.filter((a) => a.isActive && !a.keptAutomatically);
  const person = (a: AccountView) => `/admin/people?person=${a.userId}`;
  const name = (a: AccountView) => a.displayName || a.username;

  for (const a of active.filter((x) => x.password.state === "expired")) items.push({ key: `expired-${a.userId}`, text: `${name(a)}'s temporary password expired. Issue a new one.`, href: person(a), tone: "warn" });
  const setup = active.filter((a) => a.playerId && a.lastLoginAt && !a.setupComplete);
  for (const a of setup) items.push({ key: `setup-${a.userId}`, text: `${name(a)} signed in but has not finished their setup.`, href: person(a), tone: "warn" });

  const withProfile = active.filter((a) => a.playerId);
  if (withProfile.length) {
    const states = await accountStatesForPlayers(db, withProfile.map((a) => a.playerId!), !!process.env.RIOT_API_KEY, now);
    for (const a of withProfile) if (states[a.playerId!]?.state === "error") items.push({ key: `riot-${a.userId}`, text: `${name(a)}'s Riot account needs attention.`, href: person(a), tone: "bad" });
  }

  const jobs = (await db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastStartedAt: dataRefreshStatus.lastStartedAt, lastSuccessAt: dataRefreshStatus.lastSuccessAt, consecutiveFailures: dataRefreshStatus.consecutiveFailures }).from(dataRefreshStatus)).filter((j) => !RETIRED_JOB_KEYS.has(j.key));
  const failing = jobs.filter((j) => failuresInARow(j, now.getTime()) > 0).map((j) => j.key);
  if (failing.length) items.push({ key: "failing", text: `${failing.length === 1 ? "A background job is" : `${failing.length} background jobs are`} failing: ${failing.join(", ")}.`, href: "/admin/system", tone: "bad" });

  const successAt = (key: string) => jobs.find((j) => j.key === key)?.lastSuccessAt?.getTime() ?? 0;
  const intervals = (await getScheduleOverrides(db)).intervals;
  for (const notice of healthNotices({ rankScheduleOnAt: successAt("rank-schedule"), rankScheduleOffAt: successAt("rank-schedule-off"), intervals, scheduledJobs: TICK_JOB_ORDER })) {
    if (notice.kind === "schedule-off") {
      // Named only from the Admin run that put the turn-off now in force: one that finished, at or
      // after the start of the job's last run. Data jobs runs it through /api/jobs, which writes no
      // audit row, so an older Admin run would otherwise be named with its own day (R6 review SR6-SEC-4).
      const run = await lastAudit(db, "jobs.run", ["rank-schedule-off"]);
      const startedAt = jobs.find((j) => j.key === "rank-schedule-off")?.lastStartedAt?.getTime() ?? Infinity;
      // The run's start is the server function's clock, the audit row's time the database's: a second's slack between the two.
      const by = run && (run.details as { ok?: unknown } | null)?.ok === true && run.at.getTime() >= startedAt - 1_000 ? run : null;
      const when = by ? by.at : new Date(successAt("rank-schedule-off"));
      items.push({ key: "schedule-off", text: `The LP five-minute schedule was turned off${by?.who ? ` by ${by.who}` : ""} on ${formatDate(when)}.`, href: `/admin/audit?category=data&from=${day(when)}&to=${day(when)}`, tone: "warn" });
    } else {
      for (const job of notice.jobs) {
        const by = await lastAudit(db, "jobs.schedule", [job]);
        items.push({ key: `off-${job}`, text: `${job} is off (interval 0)${by ? `, set${by.who ? ` by ${by.who}` : ""} on ${formatDate(by.at)}` : ""}.`, href: by ? `/admin/audit?category=data&from=${day(by.at)}&to=${day(by.at)}` : "/admin/data", tone: "warn" });
      }
    }
  }
  return items;
}

