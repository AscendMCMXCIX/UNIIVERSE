import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, developmentObjectives, developmentPlans, rankedBlocks, rankedGames, rankSnapshots } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { addGame, deleteBlock, deleteGame, finishBlock, getActiveBlock, importMatch, JournalError, listBlocks, startBlock } from "@/server/ranked/repository";
import { associateSessionGames } from "@/server/development/association";
import { createObjective, deleteObjective, DevelopmentError, getObjective, listObjectives, listPlanHistory, resolveGameSession, retirePlan, reusePlan, saveReview, savePlan, saveSessionNote, setObjectiveStatus, setPrimaryObjective, setSessionObjective, skipReview, updateObjective } from "@/server/development/repository";
import { listSessions, loadDevelopment, loadOverview, loadSession, pendingReviews, recentReviews } from "@/server/development/page-data";
import { sessionLpChange } from "@/server/development/ranks";
import { developmentFreshness } from "@/server/ops/freshness";
import { SESSION_IDLE_HOURS } from "@/domain/development/sessions";

/*
  Ranked Development against a real schema (PGlite, or Postgres with TEST_DATABASE_URL): sessions,
  the automatic association of synced games, objectives, If–Then plans, reviews, evidence, LP,
  privacy between players, and the Solo Queue Blocks history it grew from. Numbered after the
  brief's test list.
*/

let handle: DbHandle;
let teamId: string;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const db = () => handle.db;
let matchNo = 0;

/** Stores a synced game the way the account sync does (a Solo/Duo game unless `queue` says otherwise). */
async function syncedGame(accountId: string, start: number, o: { win: boolean; champion?: string; minutes?: number; queue?: number; deaths?: number; role?: string }): Promise<string> {
  const matchId = `OC1_RD${++matchNo}`;
  await db()
    .insert(accountMatches)
    .values({ accountId, matchId, gameCreation: start, queueId: o.queue ?? 420, championId: o.champion ?? "Ahri", role: o.role ?? "MID", win: o.win, enemyChampionId: "Syndra", patch: "26.21", gameDuration: (o.minutes ?? 30) * 60, kills: 5, deaths: o.deaths ?? 4, assists: 6, cs: 200, visionScore: 20, teamKills: 25 });
  return matchId;
}

/** Moves a session's start (and what it collects from) into the past, as if it had been started then. */
async function startedAt(sessionId: string, at: number): Promise<void> {
  await db().update(rankedBlocks).set({ startedAt: new Date(at), collectsFrom: new Date(at), lastActivityAt: new Date(at) }).where(eq(rankedBlocks.id, sessionId));
}

async function player(name: string): Promise<string> {
  return (await createPlayer(db(), teamId, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] })).id;
}

async function account(playerId: string, riotId: string): Promise<string> {
  return (await addAccount(db(), { ownerType: "player", playerId, riotId, platform: "oc1" })).id;
}

const gamesOf = (sessionId: string) => db().select().from(rankedGames).where(eq(rankedGames.blockId, sessionId));

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
});
afterAll(async () => {
  await handle.close();
});

describe("1–2. Sessions: start, end, resume", () => {
  it("starts with the objective, its plan and the chosen account, ends with a note, and is the same session on every device", async () => {
    const me = await player("Ada");
    const main = await account(me, "Ada Main#OCE");
    await db().insert(rankSnapshots).values({ accountId: main, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 40, wins: 10, losses: 10, capturedAt: new Date(Date.now() - DAY) });
    const objective = await createObjective(db(), me, { title: "Ward the river before 3:15", category: "vision", plan: { ifText: "I recall", thenText: "I buy a Control Ward" } });
    expect(objective).toMatchObject({ isPrimary: true, status: "practising" });

    const session = await startBlock(db(), me, "open", "target", { accountId: main });
    expect(session).toMatchObject({ label: "Session 1", status: "active", objectiveId: objective.id, planId: objective.plan!.id, accountId: main, focus: "Ward the river before 3:15", games: 0 });
    expect(session.startRank).toMatchObject({ accountId: main, tier: "GOLD", division: "II", leaguePoints: 40 });
    // Another device (or a reload) finds the same session; starting again never opens a second one.
    expect((await getActiveBlock(db(), me))?.id).toBe(session.id);
    expect((await startBlock(db(), me, 3, "two-losses")).id).toBe(session.id);
    expect((await loadOverview(db(), me)).active?.session.id).toBe(session.id);

    // An empty session can end (its games may still arrive), with the player's own note.
    const ended = await finishBlock(db(), me, session.id, "  Short   sitting  ");
    expect(ended).toMatchObject({ status: "completed", completedReason: "manual", closingNote: "Short sitting", games: 0 });
    expect(await getActiveBlock(db(), me)).toBeNull();
    await saveSessionNote(db(), me, session.id, "Edited later");
    expect((await loadSession(db(), me, session.id))?.session.closingNote).toBe("Edited later");
  });

  it("refuses an objective or an account that is not the player's", async () => {
    const me = await player("Bea");
    const other = await player("Cal");
    const theirs = await createObjective(db(), other, { title: "Their objective", category: "vision" });
    const theirAccount = await account(other, "Cal Main#OCE");
    await expect(startBlock(db(), me, "open", "target", { objectiveId: theirs.id })).rejects.toBeInstanceOf(JournalError);
    await expect(startBlock(db(), me, "open", "target", { accountId: theirAccount })).rejects.toBeInstanceOf(JournalError);
    expect(await getActiveBlock(db(), me)).toBeNull();
  });
});

describe("3. Synced games join the right session", () => {
  it("collects the session's account's Solo/Duo games in its window, once, and nothing else", async () => {
    const me = await player("Dev");
    const main = await account(me, "Dev Main#OCE");
    const alt = await account(me, "Dev Alt#OCE");
    const now = Date.now();
    const session = await startBlock(db(), me, "open", "target", { accountId: main });
    await startedAt(session.id, now - 3 * HOUR);
    const inWindow = await syncedGame(main, now - 150 * MIN, { win: true });
    const runningAtStart = await syncedGame(main, now - 200 * MIN, { win: false, minutes: 35 }); // ended 2h45 ago, after the start
    await syncedGame(alt, now - 100 * MIN, { win: true }); // the session follows the main account
    await syncedGame(main, now - 5 * HOUR, { win: true }); // finished before the session started
    await syncedGame(main, now - 60 * MIN, { win: true, queue: 440 }); // Flex is not Solo/Duo

    expect(await associateSessionGames(db(), me, new Date(now))).toMatchObject({ added: 2, linked: 0 });
    const joined = await gamesOf(session.id);
    expect(joined.map((g) => g.riotMatchId).sort()).toEqual([inWindow, runningAtStart].sort());
    expect(joined.every((g) => g.source === "auto" && g.reviewStatus === "pending" && g.objectiveId === session.objectiveId)).toBe(true);
    // Idempotent: running it again (another sync, another page view) adds nothing.
    expect(await associateSessionGames(db(), me, new Date(now))).toMatchObject({ added: 0, linked: 0, ended: 0 });
    expect(await gamesOf(session.id)).toHaveLength(2);
  });

  it("asks once where a game that fits two sessions belongs, and moves it only when told", async () => {
    const me = await player("Eli");
    const main = await account(me, "Eli Main#OCE");
    const now = Date.now();
    const first = await startBlock(db(), me);
    await startedAt(first.id, now - 4 * HOUR);
    await finishBlock(db(), me, first.id);
    await db().update(rankedBlocks).set({ completedAt: new Date(now - 2 * HOUR) }).where(eq(rankedBlocks.id, first.id));
    const second = await startBlock(db(), me);
    await startedAt(second.id, now - 2 * HOUR + 5 * MIN);
    // Started before the first session ended and finished after the second began.
    const straddling = await syncedGame(main, now - 2 * HOUR - 10 * MIN, { win: true, minutes: 30 });
    await associateSessionGames(db(), me, new Date(now));
    const [game] = await db().select().from(rankedGames).where(and(eq(rankedGames.playerId, me), eq(rankedGames.riotMatchId, straddling)));
    expect(game).toMatchObject({ blockId: first.id, needsConfirmation: true, alternativeBlockId: second.id });
    expect((await loadOverview(db(), me)).confirmations).toEqual({ games: 1, sessionId: first.id });
    expect((await loadSession(db(), me, first.id))?.alternatives).toEqual({ [second.id]: "Session 2" });

    await resolveGameSession(db(), me, game!.id, true);
    const [moved] = await db().select().from(rankedGames).where(eq(rankedGames.id, game!.id));
    expect(moved).toMatchObject({ blockId: second.id, needsConfirmation: false, alternativeBlockId: null });
    expect((await loadOverview(db(), me)).confirmations.games).toBe(0);
  });

  it("ends an abandoned session at its last activity, a two-loss session on its second loss, and still takes late games", async () => {
    const me = await player("Fox");
    const main = await account(me, "Fox Main#OCE");
    const now = Date.now();
    // Abandoned: started 20 hours ago, one game, then nothing.
    const idle = await startBlock(db(), me);
    await startedAt(idle.id, now - 20 * HOUR);
    await syncedGame(main, now - 19 * HOUR, { win: true });
    expect((await associateSessionGames(db(), me, new Date(now))).ended).toBe(1);
    const [ended] = await db().select().from(rankedBlocks).where(eq(rankedBlocks.id, idle.id));
    expect(ended).toMatchObject({ status: "completed", completedReason: "idle" });
    expect(ended!.completedAt!.getTime()).toBe(now - 19 * HOUR + 30 * MIN);
    expect(now - ended!.completedAt!.getTime()).toBeGreaterThan(SESSION_IDLE_HOURS * HOUR);

    // Two-loss rule: ends with the second loss, at the end of that game; a later game is not in it.
    const strict = await startBlock(db(), me, null, "two-losses");
    await startedAt(strict.id, now - 5 * HOUR);
    await syncedGame(main, now - 290 * MIN, { win: false });
    const second = await syncedGame(main, now - 250 * MIN, { win: false });
    const after = await syncedGame(main, now - 150 * MIN, { win: true });
    await associateSessionGames(db(), me, new Date(now));
    const [strictRow] = await db().select().from(rankedBlocks).where(eq(rankedBlocks.id, strict.id));
    expect(strictRow).toMatchObject({ status: "completed", completedReason: "two-losses" });
    expect((await gamesOf(strict.id)).map((g) => g.riotMatchId)).toContain(second);
    expect((await gamesOf(strict.id)).map((g) => g.riotMatchId)).not.toContain(after);

    // Late: a game played before a session ended, handed over by Riot afterwards, still joins it.
    const late = await startBlock(db(), me);
    await startedAt(late.id, now - 3 * HOUR);
    await finishBlock(db(), me, late.id);
    const lateGame = await syncedGame(main, now - 150 * MIN, { win: true });
    // `after` above was in that window too; both are free to join now that the two-loss session ended before it.
    await associateSessionGames(db(), me, new Date(now));
    expect((await gamesOf(late.id)).map((g) => g.riotMatchId)).toEqual(expect.arrayContaining([lateGame]));
  });

  it("never re-adds a synced game the player removed, and never fills sessions finished before sessions existed", async () => {
    const me = await player("Gus");
    const main = await account(me, "Gus Main#OCE");
    const now = Date.now();
    const session = await startBlock(db(), me);
    await startedAt(session.id, now - 2 * HOUR);
    const removed = await syncedGame(main, now - 90 * MIN, { win: true });
    await associateSessionGames(db(), me, new Date(now));
    const [row] = await gamesOf(session.id);
    await deleteGame(db(), me, row!.id);
    expect(await associateSessionGames(db(), me, new Date(now))).toMatchObject({ added: 0 });
    expect(await gamesOf(session.id)).toHaveLength(0);
    // The Riot match itself is untouched, and the player can still add it back by hand.
    expect(await db().select().from(accountMatches).where(eq(accountMatches.matchId, removed))).toHaveLength(1);
    await importMatch(db(), me, removed);
    expect(await gamesOf(session.id)).toHaveLength(1);

    // A block finished before Ranked Development (no collects_from) never collects a game.
    const [legacy] = await db().insert(rankedBlocks).values({ playerId: me, number: 99, status: "completed", completionRule: "target", startedAt: new Date(now - 30 * MIN), completedAt: new Date(now - 1 * MIN), completedReason: "manual" }).returning();
    await syncedGame(main, now - 20 * MIN, { win: true, minutes: 15 });
    await associateSessionGames(db(), me, new Date(now));
    expect(await gamesOf(legacy!.id)).toHaveLength(0);
  });
});

describe("4. No duplicate games or reviews", () => {
  it("links a game typed by hand to its synced match, imports a match once, and keeps one review per game", async () => {
    const me = await player("Hal");
    const main = await account(me, "Hal Main#OCE");
    const now = Date.now();
    const session = await startBlock(db(), me);
    await startedAt(session.id, now - 3 * HOUR);
    const typed = await addGame(db(), me, { championId: "Ahri", result: "win", playedAt: new Date(now - 100 * MIN) });
    expect(typed.game).toMatchObject({ source: "manual", reviewStatus: "pending", riotMatchId: null });
    const match = await syncedGame(main, now - 110 * MIN, { win: true, champion: "Ahri" });
    expect(await associateSessionGames(db(), me, new Date(now))).toMatchObject({ added: 0, linked: 1 });
    const games = await gamesOf(session.id);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ id: typed.game.id, riotMatchId: match, accountId: main });
    await expect(importMatch(db(), me, match)).rejects.toThrow(/already in your journal/);

    await saveReview(db(), me, typed.game.id, { execution: 1, learning: "First take" });
    await saveReview(db(), me, typed.game.id, { execution: 3, learning: "Second take", adjustment: "Ward earlier" });
    const reviewed = await gamesOf(session.id);
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]).toMatchObject({ reviewStatus: "done", execution: 3, learning: "Second take", adjustment: "Ward earlier" });
  });
});

describe("5–6. Objectives and If–Then plans", () => {
  it("keeps one primary objective, moves only when the player moves it, reopens, and deletes without losing sessions", async () => {
    const me = await player("Ida");
    const first = await createObjective(db(), me, { title: "Track the enemy jungler", category: "jungle-awareness", role: "MID" });
    const second = await createObjective(db(), me, { title: "Trade around cooldowns", category: "trading", championIds: ["Ahri", "Ahri", "Syndra"] });
    expect(first).toMatchObject({ isPrimary: true, status: "practising" });
    expect(second).toMatchObject({ isPrimary: false, status: "identified", championIds: ["Ahri", "Syndra"] });
    await expect(createObjective(db(), me, { title: "x", category: "vision" })).rejects.toBeInstanceOf(DevelopmentError);
    await expect(createObjective(db(), me, { title: "Ward more", category: "farming" })).rejects.toThrow(/area/);

    await setPrimaryObjective(db(), me, second.id);
    const [a, b] = await Promise.all([getObjective(db(), me, first.id), getObjective(db(), me, second.id)]);
    expect(a?.isPrimary).toBe(false);
    expect(b).toMatchObject({ isPrimary: true, status: "practising" });

    // The session in progress shows the edited title; finished ones keep theirs.
    const session = await startBlock(db(), me);
    await updateObjective(db(), me, second.id, { title: "Trade only around cooldowns", category: "trading" });
    expect((await getActiveBlock(db(), me))?.focus).toBe("Trade only around cooldowns");
    await finishBlock(db(), me, session.id);

    // Maintaining is the completed list (and leaves the primary slot); it can be reopened.
    const maintained = await setObjectiveStatus(db(), me, second.id, "maintaining");
    expect(maintained).toMatchObject({ status: "maintaining", isPrimary: false });
    const reopened = await setPrimaryObjective(db(), me, second.id);
    expect(reopened).toMatchObject({ status: "practising", isPrimary: true });
    await expect(setObjectiveStatus(db(), me, second.id, "mastered")).rejects.toThrow(/progress step/);

    // Deleting it keeps its session (with the title it was played with) and frees its games.
    await deleteObjective(db(), me, second.id);
    expect(await getObjective(db(), me, second.id)).toBeNull();
    const [kept] = await db().select().from(rankedBlocks).where(eq(rankedBlocks.id, session.id));
    expect(kept).toMatchObject({ objectiveId: null, focus: "Trade only around cooldowns" });
  });

  it("edits an unused plan in place, versions one a finished session used, follows it in the running session, reuses and retires", async () => {
    const me = await player("Jo");
    const objective = await createObjective(db(), me, { title: "Recall on crashes", category: "recall-timing" });
    const v1 = await savePlan(db(), me, objective.id, { ifText: "If I have the gold for my next item", thenText: "then I recall on the crash" });
    expect(v1).toMatchObject({ ifText: "I have the gold for my next item", thenText: "I recall on the crash" });
    const edited = await savePlan(db(), me, objective.id, { ifText: "I have gold for my component", thenText: "I recall on the crash" });
    expect(edited.id).toBe(v1.id);

    const played = await startBlock(db(), me);
    expect(played.planId).toBe(v1.id);
    await finishBlock(db(), me, played.id);
    const v2 = await savePlan(db(), me, objective.id, { ifText: "a big objective spawns within 90 seconds", thenText: "I recall early" });
    expect(v2.id).not.toBe(v1.id);
    expect((await loadSession(db(), me, played.id))?.plan).toMatchObject({ id: v1.id, ifText: "I have gold for my component" });

    const running = await startBlock(db(), me);
    const v3 = await savePlan(db(), me, objective.id, { ifText: "the wave is crashing and I have gold", thenText: "I recall now" });
    expect((await getActiveBlock(db(), me))?.planId).toBe(v3.id);
    await finishBlock(db(), me, running.id);

    const other = await createObjective(db(), me, { title: "Shove before objectives", category: "objective-setup" });
    const reused = await reusePlan(db(), me, v1.id, other.id);
    // The reused copy carries the plan as it was last saved (edited in place before any session used it).
    expect(reused).toMatchObject({ ifText: "I have gold for my component", thenText: "I recall on the crash", objectiveId: other.id });
    await retirePlan(db(), me, reused.id);
    expect((await getObjective(db(), me, other.id))?.plan).toBeNull();
    const history = await listPlanHistory(db(), me);
    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history.find((p) => p.id === v1.id)).toMatchObject({ current: false, sessions: 1 });
    await expect(savePlan(db(), me, objective.id, { ifText: "x", thenText: "y" })).rejects.toThrow(/situation/);
  });
});

describe("7–8. Reviews persist, and skipping costs nothing", () => {
  it("keeps a review's answers, skips without penalty, and lets a skipped game be reviewed later", async () => {
    const me = await player("Kai");
    const main = await account(me, "Kai Main#OCE");
    const now = Date.now();
    await createObjective(db(), me, { title: "Track the enemy jungler", category: "jungle-awareness" });
    const session = await startBlock(db(), me);
    await startedAt(session.id, now - 3 * HOUR);
    await syncedGame(main, now - 160 * MIN, { win: true });
    await syncedGame(main, now - 100 * MIN, { win: false });
    await associateSessionGames(db(), me, new Date(now));
    const [g1, g2] = (await gamesOf(session.id)).sort((x, y) => x.playedAt.getTime() - y.playedAt.getTime());
    expect((await pendingReviews(db(), me, new Date(now))).map((p) => p.id).sort()).toEqual([g1!.id, g2!.id].sort());

    await saveReview(db(), me, g1!.id, { execution: 2, wentWell: "vision", wentWrong: "trading", learning: "Warded before pushing", adjustment: "Ward at 2:45" });
    await skipReview(db(), me, g2!.id);
    expect((await pendingReviews(db(), me, new Date(now))).map((p) => p.id)).toEqual([]);
    await expect(saveReview(db(), me, g2!.id, {})).rejects.toThrow(/at least one/);

    const detail = await loadSession(db(), me, session.id);
    expect(detail?.summary).toMatchObject({ games: 2, wins: 1, losses: 1, reviews: { done: 1, skipped: 1, pending: 0 }, learnings: ["Warded before pushing"], nextAdjustment: "Ward at 2:45" });
    expect((await recentReviews(db(), me)).map((r) => r.learning)).toEqual(["Warded before pushing"]);

    // A skipped game can still be reviewed; skipping a reviewed game keeps its review.
    await saveReview(db(), me, g2!.id, { execution: 0 });
    await skipReview(db(), me, g1!.id);
    const after = await gamesOf(session.id);
    expect(after.find((g) => g.id === g1!.id)).toMatchObject({ reviewStatus: "done", learning: "Warded before pushing" });
    expect(after.find((g) => g.id === g2!.id)).toMatchObject({ reviewStatus: "done", execution: 0 });
  });
});

describe("9–10. Progress and evidence, honest about missing data", () => {
  it("compares the statistic before and during practice, suggests a step from the reviews, and never moves it alone", async () => {
    const me = await player("Lia");
    const main = await account(me, "Lia Main#OCE");
    const now = Date.now();
    const objective = await createObjective(db(), me, { title: "Respect the enemy jungler", category: "positioning", role: "MID", measure: "deaths" });
    // Six games before practice (about 6 deaths each), then a practice session with six games (about 2).
    for (let i = 0; i < 6; i++) await syncedGame(main, now - 20 * DAY + i * HOUR, { win: i % 2 === 0, deaths: 6 + (i % 2) });
    const session = await startBlock(db(), me);
    await startedAt(session.id, now - 8 * HOUR);
    for (let i = 0; i < 6; i++) await syncedGame(main, now - 7 * HOUR + i * HOUR, { win: true, deaths: 2 + (i % 2) });
    await associateSessionGames(db(), me, new Date(now));
    const games = (await gamesOf(session.id)).sort((x, y) => x.playedAt.getTime() - y.playedAt.getTime());
    expect(games).toHaveLength(6);
    for (const g of games) await saveReview(db(), me, g.id, { execution: 3 });

    const { objectives } = await loadDevelopment(db(), me, new Date(now));
    const progress = objectives.find((p) => p.objective.id === objective.id)!;
    expect(progress.evidence?.result).toMatchObject({ state: "compared", measure: "deaths", trend: "toward" });
    expect(progress.evidence?.text?.headline).toBe("Deaths per game: lower than before");
    expect(progress.evidence?.text?.caveat).toMatch(/not proof of improvement/);
    expect(progress.execution.recent).toEqual({ rated: 6, followed: 6 });
    expect(progress.suggestion).toMatchObject({ to: "improving" });
    // Six wins in a row and a better statistic: the objective is still where the player left it.
    expect((await getObjective(db(), me, objective.id))?.status).toBe("practising");
  });

  it("says there are not enough games instead of comparing a handful, and LP only when the snapshots bracket the session", async () => {
    const me = await player("Max");
    const main = await account(me, "Max Main#OCE");
    const alt = await account(me, "Max Alt#OCE");
    const now = Date.now();
    const objective = await createObjective(db(), me, { title: "Farm under tower", category: "wave-management", role: "MID", measure: "cs-per-min" });
    await syncedGame(main, now - 10 * DAY, { win: true });
    const session = await startBlock(db(), me);
    await startedAt(session.id, now - 3 * HOUR);
    await syncedGame(main, now - 150 * MIN, { win: true });
    await syncedGame(main, now - 100 * MIN, { win: false });
    await associateSessionGames(db(), me, new Date(now));
    const { objectives } = await loadDevelopment(db(), me, new Date(now));
    const evidence = objectives.find((p) => p.objective.id === objective.id)!.evidence!;
    expect(evidence.result).toMatchObject({ state: "insufficient", baseline: 1, practice: 2, needed: 5 });
    expect(evidence.text?.headline).toBe("Not enough games to compare yet");

    const startedAtDate = new Date(now - 3 * HOUR);
    const games = (await gamesOf(session.id)).map((g) => ({ accountId: g.accountId }));
    // No snapshot at all.
    expect(await sessionLpChange(db(), { startedAt: startedAtDate, accountId: null, startRank: null }, games)).toEqual({ state: "unknown", reason: "no-rank" });
    await db().insert(rankSnapshots).values({ accountId: main, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 50, wins: 20, losses: 20, capturedAt: new Date(now - 4 * HOUR) });
    // The rank after the games has not been read yet.
    expect(await sessionLpChange(db(), { startedAt: startedAtDate, accountId: null, startRank: null }, games)).toEqual({ state: "unknown", reason: "not-read-yet" });
    // Read after exactly these two games: +2 LP.
    await db().insert(rankSnapshots).values({ accountId: main, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 52, wins: 21, losses: 21, capturedAt: new Date(now - 30 * MIN) });
    expect(await sessionLpChange(db(), { startedAt: startedAtDate, accountId: null, startRank: null }, games)).toMatchObject({ state: "known", change: 2 });
    // Games on two accounts: LP is per account, so none is given.
    expect(await sessionLpChange(db(), { startedAt: startedAtDate, accountId: null, startRank: null }, [...games, { accountId: alt }])).toEqual({ state: "unknown", reason: "several-accounts" });
    // A third game outside the session before the next reading: its share is unknown.
    expect(await sessionLpChange(db(), { startedAt: startedAtDate, accountId: null, startRank: null }, games.slice(0, 1))).toEqual({ state: "unknown", reason: "other-games" });
  });

  it("works for a player with no Riot account and nothing recorded yet", async () => {
    const me = await player("Neo");
    const objective = await createObjective(db(), me, { title: "Ward the river", category: "vision", measure: "vision-per-min" });
    const overview = await loadOverview(db(), me);
    expect(overview).toMatchObject({ active: null, last: null, pending: [], reviews: [], confirmations: { games: 0, sessionId: null } });
    expect(overview.primary?.evidence?.result).toMatchObject({ state: "insufficient" });
    expect(overview.primary?.suggestion).toBeNull();
    expect((await loadDevelopment(db(), me)).objectives.map((p) => p.objective.id)).toEqual([objective.id]);
  });
});

describe("11. Privacy: a player's development is theirs alone", () => {
  it("finds nothing of another player's objectives, plans, sessions or reviews, and changes none of them", async () => {
    const owner = await player("Ola");
    const other = await player("Pia");
    const main = await account(owner, "Ola Main#OCE");
    const now = Date.now();
    const objective = await createObjective(db(), owner, { title: "Private objective", category: "mental", detail: "Private why", plan: { ifText: "I lose a game", thenText: "I take a break" } });
    const session = await startBlock(db(), owner);
    await startedAt(session.id, now - 2 * HOUR);
    await syncedGame(main, now - 90 * MIN, { win: true });
    await associateSessionGames(db(), owner, new Date(now));
    const [game] = await gamesOf(session.id);

    expect(await listObjectives(db(), other)).toEqual([]);
    expect(await getObjective(db(), other, objective.id)).toBeNull();
    expect(await loadSession(db(), other, session.id)).toBeNull();
    expect(await listSessions(db(), other, { limit: 10, offset: 0 })).toEqual([]);
    expect(await recentReviews(db(), other)).toEqual([]);
    expect(await listPlanHistory(db(), other)).toEqual([]);
    const notFound = /not found/i;
    await expect(updateObjective(db(), other, objective.id, { title: "Hijacked", category: "mental" })).rejects.toThrow(notFound);
    await expect(deleteObjective(db(), other, objective.id)).rejects.toThrow(notFound);
    await expect(savePlan(db(), other, objective.id, { ifText: "I win a game", thenText: "I queue again" })).rejects.toThrow(notFound);
    await expect(saveReview(db(), other, game!.id, { learning: "Hijacked" })).rejects.toThrow(notFound);
    await expect(skipReview(db(), other, game!.id)).rejects.toThrow(notFound);
    await expect(resolveGameSession(db(), other, game!.id, true)).rejects.toThrow(notFound);
    await expect(saveSessionNote(db(), other, session.id, "Hijacked")).rejects.toThrow(notFound);
    await expect(setSessionObjective(db(), other, session.id, objective.id)).rejects.toThrow(notFound);
    await expect(finishBlock(db(), other, session.id)).rejects.toBeInstanceOf(JournalError);
    // Nothing of the owner's changed.
    expect((await getObjective(db(), owner, objective.id))).toMatchObject({ title: "Private objective", detail: "Private why" });
    expect((await gamesOf(session.id))[0]).toMatchObject({ reviewStatus: "pending", learning: "" });
    expect(await getActiveBlock(db(), owner)).toMatchObject({ id: session.id });
  });

  it("gives an open page a version that changes with a review, and follows a running session closely", async () => {
    const me = await player("Quinn");
    await createObjective(db(), me, { title: "Ward the river", category: "vision" });
    const idle = await developmentFreshness(db(), me);
    expect(idle.sessionActive).toBe(false);
    const session = await startBlock(db(), me);
    const running = await developmentFreshness(db(), me);
    expect(running).toMatchObject({ sessionActive: true, freshness: { pace: "session" } });
    expect(running.freshness.v).not.toBe(idle.freshness.v);
    const { game } = await addGame(db(), me, { championId: "Ahri", result: "win" });
    const before = await developmentFreshness(db(), me);
    await saveReview(db(), me, game.id, { execution: 2 });
    expect((await developmentFreshness(db(), me)).freshness.v).not.toBe(before.freshness.v);
    await finishBlock(db(), me, session.id);
  });
});

describe("12. Solo Queue Blocks history is kept", () => {
  it("shows older blocks as numbered sessions with their notes, and deleting a session never touches Riot data", async () => {
    const me = await player("Rae");
    const main = await account(me, "Rae Main#OCE");
    const now = Date.now();
    const [old] = await db().insert(rankedBlocks).values({ playerId: me, number: 1, status: "completed", plannedGames: 3, focus: "Freeze when ahead", completionRule: "target", completedReason: "manual", startedAt: new Date(now - 10 * DAY), completedAt: new Date(now - 10 * DAY + 3 * HOUR) }).returning();
    await db().insert(rankedGames).values({ blockId: old!.id, playerId: me, championId: "Syndra", result: "loss", mainMistake: "wave-tempo", notes: "Shoved without vision", playedAt: new Date(now - 10 * DAY), source: "manual", reviewStatus: "done", reviewedAt: new Date(now - 10 * DAY), wentWrong: "wave-management" });
    const [listed] = await listSessions(db(), me, { limit: 5, offset: 0, status: "completed" });
    expect(listed).toMatchObject({ label: "Session 1", focus: "Freeze when ahead", games: 1, losses: 1, reviews: { done: 1, pending: 0 } });
    const detail = await loadSession(db(), me, old!.id);
    expect(detail?.games[0]).toMatchObject({ mainMistake: "wave-tempo", notes: "Shoved without vision", wentWrong: "wave-management" });
    expect(detail?.summary.recurring).toEqual([]);

    // A session with a synced game: deleting it removes the journal entries only.
    const session = await startBlock(db(), me);
    await startedAt(session.id, now - 2 * HOUR);
    const match = await syncedGame(main, now - 90 * MIN, { win: true });
    await associateSessionGames(db(), me, new Date(now));
    expect(await gamesOf(session.id)).toHaveLength(1);
    await deleteBlock(db(), me, session.id);
    expect(await listBlocks(db(), me)).toHaveLength(1);
    expect(await db().select().from(accountMatches).where(eq(accountMatches.matchId, match))).toHaveLength(1);
    // Objectives and plans are separate from sessions: deleting a session keeps them.
    expect(await db().select().from(developmentObjectives).where(eq(developmentObjectives.playerId, me))).toHaveLength(0);
    expect(await db().select().from(developmentPlans).where(eq(developmentPlans.playerId, me))).toHaveLength(0);
  });
});
