import { NextResponse } from "next/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDbHandle } from "@/server/db/client";
import { deploymentInfo } from "@/server/ops/deployment";
import { requiresAccounts, missingProductionSetup } from "@/server/auth/mode";
import { appSettings, patches, dataRefreshStatus, riotAccounts } from "@/server/db/schema";
import { RETIRED_JOB_KEYS, failuresInARow } from "@/server/ops/refresh-status";
import { getRiotCredentialStatus } from "@/server/riot/credential";
import { lastRankScheduleCall } from "@/server/ops/rank-schedule-calls";
import { lastTickScheduleCalls, tickScheduleSilentMs } from "@/server/ops/tick-schedule-calls";
import { getScheduleOverrides, TICK_JOB_ORDER } from "@/server/jobs/scheduler";
import { healthNotices } from "@/server/ops/health-notices";
import { log } from "@/server/observability/log";
import { digestHealth } from "@/server/matchup-intel/digests";
import { staticDataHealth } from "@/server/ops/static-health";
import { STATIC_ATTEMPT_KEY, type StaticAttempt } from "@/server/riot/static/assets";

export const dynamic = "force-dynamic";

/** What a failed database check tells the public; the driver's own message is logged instead. */
const PUBLIC_DB_ERROR = "The database did not answer (details in the server log).";

/** How long the installed five-minute rank schedule may go without calling the app: four calls. */
const RANK_SCHEDULE_SILENT_MS = 20 * 60_000;

/**
 * Cheap health check for uptime monitors: the app answers, the database answers (and how fast),
 * which auth mode is active, which patch and build are live, when each pipeline last succeeded,
 * what is failing and whether Riot accepts the configured key. Reads only the tiny status tables
 * (the key's state is the outcome the jobs recorded, cached for 30 s); never touches statistics or
 * external providers, so it stays fast and never reports a provider outage as an app outage. No
 * secrets (of the key, only the state word), no personal data. `digests` is Matchup Intel's
 * per-version diff of Data Dragon, counted (champions, items and runes recorded and changed). `staticData` is the static
 * refresh's state (server/ops/static-health.ts: ok, failed validation or stale; patch names and counts only), listed in
 * `failingJobs` as "static-data" when not ok. `notices` says what is off by choice
 * (server/ops/health-notices.ts): the five-minute schedule turned off after it was on, and jobs set
 * to 0 in Admin; they warn in the Production check and never fail a scheduled run.
 */
export async function GET() {
  const started = performance.now();
  const missing = missingProductionSetup();
  const base = { ok: true, deployment: deploymentInfo(), auth: { mode: missing.length ? "locked" : requiresAccounts() ? "accounts" : "open", missing }, now: new Date().toISOString() };
  try {
    const handle = await getDbHandle();
    const t = performance.now();
    await handle.db.execute(sql`select 1`);
    const dbMs = Math.round((performance.now() - t) * 10) / 10;
    const [patch] = await handle.db.select({ id: patches.id, ddragonVersion: patches.ddragonVersion }).from(patches).where(eq(patches.isCurrent, true)).limit(1);
    const jobs = (await handle.db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastStartedAt: dataRefreshStatus.lastStartedAt, lastSuccessAt: dataRefreshStatus.lastSuccessAt, consecutiveFailures: dataRefreshStatus.consecutiveFailures }).from(dataRefreshStatus)).filter((j) => !RETIRED_JOB_KEYS.has(j.key));
    // Failing: the job's last run failed or died before it finished, and no run has succeeded
    // since (also while it is being run again, which is when a scheduled check reads this).
    const now = Date.now();
    const failing = jobs.filter((j) => failuresInARow(j, now) > 0).map((j) => j.key);
    // The five-minute rank schedule (pg_cron and pg_net in the database, docs/RANKED_PROGRESS.md) is
    // installed while the rank-schedule job's last success is later than rank-schedule-off's, and it
    // then calls /api/jobs/rank-watch every five minutes, each call recorded as it arrives
    // (server/ops/rank-schedule-calls.ts). A call the app refuses (401: CRON_SECRET changed and
    // rank-schedule not run again) or never gets (pg_cron stopped, the job removed or made inactive by
    // hand, a restore into a new project) records nothing, so its silence is the only sign. The calls
    // are counted, not the rank watch's successes: ticks (the ten-minute pg_cron tick, GitHub's runs,
    // visits) run the rank watch too, and would hide a silent schedule. Only the installed state
    // costs a read (one row); this public endpoint never reads pg_cron or Vault.
    const successAt = (key: string) => jobs.find((j) => j.key === key)?.lastSuccessAt?.getTime() ?? 0;
    const installedAt = successAt("rank-schedule");
    if (installedAt > successAt("rank-schedule-off") && !failing.includes("rank-schedule") && now - Math.max(installedAt, await lastRankScheduleCall(handle.db)) > RANK_SCHEDULE_SILENT_MS) failing.push("rank-schedule");
    // The database's own tick schedule (production's ten-minute uniiverse-tick, docs/DEPLOYMENT.md):
    // each authorised call of /api/jobs/tick that pg_net sends is recorded as it arrives
    // (server/ops/tick-schedule-calls.ts). A missing tick run proves nothing (GitHub, Vercel's cron
    // and visits run ticks too) and a refused call records nothing, so the schedule's own calls are
    // read: once it has called, a silence of four of its intervals (40 minutes to four hours) lists
    // it, whether its calls are refused (401) or no longer sent (the job removed or made inactive,
    // pg_cron stopped). One row, read on every check; no pg_cron or Vault read here either.
    const tick = await lastTickScheduleCalls(handle.db);
    if (tick.at > 0 && now - tick.at > tickScheduleSilentMs(tick)) failing.push("tick-schedule");
    // What is off by choice, not failing: the five-minute schedule removed after it was installed
    // (the two status rows above), and the tick's jobs set to 0 in Admin (the one "schedule" row of
    // the overrides). The day only, never who: that is in Admin → Audit Logs.
    const { intervals } = await getScheduleOverrides(handle.db);
    const notices = healthNotices({ rankScheduleOnAt: installedAt, rankScheduleOffAt: successAt("rank-schedule-off"), intervals, scheduledJobs: TICK_JOB_ORDER });
    // The static refresh (static-health.ts): the item and rune names' version (read in the database:
    // the 33 KB maps never leave it) and the last attempt that kept nothing. Listed as "static-data"
    // when the newest files failed validation, or it has gone stale by the documented rule.
    const settings = await handle.db
      .select({ key: appSettings.key, version: sql<string | null>`${appSettings.value}->>'version'`, attempt: sql<StaticAttempt | null>`CASE WHEN ${appSettings.key} = ${STATIC_ATTEMPT_KEY} THEN ${appSettings.value} END` })
      .from(appSettings)
      .where(inArray(appSettings.key, ["riot_assets", STATIC_ATTEMPT_KEY]));
    const lastStatic = Math.max(successAt("version-check"), successAt("static-sync"));
    const staticData = staticDataHealth({
      currentVersion: patch?.ddragonVersion ?? null,
      storedVersion: settings.find((r) => r.key === "riot_assets")?.version ?? null,
      attempt: settings.find((r) => r.key === STATIC_ATTEMPT_KEY)?.attempt ?? null,
      lastSuccessAt: lastStatic > 0 ? lastStatic : null,
      turnedOff: intervals["version-check"] === 0,
      now,
    });
    if (staticData.state !== "ok") failing.push("static-data");
    // While Riot rejects the key (expired or revoked), every linked account waits, backing off
    // for hours, and the account sync finds nothing due and reports success. So the key itself
    // is listed as failing, which fails the scheduled Data jobs run (the owner's email).
    const credential = await getRiotCredentialStatus(handle.db);
    if (credential.state === "rejected") failing.push("riot-key");
    // When a linked account was last read from Riot in full (sync_cursor is written on success
    // only), from the accounts themselves: the account-sync job records a run as a success when
    // it had nothing to do, no key, or every account failed, so its time says nothing about data.
    const [read] = await handle.db
      .select({ cursor: sql<number | null>`max(${riotAccounts.syncCursor})` })
      .from(riotAccounts)
      .where(and(eq(riotAccounts.ownerType, "player"), ne(riotAccounts.label, "demo"), ne(riotAccounts.syncStatus, "demo")));
    // Matchup Intel's per-version diff (static_digests): the newest patch recorded, its counts, and
    // how many champions, items and runes changed since the one before. Counts and patches only.
    // One Matchup Intel query must never fail the whole check: on an error, no digests are listed.
    const digests = await digestHealth(handle.db).catch((error: unknown) => {
      log("warn", "health.digests_failed", { error });
      return null;
    });
    const accountsReadAt = read?.cursor ? new Date(Number(read.cursor) * 1000) : null;
    return NextResponse.json({
      ...base,
      db: { ok: true, mode: handle.mode, ms: dbMs },
      patch: patch?.id ?? null,
      data: { champions: jobs.find((j) => j.key === "version-check")?.lastSuccessAt ?? jobs.find((j) => j.key === "static-sync")?.lastSuccessAt ?? null, accounts: accountsReadAt },
      jobs: jobs.map((j) => ({ key: j.key, status: j.status, lastSuccessAt: j.lastSuccessAt })),
      failingJobs: failing,
      notices,
      digests,
      staticData,
      riot: { credential: credential.state },
      ms: Math.round((performance.now() - started) * 10) / 10,
    });
  } catch (err) {
    // The driver's message can name the database host, its region and the database user (for
    // example "password authentication failed for user …" or "getaddrinfo ENOTFOUND …"). This
    // endpoint is public and its answer is printed in the public Actions logs, so the detail goes
    // to the server log only (redacted there too) and visitors get a fixed message.
    log("error", "health.db_failed", { error: err });
    return NextResponse.json({ ...base, ok: false, db: { ok: false, error: PUBLIC_DB_ERROR }, ms: Math.round((performance.now() - started) * 10) / 10 }, { status: 503 });
  }
}
