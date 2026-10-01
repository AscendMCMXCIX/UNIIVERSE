import { NextResponse } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getDataHealth } from "@/server/ops/status";

export const dynamic = "force-dynamic";

/** Lightweight health endpoint for uptime checks (no secrets, no personal data). */
export async function GET() {
  try {
    const db = await getAppDb();
    const health = await getDataHealth(db);
    return NextResponse.json({
      ok: true,
      patch: health.patch?.id ?? null,
      warnings: health.warnings,
      stats: health.stats,
      jobs: health.jobs.map((j) => ({ key: j.key, status: j.status, lastSuccessAt: j.lastSuccessAt })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
