import { desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { dbEgressDaily } from "@/server/db/schema";
import { egressDay } from "@/server/db/egress";
import { defineJob } from "./registry";

const MB = 1024 * 1024;
const mb = (bytes: number) => Math.round((bytes / MB) * 10) / 10;

/**
 * Daily database egress the app should stay under: 4 GB a month (the target, under Supabase
 * Free's 5 GB) less room for backups, connection set-up and TLS, which the app does not count,
 * over 30 days. EGRESS_DAILY_BUDGET_MB overrides it.
 */
export function egressDailyBudgetMb(): number {
  const v = Number(process.env.EGRESS_DAILY_BUDGET_MB);
  return Number.isFinite(v) && v > 0 ? v : 120;
}

/** The app's own counts (server/db/egress.ts): totals per day and the largest query shapes. */
export async function appEgressReport(db: Db, now = new Date()) {
  try {
    const since = egressDay(new Date(now.getTime() - 13 * 86_400_000));
    const days = await db
      .select({ day: dbEgressDaily.day, calls: sql<number>`sum(${dbEgressDaily.calls})::float8`, rows: sql<number>`sum(${dbEgressDaily.rows})::float8`, bytes: sql<number>`sum(${dbEgressDaily.bytes})::float8` })
      .from(dbEgressDaily)
      .where(gte(dbEgressDaily.day, since))
      .groupBy(dbEgressDaily.day)
      .orderBy(desc(dbEgressDaily.day));
    const top = async (day: string) =>
      (await db.select().from(dbEgressDaily).where(eq(dbEgressDaily.day, day)).orderBy(desc(dbEgressDaily.bytes)).limit(25)).map((r) => ({ label: r.label, mb: mb(r.bytes), calls: r.calls, rows: r.rows, kbPerCall: r.calls ? Math.round(r.bytes / r.calls / 102.4) / 10 : null, sample: r.sample }));
    const today = egressDay(now);
    const yesterday = egressDay(new Date(now.getTime() - 86_400_000));
    return {
      note: "Estimated from the rows the app received (text protocol); TLS and connection set-up are not included. Counts reach the table every few minutes per server instance.",
      budgetMbPerDay: egressDailyBudgetMb(),
      days: days.map((d) => ({ day: d.day, mb: mb(Number(d.bytes)), calls: Number(d.calls), rows: Number(d.rows) })),
      topYesterday: await top(yesterday),
      topToday: await top(today),
    };
  } catch (err) {
    return { error: (err as Error).message.slice(0, 200) };
  }
}

/**
 * Compares yesterday's estimated database egress (UTC day) with the daily budget. The scheduled
 * Data jobs run calls it, so a day over budget fails that run and GitHub's failed-workflow email
 * reaches the owner (docs/MONITORING.md). Read-only: one small query on db_egress_daily.
 */
defineJob({
  key: "egress",
  description: "Read-only: yesterday's estimated database egress (counted by the app) against the daily budget; fails when over it.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const now = new Date();
    const yesterday = egressDay(new Date(now.getTime() - 86_400_000));
    const today = egressDay(now);
    const totals = await ctx.db
      .select({ day: dbEgressDaily.day, bytes: sql<number>`sum(${dbEgressDaily.bytes})::float8` })
      .from(dbEgressDaily)
      .where(gte(dbEgressDaily.day, yesterday))
      .groupBy(dbEgressDaily.day);
    const of = (day: string) => Number(totals.find((t) => t.day === day)?.bytes ?? 0);
    const budget = egressDailyBudgetMb();
    const used = mb(of(yesterday));
    const top = (await ctx.db.select({ label: dbEgressDaily.label, bytes: dbEgressDaily.bytes }).from(dbEgressDaily).where(eq(dbEgressDaily.day, yesterday)).orderBy(desc(dbEgressDaily.bytes)).limit(5)).map((r) => `${r.label} ${mb(r.bytes)} MB`);
    const summary = { yesterday, yesterdayMb: used, todaySoFarMb: mb(of(today)), budgetMbPerDay: budget, top };
    if (used > budget) return { ok: false, error: `Database egress on ${yesterday} was about ${used} MB, over the ${budget} MB daily budget. Largest: ${top.join("; ")}`, summary };
    return { ok: true, summary };
  },
});
