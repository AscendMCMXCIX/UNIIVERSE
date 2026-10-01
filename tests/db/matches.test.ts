import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getActiveLineupProfiles, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { createDraft, deleteDraft, getDraft, type DraftRecord } from "@/server/repositories/drafts";
import { createOpponentTeam, previousMeetings } from "@/server/repositories/opponents";
import { applyDraftActionCore } from "@/server/live/apply";
import { archiveCompletedDraft } from "@/server/matches/archive";
import { createMatchFromDraft, deleteMatch, getMatch, getMatchByDraft, listMatches, updateMatch } from "@/server/matches/repository";
import { recommendForDraft } from "@/server/engine/service";
import type { Session } from "@/server/auth/permissions";

let handle: DbHandle;
let teamId: string;
let opponentId: string;
const owner: Session = { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, email: "o@x" };
const ENEMY = ["Zed", "Nocturne", "Ahri", "Kalista", "Thresh", "Garen", "Lux", "Morgana", "Sona", "Ashe", "Malphite", "Karthus", "Caitlyn", "Leona", "Darius"];

async function newDraft(opts: { isTheorycraft?: boolean; opponentTeamId?: string | null; mode?: "clash" | "tournament" } = {}): Promise<DraftRecord> {
  const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
  return createDraft(handle.db, teamId, { opponentName: "Rivals", side: "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: opts.mode ?? "clash", isTheorycraft: opts.isTheorycraft ?? false, opponentTeamId: opts.opponentTeamId ?? null, eventName: "Clash day 1" });
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
  opponentId = (await createOpponentTeam(handle.db, teamId, { name: "Rivals" })).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("match history archive", () => {
  it("creates one match record when a real draft completes, carrying mode, opponent, picks and the playbook", async () => {
    const draft = await playOut(await newDraft({ opponentTeamId: opponentId, mode: "clash" }));
    expect(draft.status).toBe("completed");
    const match = await getMatchByDraft(handle.db, draft.id);
    expect(match).not.toBeNull();
    expect(match!.mode).toBe("clash");
    expect(match!.eventName).toBe("Clash day 1");
    expect(match!.opponentTeamId).toBe(opponentId);
    expect(match!.ourPicks).toHaveLength(5);
    expect(match!.enemyPicks).toHaveLength(5);
    expect(match!.ourPicks.every((p) => p.playerId && p.role)).toBe(true);
    expect((match!.playbook as { version?: number } | null)?.version).toBe(2);
    expect(match!.result).toBeNull();
    // Completing again (or saving by hand) never duplicates the record.
    expect(await createMatchFromDraft(handle.db, draft)).toBe(match!.id);
    expect(await listMatches(handle.db, teamId)).toHaveLength(1);
    // The opponent page sees it as a previous meeting.
    expect((await previousMeetings(handle.db, opponentId)).map((m) => m.id)).toEqual([match!.id]);
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
    expect(await listMatches(handle.db, teamId, { mode: "clash", opponentTeamId: opponentId })).toHaveLength(1);
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
    const fresh = await newDraft({ opponentTeamId: opponentId });
    const strip = (r: Awaited<ReturnType<typeof recommendForDraft>>) => JSON.stringify({ ...r, computeMs: 0 });
    const before = strip(await recommendForDraft(handle.db, fresh));
    const [match] = await listMatches(handle.db, teamId);
    await updateMatch(handle.db, match!.id, { result: "win", notes: "We won once; the engine must not care." });
    const after = strip(await recommendForDraft(handle.db, fresh));
    expect(after).toBe(before);
  });
});
