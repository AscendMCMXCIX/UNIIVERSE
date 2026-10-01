import { NextResponse, type NextRequest } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getJob, runJob, runTick } from "@/server/jobs";
import type { JobKey } from "@/server/ops/refresh-status";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Job endpoint for schedulers (Vercel Cron, GitHub Actions, pg_cron, cron-job.org…).
 *   GET/POST /api/jobs/tick          → run whatever is due
 *   GET/POST /api/jobs/<job-name>    → run one job now
 * Authenticated with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically).
 */
async function handle(request: NextRequest, params: Promise<{ job: string }>) {
  const { job } = await params;
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : request.nextUrl.searchParams.get("secret") ?? "";
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured on the server." }, { status: 503 });
  if (provided !== secret) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  const db = await getAppDb();
  const budgetMs = Number(process.env.UNIIVERSE_JOB_BUDGET_MS ?? 240_000);
  if (job === "tick") {
    const result = await runTick(db, "http", { budgetMs });
    return NextResponse.json({ ok: true, ...result });
  }
  if (!getJob(job)) return NextResponse.json({ ok: false, error: `Unknown job "${job}"` }, { status: 404 });
  const result = await runJob(db, job as JobKey, "http", { budgetMs });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, ctx.params);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return handle(request, ctx.params);
}
