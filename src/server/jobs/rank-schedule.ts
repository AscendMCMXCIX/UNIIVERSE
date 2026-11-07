import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { defineJob } from "./registry";

/*
  THE FIVE-MINUTE RANK SCHEDULE (docs/RANKED_PROGRESS.md). The database calls the rank watch every
  five minutes: pg_cron runs the call, pg_net sends it, and the cron secret it needs is kept in
  Supabase Vault, never in the schedule's text. GitHub's hourly Data jobs runs arrive only a few
  times a day, so without it most ranked games fall between readings several games apart and get
  no LP figure.

  `rank-schedule` installs it from the app itself, with the app's own CRON_SECRET, so no person
  types or sees the secret, and then reports how the schedule is doing (counts only). Running it
  again changes nothing but the Vault copy of the secret if CRON_SECRET has changed. Only on the
  production deployment (VERCEL_ENV=production): a preview must never schedule calls of its own.
  `rank-schedule-off` removes the schedule and the Vault copy.
*/

export const RANK_SCHEDULE_JOB = "uniiverse-rank-watch";
export const RANK_SCHEDULE_SECRET = "uniiverse_cron_secret";
export const RANK_SCHEDULE_CRON = "*/5 * * * *";

/** The production host the schedule calls: a bare DNS name only, as it is written into SQL text. */
export function scheduleHost(env: Record<string, string | undefined> = process.env): string | null {
  const host = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

/** The scheduled command: the secret is read from Vault when it runs, never stored in the text. */
export function scheduleCommand(host: string): string {
  if (!/^[a-z0-9.-]+$/.test(host)) throw new Error("invalid host");
  return [
    "select net.http_get(",
    `  url := 'https://${host}/api/jobs/rank-watch',`,
    `  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${RANK_SCHEDULE_SECRET}')),`,
    "  timeout_milliseconds := 60000)",
  ].join("\n");
}

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];

/** An error message with the secret taken out, in case a driver ever echoes a parameter. */
function clean(err: unknown, secret: string): string {
  const message = err instanceof Error ? err.message : String(err);
  return (secret ? message.split(secret).join("[secret]") : message).slice(0, 300);
}

/** How the schedule is doing: whether it exists, and its runs and calls of the last hour. No secret, no command text. */
export async function rankScheduleStatus(db: Db, env: Record<string, string | undefined> = process.env): Promise<Record<string, unknown>> {
  const ext = rowsOf(await db.execute(sql`select extname from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault')`)).map((r) => String(r.extname));
  const out: Record<string, unknown> = { extensions: ext.sort() };
  if (!ext.includes("pg_cron")) return { ...out, scheduled: false };
  // Why a schedule might not run, or be refused: the scheduler itself, its settings, every job's
  // name and schedule (never its command), the recent runs of each, and the recent calls' answers.
  const settings = rowsOf(await db.execute(sql`select current_setting('cron.database_name', true) as database, current_setting('cron.log_run', true) as log_run, current_setting('cron.use_background_workers', true) as background_workers, current_database() as current, (select count(*)::int from pg_stat_activity where backend_type ilike '%cron%' or application_name ilike '%pg_cron%') as launcher`))[0];
  out.cron = settings;
  out.jobs = rowsOf(await db.execute(sql`select jobid::int as id, jobname as name, schedule, active, database, username from cron.job order by jobid`));
  out.runsLastHourByJob = rowsOf(await db.execute(sql`select jobid::int as id, status, count(*)::int as n, max(start_time) as last from cron.job_run_details where start_time > now() - interval '1 hour' group by 1, 2 order by 1`)).map((r) => ({ ...r, last: r.last ? new Date(String(r.last)).toISOString() : null }));
  const failure = rowsOf(await db.execute(sql`select left(regexp_replace(coalesce(return_message, ''), 'Bearer [^ ''"]+', 'Bearer [secret]', 'g'), 200) as message from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = ${RANK_SCHEDULE_JOB} and d.status <> 'succeeded' order by d.start_time desc limit 1`))[0];
  if (failure) out.lastFailure = failure.message;
  if (ext.includes("pg_net")) {
    out.recentCalls = rowsOf(await db.execute(sql`select created, status_code, left(coalesce(content::text, error_msg, ''), 80) as answer from net._http_response order by created desc limit 8`)).map((r) => ({ at: r.created ? new Date(String(r.created)).toISOString() : null, status: r.status_code, answer: String(r.answer ?? "").replace(/Bearer [^ '"]+/g, "Bearer [secret]") }));
    out.queued = Number(rowsOf(await db.execute(sql`select count(*)::int as n from net.http_request_queue`))[0]?.n ?? 0);
  }
  if (ext.includes("supabase_vault") && env.CRON_SECRET) {
    const [match] = rowsOf(await db.execute(sql`select d.decrypted_secret = ${env.CRON_SECRET} as same from vault.decrypted_secrets d where d.name = ${RANK_SCHEDULE_SECRET}`));
    out.vaultMatchesServerSecret = match ? match.same === true : null;
  }
  const [job] = rowsOf(await db.execute(sql`select jobid, schedule, active from cron.job where jobname = ${RANK_SCHEDULE_JOB}`));
  out.scheduled = !!job;
  if (!job) return out;
  out.schedule = job.schedule;
  out.active = job.active;
  const runs = rowsOf(await db.execute(sql`select status, count(*)::int as n, max(start_time) as last from cron.job_run_details where jobid = ${job.jobid} and start_time > now() - interval '1 hour' group by status`));
  out.runsLastHour = Object.fromEntries(runs.map((r) => [String(r.status), Number(r.n)]));
  out.lastRunAt = runs.map((r) => (r.last ? new Date(String(r.last)).toISOString() : null)).filter(Boolean).sort().at(-1) ?? null;
  if (ext.includes("pg_net")) {
    const calls = rowsOf(await db.execute(sql`select coalesce(status_code::text, 'no answer') as code, count(*)::int as n from net._http_response where created > now() - interval '1 hour' group by 1`));
    out.callsLastHourByStatus = Object.fromEntries(calls.map((r) => [String(r.code), Number(r.n)]));
  }
  return out;
}

/** Installs (or keeps) the schedule. Never returns or logs the secret. */
export async function installRankSchedule(db: Db, env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; error?: string; summary: Record<string, unknown> }> {
  const secret = env.CRON_SECRET ?? "";
  if (env.VERCEL_ENV !== "production") return { ok: false, error: "Only the production deployment installs the schedule (VERCEL_ENV is not production).", summary: { installed: false } };
  if (secret.length < 16) return { ok: false, error: "CRON_SECRET is not set (or is too short) on this server.", summary: { installed: false } };
  const host = scheduleHost(env);
  if (!host) return { ok: false, error: "VERCEL_PROJECT_PRODUCTION_URL is not a host name; the schedule's address is unknown.", summary: { installed: false } };
  const steps: string[] = [];
  try {
    await db.execute(sql`create extension if not exists pg_cron`);
    await db.execute(sql`create extension if not exists pg_net`);
    steps.push("extensions");
    const [stored] = rowsOf(await db.execute(sql`select s.id, d.decrypted_secret = ${secret} as same from vault.secrets s join vault.decrypted_secrets d on d.id = s.id where s.name = ${RANK_SCHEDULE_SECRET}`));
    if (!stored) {
      await db.execute(sql`select vault.create_secret(${secret}, ${RANK_SCHEDULE_SECRET}, 'UNIIVERSE: the cron secret the five-minute rank watch sends (installed by the rank-schedule job)')`);
      steps.push("secret stored");
    } else if (stored.same !== true) {
      await db.execute(sql`select vault.update_secret(${stored.id}::uuid, ${secret})`);
      steps.push("secret updated");
    } else steps.push("secret unchanged");
    // cron.schedule with an existing name replaces that job, so this is safe to run again.
    await db.execute(sql`select cron.schedule(${RANK_SCHEDULE_JOB}, ${RANK_SCHEDULE_CRON}, ${scheduleCommand(host)})`);
    steps.push("scheduled");
  } catch (err) {
    return { ok: false, error: clean(err, secret), summary: { installed: false, steps } };
  }
  return { ok: true, summary: { installed: true, steps, host, ...(await rankScheduleStatus(db)) } };
}

/** Removes the schedule and the Vault copy of the secret. */
export async function removeRankSchedule(db: Db): Promise<Record<string, unknown>> {
  const ext = rowsOf(await db.execute(sql`select extname from pg_extension where extname in ('pg_cron', 'supabase_vault')`)).map((r) => String(r.extname));
  let unscheduled = false;
  let secretRemoved = false;
  if (ext.includes("pg_cron")) {
    const [job] = rowsOf(await db.execute(sql`select jobid from cron.job where jobname = ${RANK_SCHEDULE_JOB}`));
    if (job) {
      await db.execute(sql`select cron.unschedule(${RANK_SCHEDULE_JOB})`);
      unscheduled = true;
    }
  }
  if (ext.includes("supabase_vault")) {
    const removed = rowsOf(await db.execute(sql`delete from vault.secrets where name = ${RANK_SCHEDULE_SECRET} returning id`));
    secretRemoved = removed.length > 0;
  }
  return { unscheduled, secretRemoved };
}

defineJob({
  key: "rank-schedule",
  description: "Installs (or keeps) the five-minute rank schedule in Supabase: pg_cron calls the rank watch, pg_net sends the call, the cron secret is kept in Vault (from this server's own CRON_SECRET; never shown). Production only. Then reports the schedule's runs and calls of the last hour. Counts only.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const result = await installRankSchedule(ctx.db);
    ctx.log(result.ok ? `rank-schedule: installed (${(result.summary.steps as string[]).join(", ")})` : `rank-schedule: not installed: ${result.error}`);
    return result;
  },
});

defineJob({
  key: "rank-schedule-off",
  description: "Removes the five-minute rank schedule (cron.unschedule) and its Vault copy of the cron secret. The rank watch then runs only on ticks, visits and the daily cron again.",
  defaultIntervalMinutes: null,
  run: async (ctx) => ({ ok: true, summary: await removeRankSchedule(ctx.db) }),
});

defineJob({
  key: "rank-schedule-status",
  description: "Read-only: whether the five-minute rank schedule exists, and its runs and calls of the last hour (counts only). Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => ({ ok: true, summary: await rankScheduleStatus(ctx.db) }),
});
