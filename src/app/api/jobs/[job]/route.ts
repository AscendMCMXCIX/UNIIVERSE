import { after, NextResponse, type NextRequest } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getJob, runJob, runTick } from "@/server/jobs";
import { markRankScheduleCall } from "@/server/ops/rank-schedule-calls";
import type { JobKey } from "@/server/ops/refresh-status";
import { deploymentInfo } from "@/server/ops/deployment";
import { jobRequestAuthorised } from "@/server/jobs/authorise";
import { redactedJson } from "@/server/jobs/answer-redact";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Job endpoint for schedulers (Vercel Cron, GitHub Actions, pg_cron, cron-job.org…).
 *   GET/POST /api/jobs/tick          → run whatever is due
 *   GET/POST /api/jobs/tick?background=1 → answer 202 at once and run the tick afterwards
 *                                          (for schedulers with short timeouts or billed minutes)
 *   GET/POST /api/jobs/<job-name>    → run one job now
 * Authenticated with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically), and
 * only that way (see jobRequestAuthorised).
 */
async function handle(request: NextRequest, params: Promise<{ job: string }>) {
  const { job } = await params;
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured on the server." }, { status: 503 });
  if (!jobRequestAuthorised(request.headers.get("authorization"), secret)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  const db = await getAppDb();
  const budgetMs = Number(process.env.UNIIVERSE_JOB_BUDGET_MS ?? 240_000);
  const deployment = deploymentInfo();
  if (job === "tick" && request.nextUrl.searchParams.get("background") === "1") {
    // The answer comes before the jobs run, so it can only say the tick was accepted. Their
    // outcome reaches /api/health (failingJobs), which the scheduled Data jobs run reads next.
    after(async () => {
      await runTick(db, "http", { budgetMs });
    });
    return NextResponse.json({ ok: true, accepted: true, deployment }, { status: 202 });
  }
  if (job === "tick") {
    const result = await runTick(db, "http", { budgetMs });
    // ok says whether every job that ran succeeded, wholly or partly (degraded); a job already
    // running elsewhere did not run here. A failure answers 500 with the same list, so a manual
    // Data jobs run (`curl --fail`) and Vercel Cron's log record the tick as failed.
    const ok = result.ran.every((r) => r.skipped || r.ok);
    // A manual Data jobs run prints the answer in a public log, so it carries no player identifier.
    return redactedJson({ ...result, ok, deployment }, ok ? 200 : 500);
  }
  if (!getJob(job)) return NextResponse.json({ ok: false, error: `Unknown job "${job}"` }, { status: 404 });
  // The five-minute rank schedule calls exactly this, so its call (run or skipped) is its sign of
  // life for /api/health (server/ops/rank-schedule-calls.ts). A failed write must not fail the job.
  if (job === "rank-watch") await markRankScheduleCall(db).catch(() => undefined);
  const result = await runJob(db, job as JobKey, "http", { budgetMs });
  return redactedJson({ ...result, deployment }, result.ok ? 200 : 500);
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, ctx.params);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, ctx.params);
}
