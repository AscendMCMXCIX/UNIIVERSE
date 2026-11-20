import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import { createDb, type DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS, type EmbeddedMigration } from "@/server/db/migrations.generated";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { accountMatchPrep, accountMatches, appSettings, matchDetails, matchTimelines, patches, players, staticDigests, type MatchParticipantDetail } from "@/server/db/schema";
import { backfillMatchPrep, prepPending, refreshMatchPrep } from "@/server/matchup-intel/prep-store";
import { loadMatchupEvidence } from "@/server/matchup-intel/evidence";
import { unchangedBetween } from "@/server/matchup-intel/digests";
import { invalidateAllCaches } from "@/server/observability/cache";
import { processEgress } from "@/server/db/egress";
import { runJob } from "@/server/jobs";
import { patchSortKey } from "@/domain/patch";
import type { Session } from "@/server/auth/permissions";
import type { ChampionChoice } from "@/domain/matchup-intel/types";

/*
  S7b (docs/MATCHUP_INTEL.md, "In your games"): migration 0067, the evidence rows' backfill, and the
  evidence's read path with the profile pages' own visibility checks.
*/

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
const TAG = "0067_match_prep";

describe("migration 0067_match_prep", () => {
  it("applies on a database at 0065, keeping every row, with RLS on and nothing else changed", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await runMigrations(db, { useAdvisoryLock: false }, EMBEDDED_MIGRATIONS.filter((m) => m.tag < TAG));
      const teamId = String(rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO teams (name) VALUES ('T') RETURNING id`))[0]!.id);
      const playerId = String(rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, "group") VALUES (${teamId}, 'P', 'TOP', 'main') RETURNING id`))[0]!.id);
      const accountId = String(rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO riot_accounts (owner_type, player_id, game_name, tag_line, platform) VALUES ('player', ${playerId}, 'a', 'b', 'oc1') RETURNING id`))[0]!.id);
      await db.execute(sql`INSERT INTO account_matches (account_id, match_id, game_creation, champion_id) VALUES (${accountId}, 'M1', 1, 'Riven')`);
      const before = rowsOf<{ tablename: string }>(await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).map((r) => r.tablename);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([TAG]);
      const after = rowsOf<{ tablename: string }>(await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).map((r) => r.tablename);
      expect(after.filter((t) => !before.includes(t)).sort()).toEqual(["account_match_prep", "static_digests"]);
      expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM account_matches`))[0]!.n).toBe(1);
      const rls = rowsOf<{ relname: string; on: boolean }>(await db.execute(sql`SELECT relname, relrowsecurity AS on FROM pg_class WHERE relname IN ('account_match_prep', 'static_digests') ORDER BY 1`));
      expect(rls).toEqual([{ relname: "account_match_prep", on: true }, { relname: "static_digests", on: true }]);
      // A game's rows go with it.
      await db.execute(sql`INSERT INTO account_match_prep (account_id, match_id, format, prep) VALUES (${accountId}, 'M1', 1, '{"f":1,"lane":"TOP","rule":null,"tl":false}'::jsonb)`);
      await db.execute(sql`DELETE FROM account_matches WHERE match_id = 'M1'`);
      expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM account_match_prep`))[0]!.n).toBe(0);
    } finally {
      await fresh.close();
    }
  });

  /*
    PR #212 holds migration 0066 (held for the owner). If it lands after 0067 is applied, the
    migrator must still apply it: it decides by tag alone, never by number or the journal's `when`.
    A stand-in 0066 placed where the journal would put it (between 0065 and 0067) proves it on both
    of the migrator's paths: the one-transaction-per-migration path and the advisory-locked one.
  */
  for (const useAdvisoryLock of [false, true]) {
    it(`applies a 0066 that lands after 0067 was applied, not skipping it (${useAdvisoryLock ? "advisory-locked" : "per-migration"} path)`, async () => {
      const fresh = await createDb({ mode: "pglite-memory", migrate: false });
      const db = fresh.db;
      try {
        expect((await runMigrations(db, { useAdvisoryLock })).applied).toContain(TAG);
        const probe: EmbeddedMigration = { idx: 66, tag: "0066_held_probe", hash: "probe", statements: ['CREATE TABLE "held_probe" ("id" integer)'] };
        const at = EMBEDDED_MIGRATIONS.findIndex((m) => m.tag === TAG);
        const landed = [...EMBEDDED_MIGRATIONS.slice(0, at), probe, ...EMBEDDED_MIGRATIONS.slice(at)];
        expect((await runMigrations(db, { useAdvisoryLock }, landed)).applied).toEqual([probe.tag]);
        expect(rowsOf(await db.execute(sql`SELECT 1 FROM pg_tables WHERE tablename = 'held_probe'`)).length).toBe(1);
        expect((await runMigrations(db, { useAdvisoryLock }, landed)).applied).toEqual([]);
      } finally {
        await fresh.close();
      }
    });
  }
});

/* ---------- The evidence ---------- */

let handle: DbHandle;
let db: Db;
const ids: Record<string, string> = {};
const accounts: Record<string, string> = {};
const DAY = 86_400_000;
const CURRENT = "16.22";
const PREVIOUS = "16.21";

const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
/** A record of ten: the member (puuid `me`) top on blue against `vs`; `agree` false gives the enemy's individual position as jungle. */
function record(me: string, champion: string, vs: string, agree = true, spells: [number, number] = [4, 14]): MatchParticipantDetail[] {
  return Array.from({ length: 10 }, (_, i) => {
    const lane = LANES[i % 5]!;
    const isMe = i === 0;
    const isVs = i === 5;
    return {
      puuid: isMe ? me : `${me}-x${i}`,
      name: null,
      teamId: i < 5 ? 100 : 200,
      championId: isMe ? champion : isVs ? vs : `Filler${i}`,
      championKey: 0,
      champLevel: 14,
      position: lane,
      teamPosition: lane,
      individualPosition: isVs && !agree ? "JUNGLE" : lane,
      win: i < 5,
      kills: 1,
      deaths: 1,
      assists: 1,
      cs: 100,
      gold: 9000,
      damage: 9000,
      damageTaken: 9000,
      vision: 10,
      wardsPlaced: 5,
      items: null,
      spells: isMe ? spells : [4, 7],
      runes: { keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8446, 8451] },
    };
  });
}

let gameNo = 0;
async function game(who: string, champion: string, vs: string, options: { patch?: string; queue?: number; win?: boolean; agree?: boolean; spells?: [number, number]; timeline?: boolean } = {}) {
  const matchId = `OC1_E${gameNo++}`;
  const puuid = `${who}-puuid`;
  await db.insert(accountMatches).values({ accountId: accounts[who]!, matchId, gameCreation: Date.now() - gameNo * DAY, queueId: options.queue ?? 420, championId: champion, role: "TOP", win: options.win ?? true, enemyChampionId: vs, patch: options.patch ?? CURRENT, gameDuration: 1800, teamId: 100 });
  await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: options.queue ?? 420, gameCreation: Date.now() - gameNo * DAY, gameDuration: 1800, gameVersion: `${options.patch ?? CURRENT}.1`, teams: [], participants: record(puuid, champion, vs, options.agree ?? true, options.spells) });
  if (options.timeline !== false) await db.insert(matchTimelines).values({ matchId, platform: "oc1", participants: [{ puuid, purchases: [[10_000, 1055], [12_000, 2003]], skills: [1, 3, 2, 1, 1, 4, 1, 1, 3, 3] }], frames: null, events: { objectives: [] } });
  return matchId;
}

const session = (who: string | null, options: { capabilities?: Session["capabilities"]; teamMember?: boolean } = {}): Session => ({ userId: "u", role: "player", label: who ?? "nobody", playerId: who ? ids[who]! : null, username: null, hasPassword: true, mustChangePassword: false, setupComplete: true, ...(options.capabilities ? { capabilities: options.capabilities } : {}), ...(options.teamMember === false ? { teamMember: false } : {}) } as Session);
const champ = (id: string): ChampionChoice => ({ id, name: id, title: "", portrait: "" });
const CHAMPS = ["Riven", "Darius", "Garen"].map(champ);
const evidence = (s: Session, vs: string | null = "Darius") => loadMatchupEvidence(db, s, { role: "top", you: champ("Riven"), enemy: vs ? champ(vs) : null, ally: null, enemy2: null }, CHAMPS);

beforeAll(async () => {
  handle = await testDb();
  db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.update(patches).set({ isCurrent: false });
  for (const p of [PREVIOUS, CURRENT]) await db.insert(patches).values({ id: p, ddragonVersion: `${p}.1`, isCurrent: p === CURRENT, sortKey: patchSortKey(p) }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: p === CURRENT } });
  const team = await getOrCreateTeam(db);
  for (const name of ["viewer", "mate", "solo"]) {
    ids[name] = (await createPlayer(db, team.id, { displayName: name, primaryRole: "TOP", primaryPool: ["Riven"] })).id;
    accounts[name] = (await addAccount(db, { ownerType: "player", playerId: ids[name]!, riotId: `${name}#OCE`, platform: "oc1", puuid: `${name}-puuid` })).id;
  }
  // "solo" is a personal-use profile: never counted for anyone else.
  await db.update(players).set({ teamMember: false }).where(eq(players.id, ids.solo!));
  // The viewer: 4 confirmed games against Darius on the current patch (3 Solo/Duo, 1 Normal Draft), one
  // whose positions disagree, 2 on the previous patch and one against Garen.
  for (let i = 0; i < 3; i++) await game("viewer", "Riven", "Darius", { win: i < 2 });
  await game("viewer", "Riven", "Darius", { queue: 400, spells: [4, 12] });
  await game("viewer", "Riven", "Darius", { agree: false });
  await game("viewer", "Riven", "Darius", { patch: PREVIOUS });
  await game("viewer", "Riven", "Darius", { patch: PREVIOUS, timeline: false });
  await game("viewer", "Riven", "Garen");
  // A teammate's 3 and the personal-use profile's 5.
  for (let i = 0; i < 3; i++) await game("mate", "Riven", "Darius");
  for (let i = 0; i < 5; i++) await game("solo", "Riven", "Darius");
}, 120_000);
afterAll(async () => {
  await handle.close();
});

describe("prep-backfill", () => {
  it("inserts every missing row, at most the limit a run, and a second run inserts nothing", async () => {
    expect(await prepPending(db)).toBe(16);
    const first = await backfillMatchPrep(db, { limit: 10 });
    expect(first).toMatchObject({ read: 10, inserted: 10, unnamed: 0, remaining: 6 });
    const second = await backfillMatchPrep(db);
    expect(second).toMatchObject({ read: 6, inserted: 6, remaining: 0 });
    const again = await backfillMatchPrep(db);
    expect(again).toMatchObject({ read: 0, inserted: 0, remaining: 0 });
    // Resumable and insert only: what the first run made is untouched.
    const [one] = await db.select().from(accountMatchPrep).limit(1);
    expect(one!.format).toBe(1);
  });

  it("is a setup job: counts only, no Riot request", async () => {
    const run = await runJob(db, "prep-backfill", "test");
    expect(run.ok).toBe(true);
    expect(run.summary).toMatchObject({ before: 0, read: 0, inserted: 0, remaining: 0 });
    expect(JSON.stringify(run.summary)).not.toMatch(/puuid|viewer|mate|solo|Riven|Darius/);
  });

  it("stores what the record and the timeline say, and the confirmed opponent only when the positions agree", async () => {
    const rows = await db.select({ prep: accountMatchPrep.prep }).from(accountMatchPrep).where(eq(accountMatchPrep.accountId, accounts.viewer!));
    const preps = rows.map((r) => r.prep);
    expect(preps.filter((p) => p.vs === "Darius" && p.rule === "confirmed").length).toBe(6);
    expect(preps.filter((p) => p.rule === null && p.vs === undefined).length).toBe(1);
    expect(preps.find((p) => p.tl)).toMatchObject({ lane: "TOP", spells: "4,14", start: "1055,2003", skills: "QEW", runes: "8000:8010,9111,9104,8299|8400:8446,8451" });
  });

  it("makes a game's rows again when its timeline is stored", async () => {
    const [noTimeline] = await db.select({ matchId: accountMatchPrep.matchId }).from(accountMatchPrep).where(sql`${accountMatchPrep.prep}->>'tl' = 'false' AND ${accountMatchPrep.accountId} = ${accounts.viewer!}`);
    await db.insert(matchTimelines).values({ matchId: noTimeline!.matchId, platform: "oc1", participants: [{ puuid: "viewer-puuid", purchases: [[5_000, 1055]], skills: [1, 2, 3] }], frames: null, events: { objectives: [] } });
    expect(await refreshMatchPrep(db, [noTimeline!.matchId])).toBe(1);
    const [row] = await db.select({ prep: accountMatchPrep.prep }).from(accountMatchPrep).where(eq(accountMatchPrep.matchId, noTimeline!.matchId));
    expect(row!.prep).toMatchObject({ tl: true, start: "1055", skills: "QWE" });
  });

  it("reads the completed items' shop facts from the build data's own key (riot_build_data, R6 review SR6-SEC-5)", async () => {
    const facts = (gold: number, depth: number, tags: string[] = []) => ({ gold: { base: gold, total: gold, sell: 0, purchasable: true }, tags, from: [], into: [], depth, haste: null });
    const build = { version: `${CURRENT}.1`, format: 2, itemInfo: { "1055": { ...facts(450, 1), into: ["3071"] }, "2003": facts(50, 1, ["Consumable"]), "3071": facts(3000, 3) }, spellCooldowns: {}, runeSlots: {} };
    await db.insert(appSettings).values({ key: "riot_build_data", value: build, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: build } });
    invalidateAllCaches();
    const [mine] = await db.select({ matchId: accountMatchPrep.matchId }).from(accountMatchPrep).where(sql`${accountMatchPrep.prep}->>'tl' = 'true' AND ${accountMatchPrep.accountId} = ${accounts.mate!}`).limit(1);
    await db.update(matchTimelines).set({ participants: [{ puuid: "mate-puuid", purchases: [[10_000, 1055], [12_000, 2003], [600_000, 3071]], skills: [1, 2, 3] }] }).where(eq(matchTimelines.matchId, mine!.matchId));
    expect(await refreshMatchPrep(db, [mine!.matchId])).toBe(1);
    const [row] = await db.select({ prep: accountMatchPrep.prep }).from(accountMatchPrep).where(eq(accountMatchPrep.matchId, mine!.matchId));
    expect(row!.prep.items).toBe("3071");
    await db.delete(appSettings).where(eq(appSettings.key, "riot_build_data"));
    invalidateAllCaches();
  });
});

describe("the evidence's read path", () => {
  it("counts your games against the chosen enemy: k of n, the patch and the queues, the disagreeing game left out", async () => {
    invalidateAllCaches();
    const e = (await evidence(session("viewer")))!;
    const own = e.sections.find((s) => s.scope === "own")!;
    expect(own.tier).toBe("In your games (n = 4)");
    expect(own.lines.find((l) => l.key === "record")).toMatchObject({ values: "4 games, 3 won", sample: "patch 26.22 · Solo/Duo 3, Normal Draft 1" });
    expect(own.lines.find((l) => l.key === "spells")).toMatchObject({ sample: "of 4 games · patch 26.22 · Solo/Duo 3, Normal Draft 1" });
  });

  it("adds the previous patch only where the per-version diff shows no change", async () => {
    invalidateAllCaches();
    await db.insert(staticDigests).values([
      { patch: CURRENT, kind: "champion", key: "Riven", hash: "a" },
      { patch: PREVIOUS, kind: "champion", key: "Riven", hash: "a" },
      { patch: CURRENT, kind: "champion", key: "Darius", hash: "d" },
      { patch: PREVIOUS, kind: "champion", key: "Darius", hash: "d" },
    ]);
    expect(await unchangedBetween(db, CURRENT, PREVIOUS, [{ kind: "champion", key: "Riven" }])).toBe(true);
    const own = (await evidence(session("viewer")))!.sections.find((s) => s.scope === "own")!;
    expect(own.lines.find((l) => l.key === "record")).toMatchObject({ values: "6 games, 5 won", sample: "patches 26.22 and 26.21 · Solo/Duo 5, Normal Draft 1" });
    // The tier states the record's n, the previous patch's games included.
    expect(own.tier).toBe("In your games (n = 6)");
    // The rune page names runes the diff has no record of: current patch only.
    expect(own.lines.find((l) => l.key === "runes")?.sample).toBe("of 4 games · patch 26.22 · Solo/Duo 3, Normal Draft 1");
    // The enemy changed, the viewer's champion did not: the record names the enemy, so current patch only.
    await db.update(staticDigests).set({ hash: "b" }).where(sql`${staticDigests.patch} = ${PREVIOUS} AND ${staticDigests.key} = 'Darius'`);
    invalidateAllCaches();
    const changed = (await evidence(session("viewer")))!.sections.find((s) => s.scope === "own")!;
    expect(changed.lines.find((l) => l.key === "record")?.sample).toBe("patch 26.22 · Solo/Duo 3, Normal Draft 1");
    await db.delete(staticDigests);
  });

  it("a repeat view reads nothing from the database: the per-version diff is cached with the counts (R7 review B3)", async () => {
    invalidateAllCaches();
    await db.insert(staticDigests).values([
      { patch: CURRENT, kind: "champion", key: "Riven", hash: "a" },
      { patch: PREVIOUS, kind: "champion", key: "Riven", hash: "a" },
    ]);
    await evidence(session("viewer"));
    const before = processEgress().calls;
    await evidence(session("viewer"));
    expect(processEgress().calls - before).toBe(0);
    await db.delete(staticDigests);
    invalidateAllCaches();
  });

  it("never counts a remake or a game without a known result", async () => {
    const remake = await game("viewer", "Riven", "Darius");
    await db.update(accountMatches).set({ gameDuration: 200 }).where(eq(accountMatches.matchId, remake));
    const unknown = await game("viewer", "Riven", "Darius");
    await db.update(accountMatches).set({ win: null }).where(eq(accountMatches.matchId, unknown));
    await backfillMatchPrep(db);
    invalidateAllCaches();
    const own = (await evidence(session("viewer")))!.sections.find((s) => s.scope === "own")!;
    expect(own.lines.find((l) => l.key === "record")?.values).toBe("4 games, 3 won");
  });

  it("counts the team's games of members the viewer may see, never a personal-use profile's", async () => {
    invalidateAllCaches();
    const team = (await evidence(session("viewer")))!.sections.find((s) => s.scope === "team")!;
    expect(team.tier).toBe("In the team's games (n = 3)");
    expect(team.lines.find((l) => l.key === "record")?.values).toBe("3 games, 3 won");
    // From the teammate's side: the viewer's 4 count; the personal-use profile's 5 never do.
    const mate = (await evidence(session("mate")))!.sections.find((s) => s.scope === "team")!;
    expect(mate.n).toBe(4);
  });

  it("gives a viewer without view-teammate-stats no team counts at all", async () => {
    invalidateAllCaches();
    const restricted = (await evidence(session("viewer", { capabilities: ["view-team", "view-players", "view-matches"] })))!;
    const team = restricted.sections.find((s) => s.scope === "team")!;
    expect(team).toMatchObject({ tier: null, n: 0, lines: [] });
    expect(team.empty).toMatch(/not part of this account's access/);
  });

  it("counts a personal-use player's own games for them, and nobody's for them as team games", async () => {
    invalidateAllCaches();
    const solo = (await evidence(session("solo", { teamMember: false })))!;
    expect(solo.sections.find((s) => s.scope === "own")!.n).toBe(5);
    expect(solo.sections.find((s) => s.scope === "team")!.lines).toEqual([]);
  });

  it("says why when there is nothing to count: no profile, or too few games", async () => {
    invalidateAllCaches();
    const none = (await evidence(session(null)))!;
    expect(none.sections.find((s) => s.scope === "own")!.empty).toMatch(/no player profile/);
    const garen = (await evidence(session("viewer"), "Garen"))!.sections.find((s) => s.scope === "own")!;
    expect(garen.lines).toEqual([]);
    expect(garen.empty).toBe("In your games: 1 as Riven against Garen on patch 26.22, fewer than the 3 a line needs.");
    // With no enemy chosen the lines count every game as Riven top, and say the slot is ignored.
    const any = (await evidence(session("viewer"), null))!;
    expect(any.ignored).toEqual(["the enemy"]);
    expect(any.sections.find((s) => s.scope === "own")!.n).toBe(6);
  });
});
