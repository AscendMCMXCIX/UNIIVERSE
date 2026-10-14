import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getActiveLineupProfiles, getOrCreateTeam, setLineup, setLineupSlot } from "@/server/repositories/team";
import { createDraft, deleteDraft, getDraft, type DraftRecord } from "@/server/repositories/drafts";
import { previousMeetings } from "@/server/repositories/opponents";
import { applyDraftActionCore } from "@/server/live/apply";
import { archiveCompletedDraft } from "@/server/matches/archive";
import { archiveMatch, createMatchFromDraft, deleteMatch, getMatch, getMatchByDraft, listMatches, saveMatchFromDraft, updateMatch } from "@/server/matches/repository";
import { canStartGame, createSeries, endSeries, getSeries, listSeriesGames, nextGameNumber } from "@/server/series/repository";
import { canStartNextGame } from "@/domain/series";
import { recommendForDraft } from "@/server/engine/service";
import type { Session } from "@/server/auth/permissions";
import type { Side } from "@/domain/draft";

let handle: DbHandle;
let teamId: string;
let subTopId: string;
const owner: Session = { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, username: "o", hasPassword: true, mustChangePassword: false, setupComplete: true };
const ENEMY = ["Zed", "Nocturne", "Ahri", "Kalista", "Thresh", "Garen", "Lux", "Morgana", "Sona", "Ashe", "Malphite", "Karthus", "Caitlyn", "Leona", "Darius"];

async function newDraft(opts: { isTheorycraft?: boolean; mode?: "clash" | "tournament" | "scrim"; side?: Side; seriesId?: string | null; gameNumber?: number; enemyPlayers?: Record<string, string>; opponentName?: string } = {}): Promise<DraftRecord> {
  const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
  return createDraft(handle.db, teamId, { opponentName: opts.opponentName ?? "Rivals", side: opts.side ?? "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: opts.mode ?? "clash", isTheorycraft: opts.isTheorycraft ?? false, eventName: "Clash day 1", seriesId: opts.seriesId ?? null, gameNumber: opts.gameNumber ?? 1, enemyPlayers: opts.enemyPlayers ?? {} });
}

/** Starts the next game of a series the way the draft page does. */
async function nextGame(seriesId: string, side: Side): Promise<DraftRecord> {
  const next = await canStartGame(handle.db, seriesId);
  if (!next.ok) throw new Error(next.error);
  return newDraft({ mode: next.series.mode as "scrim", side, seriesId, gameNumber: next.gameNumber, opponentName: next.series.opponentName });
}

/** Plays a whole draft: our actions follow the engine, enemy actions take the next unused champion. */
async function playOut(draft: DraftRecord): Promise<DraftRecord> {
  let current = draft;
  let enemyIdx = 0;
  for (let guard = 0; guard < 30; guard++) {
    const rec = await recommendForDraft(handle.db, current);
    if (rec.kind === "complete") break;
    let input: { championId: string | null; role?: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | null; playerId?: string | null };
    if (rec.kind === "enemy-turn" || !rec.primary) {
      const used = new Set(current.actions.map((a) => a.championId));
      while (used.has(ENEMY[enemyIdx]!)) enemyIdx++;
      input = { championId: ENEMY[enemyIdx++]! };
    } else if (rec.primary.kind === "ban") input = { championId: rec.primary.championId };
    else if (rec.primary.kind === "pair") input = { championId: rec.primary.picks[0].championId, role: rec.primary.picks[0].role, playerId: rec.primary.picks[0].playerId };
    else input = { championId: rec.primary.championId, role: rec.primary.role, playerId: rec.primary.playerId };
    const out = await applyDraftActionCore(handle.db, current.id, input, { session: owner, onComplete: archiveCompletedDraft });
    if (!out.ok) throw new Error(out.error);
    current = out.draft;
  }
  return (await getDraft(handle.db, current.id))!;
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  teamId = team.id;
  const specs = [
    ["Top", "TOP", ["Gwen", "Jax", "Ornn"]],
    ["Jg", "JUNGLE", ["Viego", "Sejuani", "Vi"]],
    ["Mid", "MID", ["Orianna", "Azir", "Galio"]],
    ["Adc", "ADC", ["Jinx", "Kaisa", "Ezreal"]],
    ["Sup", "SUPPORT", ["Nautilus", "Lulu", "Braum"]],
  ] as const;
  const slots: Record<string, string> = {};
  for (const [name, role, pool] of specs) {
    const p = await createPlayer(handle.db, team.id, { displayName: name, primaryRole: role, primaryPool: [...pool] }, team.poolLimits);
    slots[role] = p.id;
  }
  await setLineup(handle.db, team.id, slots);
  subTopId = (await createPlayer(handle.db, team.id, { displayName: "SubTop", primaryRole: "TOP", primaryPool: ["Sion", "Malphite"] }, team.poolLimits)).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("match history archive", () => {
  it("creates one match record when a real draft completes, carrying mode, opponent, picks, enemy names and the playbook", async () => {
    const draft = await playOut(await newDraft({ mode: "clash", enemyPlayers: { TOP: "EnemyTopLaner", JUNGLE: "Jungler" } }));
    expect(draft.status).toBe("completed");
    const match = await getMatchByDraft(handle.db, draft.id);
    expect(match).not.toBeNull();
    expect(match!.mode).toBe("clash");
    expect(match!.eventName).toBe("Clash day 1");
    expect(match!.opponentName).toBe("Rivals");
    expect(match!.opponentTeamId).toBeNull();
    expect(match!.enemyPlayers).toEqual({ TOP: "EnemyTopLaner", JUNGLE: "Jungler" });
    expect(match!.seriesId).toBeNull();
    expect(match!.gameNumber).toBe(1);
    expect(match!.ourPicks).toHaveLength(5);
    expect(match!.enemyPicks).toHaveLength(5);
    expect(match!.ourPicks.every((p) => p.playerId && p.role)).toBe(true);
    expect((match!.playbook as { version?: number } | null)?.version).toBe(2);
    expect(match!.result).toBeNull();
    // Completing again (or saving by hand) never duplicates the record.
    expect(await createMatchFromDraft(handle.db, draft)).toBe(match!.id);
    expect(await listMatches(handle.db, teamId)).toHaveLength(1);
    // Previous meetings are found by the opponent label, whatever the case.
    expect((await previousMeetings(handle.db, teamId, "rivals")).map((m) => m.id)).toEqual([match!.id]);
  }, 60_000);

  it("never archives a theorycraft draft automatically, but can save it on request", async () => {
    const draft = await playOut(await newDraft({ isTheorycraft: true }));
    expect(draft.status).toBe("completed");
    expect(await getMatchByDraft(handle.db, draft.id)).toBeNull();
    const id = await createMatchFromDraft(handle.db, draft);
    expect((await getMatch(handle.db, id))?.draftId).toBe(draft.id);
    await deleteMatch(handle.db, id);
    expect(await getMatchByDraft(handle.db, draft.id)).toBeNull();
    // Deleting a match record leaves the draft untouched.
    expect((await getDraft(handle.db, draft.id))?.status).toBe("completed");
  }, 60_000);

  it("stores optional results and notes, filters by them, and survives deletion of the draft", async () => {
    const [match] = await listMatches(handle.db, teamId);
    await updateMatch(handle.db, match!.id, { result: "loss", durationSeconds: 31 * 60, notes: "Lost the level-one invade.", vodUrl: "https://example.org/vod", riotMatchId: "EUW1_1" });
    const updated = (await getMatch(handle.db, match!.id))!;
    expect(updated.result).toBe("loss");
    expect(updated.durationSeconds).toBe(1860);
    expect(updated.notes).toMatch(/invade/);
    expect(await listMatches(handle.db, teamId, { result: "loss" })).toHaveLength(1);
    expect(await listMatches(handle.db, teamId, { result: "win" })).toHaveLength(0);
    expect(await listMatches(handle.db, teamId, { mode: "clash", opponentName: "RIVALS" })).toHaveLength(1);
    // Enemy names are optional and editable afterwards; a record without any is fine.
    await updateMatch(handle.db, match!.id, { enemyPlayers: { MID: "MidName" } });
    expect((await getMatch(handle.db, match!.id))?.enemyPlayers).toEqual({ MID: "MidName" });
    expect(await listMatches(handle.db, teamId, { mode: "tournament" })).toHaveLength(0);
    expect(await listMatches(handle.db, teamId, { championId: updated.ourPicks[0]!.championId })).toHaveLength(1);
    expect(await listMatches(handle.db, teamId, { championId: "Teemo" })).toHaveLength(0);
    // Deleting the draft keeps the archived record (draft link cleared).
    await deleteDraft(handle.db, updated.draftId!);
    const kept = (await getMatch(handle.db, updated.id))!;
    expect(kept.draftId).toBeNull();
    expect(kept.result).toBe("loss");
  });

  it("does not change recommendations because of recorded results", async () => {
    const fresh = await newDraft();
    const strip = (r: Awaited<ReturnType<typeof recommendForDraft>>) => JSON.stringify({ ...r, computeMs: 0 });
    const before = strip(await recommendForDraft(handle.db, fresh));
    const [match] = await listMatches(handle.db, teamId);
    await updateMatch(handle.db, match!.id, { result: "win", notes: "We won once; the engine must not care." });
    const after = strip(await recommendForDraft(handle.db, fresh));
    expect(after).toBe(before);
  });

  it("works for a single game with no enemy names, no opponent label and no opponent account", async () => {
    const draft = await playOut(await newDraft({ mode: "scrim", opponentName: "" }));
    const match = (await getMatchByDraft(handle.db, draft.id))!;
    expect(match.opponentName).toBe("");
    expect(match.enemyPlayers).toEqual({});
    expect(match.enemyPicks).toHaveLength(5);
    expect(match.seriesId).toBeNull();
  }, 60_000);
});

describe("best-of series", () => {
  it("plays a best of three that finishes 2-0: independent games, sides and lineups, then no third game", async () => {
    const db = handle.db;
    const series = await createSeries(db, teamId, { mode: "scrim", bestOf: 3, eventName: "Scrim block", opponentName: "Team X" });
    expect(series.bestOf).toBe(3);
    expect(await nextGameNumber(db, series.id)).toBe(1);

    // Game 1 on blue side.
    const g1 = await playOut(await newDraft({ mode: "scrim", side: "blue", seriesId: series.id, gameNumber: 1, opponentName: "Team X", enemyPlayers: { TOP: "XTop" } }));
    const m1 = (await getMatchByDraft(db, g1.id))!;
    expect(m1.seriesId).toBe(series.id);
    expect(m1.gameNumber).toBe(1);
    await updateMatch(db, m1.id, { result: "win" });
    let s = (await getSeries(db, series.id))!;
    expect(s).toMatchObject({ ourWins: 1, theirWins: 0, status: "in_progress", winner: null, gamesStarted: 1 });

    // Game 2 on red side with a substitute top laner: the next game inherits mode, event and
    // opponent but starts a fresh draft with its own side and lineup.
    await setLineupSlot(db, teamId, "TOP", subTopId);
    const g2draft = await nextGame(series.id, "red");
    expect(g2draft.gameNumber).toBe(2);
    expect(g2draft.side).toBe("red");
    expect(g2draft.opponentName).toBe("Team X");
    expect(g2draft.actions).toHaveLength(0);
    expect(g2draft.enemyPlayers).toEqual({}); // names are per game
    expect(g2draft.lineup.map((p) => p.displayName)).toContain("SubTop");
    expect(g1.lineup.map((p) => p.displayName)).not.toContain("SubTop");
    const g2 = await playOut(g2draft);
    const m2 = (await getMatchByDraft(db, g2.id))!;
    expect(m2.gameNumber).toBe(2);
    expect(m2.side).toBe("red");
    expect(m2.id).not.toBe(m1.id);
    expect(m2.ourPicks.map((p) => p.championId)).not.toEqual(m1.ourPicks.map((p) => p.championId)); // its own draft
    await updateMatch(db, m2.id, { result: "win" });
    s = (await getSeries(db, series.id))!;
    expect(s).toMatchObject({ ourWins: 2, theirWins: 0, status: "completed", winner: "us" });
    expect(canStartNextGame(s)).toBe(false);
    expect((await canStartGame(db, series.id)).ok).toBe(false);
    expect((await listSeriesGames(db, series.id)).map((g) => [g.gameNumber, g.side, g.result])).toEqual([
      [1, "blue", "win"],
      [2, "red", "win"],
    ]);
    // Game 1 and game 2 remain independently viewable records.
    expect((await getMatch(db, m1.id))?.enemyPlayers).toEqual({ TOP: "XTop" });
    expect(await listMatches(db, teamId, { seriesId: series.id })).toHaveLength(2);
    await setLineupSlot(db, teamId, "TOP", g1.lineup.find((p) => p.displayName === "Top")!.id);
  }, 120_000);

  it("deleting a game keeps the series consistent: re-scored without it, restorable without a duplicate", async () => {
    const db = handle.db;
    const series = await createSeries(db, teamId, { mode: "scrim", bestOf: 3, eventName: "", opponentName: "Team Z" });
    const g1 = await playOut(await newDraft({ mode: "scrim", side: "blue", seriesId: series.id, gameNumber: 1, opponentName: "Team Z" }));
    const m1 = (await getMatchByDraft(db, g1.id))!;
    await updateMatch(db, m1.id, { result: "win" });
    const g2 = await playOut(await nextGame(series.id, "red"));
    const m2 = (await getMatchByDraft(db, g2.id))!;
    await updateMatch(db, m2.id, { result: "win" });
    expect(await getSeries(db, series.id)).toMatchObject({ ourWins: 2, status: "completed", winner: "us" });
    // Game 2 is deleted: the series reopens at 1-0, game numbers and game 1 untouched.
    await archiveMatch(db, m2.id);
    expect(await getSeries(db, series.id)).toMatchObject({ ourWins: 1, theirWins: 0, status: "in_progress", winner: null });
    expect((await listMatches(db, teamId, { seriesId: series.id })).map((m) => m.gameNumber)).toEqual([1]);
    expect((await getMatch(db, m1.id))).toMatchObject({ gameNumber: 1, result: "win", side: "blue" });
    expect(await getDraft(db, g2.id)).not.toBeNull();
    // Saving game 2's draft again restores the same record and the series result.
    expect(await saveMatchFromDraft(db, (await getDraft(db, g2.id))!)).toBe(m2.id);
    expect(await getSeries(db, series.id)).toMatchObject({ ourWins: 2, status: "completed", winner: "us" });
    expect((await listMatches(db, teamId, { seriesId: series.id })).map((m) => m.gameNumber).sort()).toEqual([1, 2]);
  }, 120_000);

  it("plays a best of five that finishes 3-0 and can be ended early or cancelled", async () => {
    const db = handle.db;
    const series = await createSeries(db, teamId, { mode: "tournament", bestOf: 5, opponentName: "Team Y" });
    const sides: Side[] = ["blue", "red", "blue"];
    for (const side of sides) {
      const game = await playOut(await nextGame(series.id, side));
      const match = (await getMatchByDraft(db, game.id))!;
      expect(match.side).toBe(side);
      await updateMatch(db, match.id, { result: "win" });
    }
    const s = (await getSeries(db, series.id))!;
    expect(s).toMatchObject({ ourWins: 3, theirWins: 0, status: "completed", winner: "us", gamesStarted: 3 });
    expect((await canStartGame(db, series.id)).ok).toBe(false);

    // A series can also be ended by hand: decided by the score when one side leads, cancelled when tied.
    const early = await createSeries(db, teamId, { mode: "practice", bestOf: 3 });
    const game = await playOut(await nextGame(early.id, "blue"));
    await updateMatch(db, (await getMatchByDraft(db, game.id))!.id, { result: "loss" });
    expect((await endSeries(db, early.id))!).toMatchObject({ status: "completed", winner: "them", theirWins: 1 });
    const tied = await createSeries(db, teamId, { mode: "custom", bestOf: 3 });
    expect((await endSeries(db, tied.id, { cancel: true }))!.status).toBe("cancelled");
    expect((await canStartGame(db, tied.id)).ok).toBe(false);
  }, 180_000);
});
