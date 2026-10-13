import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { drafts, players, users } from "@/server/db/schema";
import { elapsed } from "./log";

export interface ProbeStep {
  name: string;
  ms: number;
  /** Second run of the same step, when the step has a warm path (caches). */
  warmMs?: number;
  note?: string;
  error?: string;
}

/** A step that has not answered after this long is reported as hung instead of stalling the probe. */
export const PROBE_STEP_TIMEOUT_MS = Number(process.env.UNIIVERSE_PROBE_STEP_TIMEOUT_MS ?? 25_000);

function withTimeout<T>(run: () => Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not answer within ${ms} ms (hung query or lost connection)`)), ms);
    run().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function step(name: string, fn: () => Promise<unknown>, options: { warm?: boolean; note?: (r: unknown) => string } = {}): Promise<ProbeStep> {
  const start = performance.now();
  try {
    const r = await withTimeout(fn, PROBE_STEP_TIMEOUT_MS, name);
    const ms = elapsed(start);
    const out: ProbeStep = { name, ms };
    if (options.note) out.note = options.note(r);
    if (options.warm) {
      const s2 = performance.now();
      await withTimeout(fn, PROBE_STEP_TIMEOUT_MS, `${name} (warm)`);
      out.warmMs = elapsed(s2);
    }
    return out;
  } catch (err) {
    return { name, ms: elapsed(start), error: (err as Error).message };
  }
}

/**
 * Times the service calls behind the important pages and actions, inside the running
 * deployment, against the live database. Read-only: nothing is written except the job record.
 * Each step is the same function the page or action calls, so the numbers are what a user
 * waits for minus rendering and network.
 */
export async function runPerfProbe(db: Db): Promise<{ steps: ProbeStep[]; context: Record<string, unknown> }> {
  const { getCurrentPatch, listChampions } = await import("@/server/repositories/champions");
  const { getOrCreateTeam, listPlayers, getActiveLineupProfiles, getPlayer } = await import("@/server/repositories/team");
  const { getDraft } = await import("@/server/repositories/drafts");
  const { recommendForDraft } = await import("@/server/engine/service");
  const { loadStatsProvider, invalidateStatsCache } = await import("@/server/stats/loader");
  const { getProficiencyLookup, invalidateProficiencyCache } = await import("@/server/proficiency/service");
  const { getDataHealth } = await import("@/server/ops/status");
  const { buildTrendsReport } = await import("@/server/trends");
  const { loadProDraftPatterns } = await import("@/server/pro/patterns");
  const { listMatches } = await import("@/server/matches/repository");
  const { getPlayerDataReport } = await import("@/server/proficiency/provenance");
  const { findSession } = await import("@/server/auth/sessions");
  const { getUser } = await import("@/server/repositories/users");

  const steps: ProbeStep[] = [];
  steps.push(await step("db.ping", () => db.execute(sql`select 1`), { warm: true }));
  steps.push(await step("auth.sessionLookup(miss)", () => findSession(db, "s1.probe-token-that-does-not-exist-0000000000000000"), { warm: true }));
  const guarded = <T>(name: string, run: () => Promise<T>) => withTimeout(run, PROBE_STEP_TIMEOUT_MS, name);
  const [owner] = await guarded("users.owner", () => db.select({ id: users.id }).from(users).where(eq(users.role, "owner")).limit(1));
  if (owner) steps.push(await step("auth.getUser", () => getUser(db, owner.id), { warm: true }));
  steps.push(await step("champions.currentPatch", () => getCurrentPatch(db), { warm: true }));
  steps.push(await step("champions.list", () => listChampions(db), { warm: true, note: (r) => `${(r as unknown[]).length} champions` }));
  const team = await guarded("team.getOrCreateTeam", () => getOrCreateTeam(db));
  steps.push(await step("team.listPlayers", () => listPlayers(db, team.id), { warm: true, note: (r) => `${(r as unknown[]).length} players` }));
  steps.push(await step("team.activeLineup", () => getActiveLineupProfiles(db, team.id), { warm: true }));
  invalidateStatsCache();
  steps.push(await step("stats.loadProvider(cold)", () => loadStatsProvider(db), { note: (r) => { const d = (r as { describe(): { totalGames: number; sources: string[] } }).describe(); return `${Math.round(d.totalGames)} effective games · ${d.sources.join("+") || "none"}`; } }));
  steps.push(await step("stats.loadProvider(warm)", () => loadStatsProvider(db)));
  steps.push(await step("health.getDataHealth", () => getDataHealth(db), { warm: true }));
  const lineup = await guarded("team.activeLineup", () => getActiveLineupProfiles(db, team.id));
  if (lineup) {
    invalidateProficiencyCache();
    steps.push(await step("proficiency.lookup(cold)", () => getProficiencyLookup(db, lineup.players.map((p) => p.id))));
    steps.push(await step("proficiency.lookup(warm)", () => getProficiencyLookup(db, lineup.players.map((p) => p.id))));
  }
  const [latest] = await guarded("drafts.latest", () => db.select({ id: drafts.id }).from(drafts).where(eq(drafts.teamId, team.id)).orderBy(desc(drafts.createdAt)).limit(1));
  if (latest) {
    steps.push(await step("draft.getDraft", () => getDraft(db, latest.id), { warm: true }));
    const draft = await guarded("draft.getDraft", () => getDraft(db, latest.id)).catch(() => null);
    if (draft) {
      steps.push(await step("engine.recommend(1st)", () => recommendForDraft(db, draft), { note: (r) => `${(r as { kind: string; computeMs: number; candidates: unknown[] }).kind} · compute ${(r as { computeMs: number }).computeMs} ms · ${(r as { candidates: unknown[] }).candidates.length} candidates` }));
      steps.push(await step("engine.recommend(2nd)", () => recommendForDraft(db, draft), { note: (r) => `compute ${(r as { computeMs: number }).computeMs} ms` }));
    }
  }
  steps.push(await step("matches.list", () => listMatches(db, team.id, { limit: 50 }), { warm: true, note: (r) => `${(r as unknown[]).length} matches` }));
  const patch = await guarded("champions.currentPatch", () => getCurrentPatch(db)).catch(() => null);
  steps.push(await step("trends.report", () => buildTrendsReport(db, patch?.patch ?? null, lineup?.players ?? null), { warm: true }));
  steps.push(await step("pro.patterns", () => loadProDraftPatterns(db), { warm: true, note: (r) => `${(r as { games: number }).games} pro games with order` }));
  const [anyPlayer] = await guarded("players.any", () => db.select({ id: players.id }).from(players).where(eq(players.teamId, team.id)).limit(1)).catch(() => [] as Array<{ id: string }>);
  if (anyPlayer) {
    const player = await guarded("team.getPlayer", () => getPlayer(db, anyPlayer.id)).catch(() => null);
    if (player) steps.push(await step("player.dataReport", () => getPlayerDataReport(db, player, { riotConfigured: !!process.env.RIOT_API_KEY }), { warm: true, note: (r) => `${(r as { champions: unknown[] }).champions.length} champion rows` }));
  }
  const context = { region: process.env.VERCEL_REGION ?? null, commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null, node: process.version, memoryMb: Math.round(process.memoryUsage().rss / 1048576), poolMax: Number(process.env.DATABASE_POOL_MAX ?? 5) };
  return { steps, context };
}
