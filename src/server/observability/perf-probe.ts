import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, players, riotAccounts, users } from "@/server/db/schema";
import { elapsed } from "./log";
import { processEgress } from "@/server/db/egress";
import { getTeamRoster } from "@/server/team/roster";
import { invalidateLeaderboardCache, loadLeaderboardData, type LeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardView, parseFilters, type LeaderboardView } from "@/server/leaderboards/view";
import { invalidatePlayedTogetherCache, loadPlayedTogether, type PlayedTogether } from "@/server/matches/played-together";
import { getMatchGroups, type MatchGroupsResult } from "@/server/matches/possible-groups";
import { loadEncounterPage, loadGamesBySeason, type EncounterPage } from "@/server/players/encounters";
import { encounterListChoice } from "@/domain/encounters";
import { offeredCurrentSeason } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { getPlayerOverview } from "@/server/players/overview";
import { getPlayerMatchups, type MatchupsData } from "@/server/players/matchups";

export interface ProbeStep {
  name: string;
  ms: number;
  /** Second run of the same step, when the step has a warm path (caches). */
  warmMs?: number;
  /** Database egress of the step in KB, estimated by the app (server/db/egress.ts); Postgres only. */
  kb?: number;
  warmKb?: number;
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
  options: {
    warm?: boolean;
    note?: (r: unknown) => string;
    timeoutMs?: number;
  } = {},
): Promise<ProbeStep> {
  const start = performance.now();
  const timeoutMs = options.timeoutMs ?? PROBE_STEP_TIMEOUT_MS;
  const kbSince = (bytes: number) => Math.round((processEgress().bytes - bytes) / 102.4) / 10;
  try {
    const b1 = processEgress().bytes;
    const r = await withTimeout(fn, timeoutMs, name);
    const ms = elapsed(start);
    const out: ProbeStep = { name, ms, kb: kbSince(b1) };
    if (options.note) out.note = options.note(r);
    if (options.warm) {
      const s2 = performance.now();
      const b2 = processEgress().bytes;
      await withTimeout(fn, timeoutMs, `${name} (warm)`);
      out.warmMs = elapsed(s2);
      out.warmKb = kbSince(b2);
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
  const { getProficiencyLookup, invalidateProficiencyCache } =
    await import("@/server/proficiency/service");
  const { getDataHealth } = await import("@/server/ops/status");
  const { getRefreshStatuses } = await import("@/server/ops/refresh-status");
  const { getRiotCredentialStatus } = await import("@/server/riot/credential");
  const { invalidateCache } = await import("@/server/observability/cache");
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
    // Diagnostic steps (prefix "diag.") are allowed to hang: each one is a data point.
    if (s.error?.includes("did not answer") && !s.name.startsWith("diag."))
      throw abort;
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
    // The parts of Data health one by one, so a hung query is named rather than the whole page.
    push(await step("health.refreshStatuses", () => getRefreshStatuses(db)));
    // Concurrency diagnostics (10 s each, never abort the probe). Found on 2026-10-13: queries
    // pipelined onto a busy connection never answered through the transaction pooler, so the
    // shared pool now goes through a gate (src/server/db/gate.ts). parallel(5) fills the pool,
    // parallel(8) must queue in the gate rather than hang; the separate client with max 8 shows
    // the host can open six connections at once.
    const DIAG_MS = 10_000;
    for (const n of [5, 8])
      push(
        await step(
          `diag.db.parallel(${n})`,
          () =>
            Promise.all(
              Array.from({ length: n }, () => db.execute(sql`select 1`)),
            ),
          { timeoutMs: DIAG_MS },
        ),
      );
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      const { default: postgres } = await import("postgres");
      const { sslOption } = await import("@/server/db/create");
      // max_pipeline 0 = never send a second query on a connection before the first answered (the
      // pool queues it instead); the pairs with and without it show whether pipelining through
      // the pooler is what hangs.
      for (const [max, parallel, pipeline] of [[8, 6, 100]] as const) {
        push(
          await step(
            `diag.pool(max=${max},pipeline=${pipeline}).parallel(${parallel})`,
            async () => {
              const options: Parameters<typeof postgres>[1] & {
                max_pipeline: number;
              } = {
                prepare: false,
                max,
                max_pipeline: pipeline,
                idle_timeout: 5,
                connect_timeout: 8,
                ssl: sslOption(databaseUrl),
                onnotice: () => {},
              };
              const client = postgres(databaseUrl, options);
              try {
                await Promise.all(
                  Array.from({ length: parallel }, () => client`select 1`),
                );
              } finally {
                void client.end({ timeout: 3 }).catch(() => {});
              }
            },
            { timeoutMs: DIAG_MS },
          ),
        );
      }
    }
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
    // Team page cards (season figures in the lineup role, every pool champion), the designated substitutes included (the back of each card).
    push(
      await step("team.roster", () => getTeamRoster(db, team.id), {
        warm: true,
        note: (r) => {
          const slots = (r as { slots: Array<{ champions: unknown[]; substitute: unknown }> }).slots;
          return `${slots.map((s) => s.champions.length).join("/")} champions per card · ${slots.filter((s) => s.substitute).length} of 5 roles with a substitute`;
        },
      }),
    );
    // Team Leaderboards: stored games only (no Riot request). Cold reads the games, warm reuses
    // the cache; the notes are counts only, never names or values.
    invalidateLeaderboardCache();
    const board = await step("leaderboards.data", () => loadLeaderboardData(db, team.id), {
      warm: true,
      note: (r) => {
        const d = r as LeaderboardData;
        return `${d.players.length} players · ${d.games.length} games (${d.rawGames} stored rows) · ${d.games.filter((g) => g.teamKills !== null).length} with match details · ${d.games.filter((g) => g.extra).length} with extra figures`;
      },
    });
    push(board);
    if (!board.error) {
      const data = await loadLeaderboardData(db, team.id);
      push(
        await step("leaderboards.view", async () => buildLeaderboardView(data, parseFilters({}, data), null), {
          warm: true,
          note: (r) => {
            const v = r as LeaderboardView;
            return `${v.gamesInScope} games in default scope · ${v.board.ranked.length} ranked, ${v.board.unranked.length} below minimum on ${v.board.id}`;
          },
        }),
      );
    }
    // The champion window (All Champions → a champion): the lineup's busiest champion over every
    // account and season, its lane over every opponent and its most played pairing. Stored games
    // only (no Riot request); the notes are counts only, never names or values.
    if (lineup?.players.length) {
      let busiest: { playerId: string; championId: string; games: number } | null = null;
      for (const pl of lineup.players) {
        const m = await getPlayerMatchups(db, pl.id, { account: "all", season: "all", mode: "all", champion: null, vs: null }).catch(() => null);
        const top = m?.champions[0];
        if (top && (!busiest || top.games > busiest.games)) busiest = { playerId: pl.id, championId: top.championId, games: top.games };
      }
      if (busiest) {
        const pick = busiest;
        push(
          await step("matchups.window", () => getPlayerMatchups(db, pick.playerId, { account: "all", season: "all", mode: "all", champion: pick.championId, vs: null, exact: true }), {
            warm: true,
            note: (r) => {
              const m = r as MatchupsData;
              return `${m.lane?.games ?? 0} lane games on one champion · ${m.lane?.timelines.frames ?? 0} with frames · ${m.opponents.length} opponents · pairing ${m.detail?.games ?? 0} games`;
            },
          }),
        );
      }
    }
    // Played together (counts only).
    invalidatePlayedTogetherCache();
    push(
      await step("matches.playedTogether", () => loadPlayedTogether(db, team.id), {
        warm: true,
        note: (r) => {
          const t = r as PlayedTogether;
          return `${t.games.length} games together · ${t.games.filter((g) => g.members.length >= 3).length} with 3+ · ${t.unknownSide} side unknown`;
        },
      }),
    );
    // Possible groups for the newest stored game of a team member (one match window): the history
    // search itself, without its per-match cache.
    const [newest] = await db
      .select({ playerId: riotAccounts.playerId, matchId: accountMatches.matchId })
      .from(accountMatches)
      .innerJoin(riotAccounts, and(eq(riotAccounts.id, accountMatches.accountId), eq(riotAccounts.ownerType, "player")))
      .where(isNotNull(accountMatches.championId))
      .orderBy(desc(accountMatches.gameCreation))
      .limit(1);
    if (newest?.playerId) {
      const pick = { playerId: newest.playerId, matchId: newest.matchId };
      push(
        await step("matches.possibleGroups", () => getMatchGroups(db, pick.playerId, pick.matchId, { cache: false }), {
          warm: true,
          note: (r) => {
            const g = r as MatchGroupsResult;
            return g.status === "ok" ? `${g.gamesSearched} earlier stored games searched · ${g.teams.reduce((n, t) => n + t.groups.length, 0)} possible groups` : g.status;
          },
        }),
      );
    }
    // A profile's Encounters (counts only, never names) for the player with the most stored games:
    // the season choice's counts, then the default list and highlights of the current season.
    const [busiest] = await db
      .select({ playerId: riotAccounts.playerId })
      .from(accountMatches)
      .innerJoin(riotAccounts, and(eq(riotAccounts.id, accountMatches.accountId), eq(riotAccounts.ownerType, "player")))
      .where(isNotNull(accountMatches.championId))
      .groupBy(riotAccounts.playerId)
      .orderBy(desc(sql`count(*)`))
      .limit(1);
    if (busiest?.playerId) {
      const accountIds = (await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, busiest.playerId))).map((a) => a.id);
      const season = offeredCurrentSeason(await currentSeason(db));
      push(
        await step("profile.encounters", async () => ({ bySeason: await loadGamesBySeason(db, accountIds, null), page: await loadEncounterPage(db, { accountIds, season, mode: "all" }, encounterListChoice({})) }), {
          note: (r) => {
            const e = r as { bySeason: unknown[]; page: EncounterPage };
            return `${e.bySeason.length} season and queue counts · ${e.page.games} games this season · ${e.page.withPlayers} with players recorded · ${e.page.total} opponents met twice or more · ${e.page.insights.length} highlights`;
          },
        }),
      );
    }
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
            "player.overview",
            () => getPlayerOverview(db, player, { mode: "all", riotConfigured: !!process.env.RIOT_API_KEY }),
            {
              warm: true,
              note: (r) => {
                const o = r as { pool: { record: { games: number } }; allPerformance: { games: number; detailedGames: number } };
                return `${o.pool.record.games} pool games; ${o.allPerformance.detailedGames}/${o.allPerformance.games} season games with K/D/A`;
              },
            },
          ),
        );
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
