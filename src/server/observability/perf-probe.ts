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
export const PROBE_STEP_TIMEOUT_MS = Number(
  process.env.UNIIVERSE_PROBE_STEP_TIMEOUT_MS ?? 25_000,
);

function withTimeout<T>(
  run: () => Promise<T>,
  ms: number,
  name: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${name} did not answer within ${ms} ms (hung query or lost connection)`,
          ),
        ),
      ms,
    );
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

async function step(
  name: string,
  fn: () => Promise<unknown>,
  options: { warm?: boolean; note?: (r: unknown) => string } = {},
): Promise<ProbeStep> {
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
export async function runPerfProbe(
  db: Db,
): Promise<{ steps: ProbeStep[]; context: Record<string, unknown> }> {
  const { getCurrentPatch, listChampions } =
    await import("@/server/repositories/champions");
  const { getOrCreateTeam, listPlayers, getActiveLineupProfiles, getPlayer } =
    await import("@/server/repositories/team");
  const { getDraft } = await import("@/server/repositories/drafts");
  const { recommendForDraft } = await import("@/server/engine/service");
  const { loadStatsProvider, invalidateStatsCache } =
    await import("@/server/stats/loader");
  const { getProficiencyLookup, invalidateProficiencyCache } =
    await import("@/server/proficiency/service");
  const { getDataHealth } = await import("@/server/ops/status");
  const { getGlobalCoverage } = await import("@/server/ops/coverage");
  const { describeStatsCheap } = await import("@/server/stats/describe");
  const { getRefreshStatuses } = await import("@/server/ops/refresh-status");
  const { getRiotCredentialStatus } = await import("@/server/riot/credential");
  const { invalidateCache } = await import("@/server/observability/cache");
  const { buildTrendsReport } = await import("@/server/trends");
  const { loadProDraftPatterns } = await import("@/server/pro/patterns");
  const { listMatches } = await import("@/server/matches/repository");
  const { getPlayerDataReport } =
    await import("@/server/proficiency/provenance");
  const { findSession } = await import("@/server/auth/sessions");
  const { getUser } = await import("@/server/repositories/users");

  const steps: ProbeStep[] = [];
  // One hung step is the finding: the probe stops there so the answer arrives within a minute
  // instead of every later step waiting out its own timeout.
  const abort = new Error("probe aborted after a hung step");
  const push = (s: ProbeStep) => {
    steps.push(s);
    if (s.error?.includes("did not answer")) throw abort;
  };
  const probe = async () => {
    push(
      await step("db.ping", () => db.execute(sql`select 1`), { warm: true }),
    );
    push(
      await step(
        "auth.sessionLookup(miss)",
        () =>
          findSession(
            db,
            "s1.probe-token-that-does-not-exist-0000000000000000",
          ),
        { warm: true },
      ),
    );
    const guarded = <T>(name: string, run: () => Promise<T>) =>
      withTimeout(run, PROBE_STEP_TIMEOUT_MS, name);
    const [owner] = await guarded("users.owner", () =>
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "owner"))
        .limit(1),
    );
    if (owner)
      push(
        await step("auth.getUser", () => getUser(db, owner.id), { warm: true }),
      );
    push(
      await step("champions.currentPatch", () => getCurrentPatch(db), {
        warm: true,
      }),
    );
    push(
      await step("champions.list", () => listChampions(db), {
        warm: true,
        note: (r) => `${(r as unknown[]).length} champions`,
      }),
    );
    const team = await guarded("team.getOrCreateTeam", () =>
      getOrCreateTeam(db),
    );
    push(
      await step("team.listPlayers", () => listPlayers(db, team.id), {
        warm: true,
        note: (r) => `${(r as unknown[]).length} players`,
      }),
    );
    push(
      await step(
        "team.activeLineup",
        () => getActiveLineupProfiles(db, team.id),
        { warm: true },
      ),
    );
    invalidateStatsCache();
    push(
      await step("stats.loadProvider(cold)", () => loadStatsProvider(db), {
        note: (r) => {
          const d = (
            r as { describe(): { totalGames: number; sources: string[] } }
          ).describe();
          return `${Math.round(d.totalGames)} effective games · ${d.sources.join("+") || "none"}`;
        },
      }),
    );
    push(await step("stats.loadProvider(warm)", () => loadStatsProvider(db)));
    // The parts of Data health one by one, so a hung query is named rather than the whole page.
    push(await step("health.refreshStatuses", () => getRefreshStatuses(db)));
    // Concurrency ladder: does opening several pooled connections at once stall on this host?
    for (const n of [2, 4, 6, 8])
      push(
        await step(`db.parallel(${n})`, () =>
          Promise.all(
            Array.from({ length: n }, () => db.execute(sql`select 1`)),
          ),
        ),
      );
    push(
      await step("health.coverageQueriesSequential", async () => {
        const rows = async (q: ReturnType<typeof sql>) =>
          ((await db.execute(q)) as unknown as unknown[]).length;
        const tracked = await rows(
          sql`select platform, count(*) from tracked_summoners group by platform`,
        );
        const queue = await rows(
          sql`select platform, count(*) from match_fetch_queue where status = 'pending' group by platform`,
        );
        const totals = await rows(
          sql`select platform, patch, count(*), max(game_creation) from ranked_matches group by platform, patch`,
        );
        const bands = await rows(
          sql`select tier_band, patch, count(*) from ranked_matches group by tier_band, patch`,
        );
        const statuses = await rows(sql`select * from region_status`);
        return { tracked, queue, totals, bands, statuses };
      }),
    );
    invalidateCache("stats-description");
    push(await step("health.describeStatsCheap", () => describeStatsCheap(db)));
    push(
      await step("health.coverage", () =>
        getGlobalCoverage(db, {
          platformSpec: process.env.RIOT_PLATFORMS,
          tierSpec: process.env.RIOT_TIERS,
          currentPatch: null,
          riotConfigured: !!process.env.RIOT_API_KEY,
        }),
      ),
    );
    invalidateCache("riot-credential");
    push(await step("health.credential", () => getRiotCredentialStatus(db)));
    push(
      await step("health.accountsAggregate", () =>
        db.execute(
          sql`select max(last_sync_at), count(*), count(*) filter (where sync_status = 'ok') from riot_accounts where label <> 'demo'`,
        ),
      ),
    );
    push(
      await step("health.getDataHealth", () => getDataHealth(db), {
        warm: true,
      }),
    );
    const lineup = await guarded("team.activeLineup", () =>
      getActiveLineupProfiles(db, team.id),
    );
    if (lineup) {
      invalidateProficiencyCache();
      push(
        await step("proficiency.lookup(cold)", () =>
          getProficiencyLookup(
            db,
            lineup.players.map((p) => p.id),
          ),
        ),
      );
      push(
        await step("proficiency.lookup(warm)", () =>
          getProficiencyLookup(
            db,
            lineup.players.map((p) => p.id),
          ),
        ),
      );
    }
    const [latest] = await guarded("drafts.latest", () =>
      db
        .select({ id: drafts.id })
        .from(drafts)
        .where(eq(drafts.teamId, team.id))
        .orderBy(desc(drafts.createdAt))
        .limit(1),
    );
    if (latest) {
      push(
        await step("draft.getDraft", () => getDraft(db, latest.id), {
          warm: true,
        }),
      );
      const draft = await guarded("draft.getDraft", () =>
        getDraft(db, latest.id),
      ).catch(() => null);
      if (draft) {
        push(
          await step(
            "engine.recommend(1st)",
            () => recommendForDraft(db, draft),
            {
              note: (r) =>
                `${(r as { kind: string; computeMs: number; candidates: unknown[] }).kind} · compute ${(r as { computeMs: number }).computeMs} ms · ${(r as { candidates: unknown[] }).candidates.length} candidates`,
            },
          ),
        );
        push(
          await step(
            "engine.recommend(2nd)",
            () => recommendForDraft(db, draft),
            {
              note: (r) =>
                `compute ${(r as { computeMs: number }).computeMs} ms`,
            },
          ),
        );
      }
    }
    push(
      await step(
        "matches.list",
        () => listMatches(db, team.id, { limit: 50 }),
        { warm: true, note: (r) => `${(r as unknown[]).length} matches` },
      ),
    );
    const patch = await guarded("champions.currentPatch", () =>
      getCurrentPatch(db),
    ).catch(() => null);
    push(
      await step(
        "trends.report",
        () =>
          buildTrendsReport(db, patch?.patch ?? null, lineup?.players ?? null),
        { warm: true },
      ),
    );
    push(
      await step("pro.patterns", () => loadProDraftPatterns(db), {
        warm: true,
        note: (r) => `${(r as { games: number }).games} pro games with order`,
      }),
    );
    const [anyPlayer] = await guarded("players.any", () =>
      db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.teamId, team.id))
        .limit(1),
    ).catch(() => [] as Array<{ id: string }>);
    if (anyPlayer) {
      const player = await guarded("team.getPlayer", () =>
        getPlayer(db, anyPlayer.id),
      ).catch(() => null);
      if (player)
        push(
          await step(
            "player.dataReport",
            () =>
              getPlayerDataReport(db, player, {
                riotConfigured: !!process.env.RIOT_API_KEY,
              }),
            {
              warm: true,
              note: (r) =>
                `${(r as { champions: unknown[] }).champions.length} champion rows`,
            },
          ),
        );
    }
  };
  try {
    await probe();
  } catch (err) {
    if (err !== abort) throw err;
  }
  const context = {
    region: process.env.VERCEL_REGION ?? null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
    node: process.version,
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    poolMax: Number(process.env.DATABASE_POOL_MAX ?? 5),
    aborted: steps.some((s) => s.error?.includes("did not answer")),
  };
  return { steps, context };
}
