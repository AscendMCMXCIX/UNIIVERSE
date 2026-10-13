/**
 * Seeds a realistic data volume into the local PostgreSQL database for performance measurement:
 * owner account, 8 players with pools and a lineup, demo accounts with champion history,
 * ~N ranked matches across regions and two patches (aggregated), 30 drafts, 25 matches.
 * Development only. Usage: DATABASE_URL=postgres://... pnpm exec tsx scripts/perf-seed.ts [matches]
 */
import "dotenv/config";
const N = Number(process.argv[2] ?? 3000);

async function main() {
  const { createDb } = await import("@/server/db/create");
  const { syncStaticData } = await import("@/server/riot/static/sync");
  const { FixtureStaticProvider } = await import("@/server/riot/static/fixture");
  const { seedDemoRoster, seedDemoAccounts } = await import("@/server/demo/seed");
  const { aggregateRankedMatches } = await import("@/server/ingestion/aggregate");
  const { rankedMatches, rankedParticipants, rankedBans, champions, drafts: draftsT, draftActions, users } = await import("@/server/db/schema");
  const { eq, sql: sqlTag } = await import("drizzle-orm");
  const { createUser } = await import("@/server/repositories/users");
  const { getOrCreateTeam, getActiveLineupProfiles } = await import("@/server/repositories/team");
  const { createDraft } = await import("@/server/repositories/drafts");
  const { applyDraftActionCore } = await import("@/server/live/apply");
  const { createMatchFromDraft, updateMatch } = await import("@/server/matches/repository");
  const { getDraft } = await import("@/server/repositories/drafts");
  const { bumpStatsVersion } = await import("@/server/stats/loader");
  const handle = await createDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await createUser(db, { username: "Ascend", password: "owner-pass-123", role: "owner" }).catch(() => null);
  await seedDemoRoster(db);
  await seedDemoAccounts(db);
  const champs = await db.select({ id: champions.id, key: champions.key }).from(champions);
  const platforms = ["oc1", "euw1", "kr", "na1", "eun1", "br1", "jp1", "vn2"];
  const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const rnd = (n: number) => Math.floor(Math.random() * n);
  // Skewed champion popularity so pick rates look real.
  const weights = champs.map((_, i) => 1 / (1 + i / 12));
  const pick = (used: Set<number>) => {
    for (;;) {
      const r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let acc = 0;
      for (let i = 0; i < champs.length; i++) {
        acc += weights[i]!;
        if (r <= acc) {
          if (used.has(i)) break;
          used.add(i);
          return champs[i]!;
        }
      }
    }
  };
  const existing = await db.select({ n: rankedMatches.matchId }).from(rankedMatches).limit(1);
  if (existing.length === 0) {
    const now = Date.now();
    for (let batch = 0; batch < N; batch += 200) {
      const ms: Array<typeof rankedMatches.$inferInsert> = [];
      const ps: Array<typeof rankedParticipants.$inferInsert> = [];
      const bs: Array<typeof rankedBans.$inferInsert> = [];
      for (let i = batch; i < Math.min(N, batch + 200); i++) {
        const platform = platforms[i % platforms.length]!;
        const patch = i % 4 === 0 ? "16.19" : "16.20";
        const matchId = `${platform.toUpperCase()}_${1000000 + i}`;
        const winning = Math.random() < 0.5 ? 100 : 200;
        const created = now - rnd(14 * 86_400_000);
        ms.push({ matchId, platform, gameVersion: `${patch}.1.1`, patch, queueId: 420, gameCreation: created, gameDuration: 1500 + rnd(900), winningTeamId: winning, aggregatedAt: null });
        const used = new Set<number>();
        for (let t = 0; t < 10; t++) {
          const c = pick(used);
          ps.push({ matchId, puuid: `p-${i}-${t}`, teamId: t < 5 ? 100 : 200, championKey: c.key, championId: c.id, position: positions[t % 5]!, win: (t < 5 ? 100 : 200) === winning, kills: rnd(10), deaths: rnd(8), assists: rnd(15) });
        }
        for (let b = 0; b < 10; b++) {
          const c = pick(used);
          bs.push({ matchId, teamId: b < 5 ? 100 : 200, pickTurn: b + 1, championKey: c.key });
        }
      }
      await db.insert(rankedMatches).values(ms);
      await db.insert(rankedParticipants).values(ps);
      await db.insert(rankedBans).values(bs);
    }
    const agg = await aggregateRankedMatches(db, { batchSize: 500 });
    await bumpStatsVersion(db);
    console.log("ranked matches seeded and aggregated:", agg);
  }
  // Drafts and matches.
  const team = await getOrCreateTeam(db);
  const lineup = await getActiveLineupProfiles(db, team.id);
  const [actionCount] = await db.select({ n: sqlTag<number>`count(*)` }).from(draftActions);
  if (Number(actionCount?.n ?? 0) === 0) await db.delete(draftsT);
  const [anyDraft] = await db.select({ id: draftsT.id }).from(draftsT).limit(1);
  const [ownerRow] = await db.select({ id: users.id, username: users.username, displayName: users.displayName }).from(users).where(eq(users.role, "owner")).limit(1);
  const session = ownerRow ? { userId: ownerRow.id, role: "owner" as const, draftLead: false, setupComplete: true, label: ownerRow.displayName, playerId: null, username: ownerRow.username, hasPassword: true } : null;
  if (lineup && !anyDraft) {
    const patch = "16.20";
    for (let d = 0; d < 30; d++) {
      const draft = await createDraft(db, team.id, { opponentName: `Opp ${d}`, side: d % 2 ? "red" : "blue", patch, players: lineup.players, assignment: lineup.assignment, mode: d % 3 === 0 ? "ranked-flex" : "tournament", formatId: d % 3 === 0 ? "ranked-flex" : "tournament" });
      // Play the draft out fully for 25 of them using the engine's recommendation each step.
      if (d < 12) {
        for (let step = 0; step < 20; step++) {
          const current = await getDraft(db, draft.id);
          if (!current) break;
          const { recommendForDraft } = await import("@/server/engine/service");
          const rec = await recommendForDraft(db, current);
          if (rec.kind === "complete") break;
          let championId: string | null = null;
          let role: string | null = null;
          let playerId: string | null = null;
          if (rec.primary?.kind === "pick") {
            championId = rec.primary.championId;
            role = rec.primary.role;
            playerId = rec.primary.playerId;
          } else if (rec.primary?.kind === "pair") {
            championId = rec.primary.picks[0].championId;
            role = rec.primary.picks[0].role;
            playerId = rec.primary.picks[0].playerId;
          } else if (rec.primary?.kind === "ban") championId = rec.primary.championId;
          else {
            // Enemy turn: pick a random champion not yet used.
            const used = new Set(current.actions.map((a) => a.championId).filter(Boolean));
            championId = champs.find((c) => !used.has(c.id) && Math.random() < 0.3)?.id ?? champs.find((c) => !used.has(c.id))!.id;
          }
          const r = await applyDraftActionCore(db, draft.id, { championId, role: role as never, playerId }, { session });
          if (!r.ok) {
            console.log("draft step failed", r.error);
            break;
          }
          if (r.recommendation.kind === "complete") {
            const matchId = await createMatchFromDraft(db, r.draft);
            await updateMatch(db, matchId, { result: Math.random() < 0.5 ? "win" : "loss" });
            break;
          }
        }
      }
      process.stdout.write(".");
    }
    console.log("\ndrafts and matches seeded");
  }
  await handle.close();
}
void main();
