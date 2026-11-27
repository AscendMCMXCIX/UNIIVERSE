import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings, dataRefreshStatus } from "@/server/db/schema";
import { highEloGate, type HighEloOff } from "./switch";
import { countsBytes, HIGH_ELO_MAX_BYTES } from "./store";
import { DAILY_GAMES } from "./sampler";

/*
  The high-elo collection's state for Admin → Data & Integrations (docs/HIGH_ELO_EVIDENCE.md):
  whether it is on, every reason it is off, what is stored and today's games, counts only. Read-only:
  turning it on is the owner's environment variable and the enabling pull request; Admin can only
  stop it, by setting the job's interval to 0.
*/

export interface HighEloState {
  on: boolean;
  off: HighEloOff[];
  rows: number;
  bytes: number;
  maxBytes: number;
  gamesToday: number;
  dailyGames: number;
  /** The last slice that ran: when it finished and its regions' outcomes (servers, never players). */
  lastSlice: { at: string; regions: string[] } | null;
}

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export async function highEloState(db: Db, now = new Date()): Promise<HighEloState> {
  const gate = highEloGate();
  const [[count], bytes, [day], [status]] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS rows FROM high_elo_counts`).then((r) => rowsOf<{ rows: number }>(r)),
    countsBytes(db),
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "high_elo_day")),
    db.select({ lastSuccessAt: dataRefreshStatus.lastSuccessAt, details: dataRefreshStatus.details }).from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "high-elo-sample")),
  ]);
  const today = now.toISOString().slice(0, 10);
  const d = day?.value as { day?: string; games?: number } | undefined;
  // A status row keeps the last run's summary as its details (server/ops/refresh-status.ts).
  const summary = status?.details as { collection?: string; regions?: Array<{ region?: string; outcome?: string }> } | undefined;
  const regions = summary?.collection === "on" ? (summary.regions ?? []).map((r) => `${r.region ?? "?"} ${r.outcome ?? "?"}`) : [];
  return {
    on: gate.on,
    off: gate.off,
    rows: Number(count?.rows ?? 0),
    bytes,
    maxBytes: HIGH_ELO_MAX_BYTES,
    gamesToday: d?.day === today ? (d.games ?? 0) : 0,
    dailyGames: DAILY_GAMES,
    lastSlice: status?.lastSuccessAt && regions.length ? { at: status.lastSuccessAt.toISOString(), regions } : null,
  };
}
