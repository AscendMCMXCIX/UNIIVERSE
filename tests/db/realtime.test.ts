import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { createDraft, getDraft } from "@/server/repositories/drafts";
import { applyDraftActionCore, undoDraftActionCore } from "@/server/live/apply";
import { getDraftLiveState, removePresence, touchPresence } from "@/server/live/draft-live";
import { assertCanEnterActions } from "@/server/live/control";
import { createUser } from "@/server/repositories/users";
import type { Session } from "@/server/auth/permissions";

let handle: DbHandle;
let draftId: string;
// Real accounts: drafts reference their creator. "coach" is simply the player who created the draft.
let coach: Session;
let player: Session;
let owner: Session;
let legacyDraftId: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const mk = async (username: string, role: "owner" | "player"): Promise<Session> => {
    const u = await createUser(handle.db, { username, password: role === "owner" ? "Owner-pass-123" : null, role });
    return { userId: u.id, role, label: username, playerId: null, username, hasPassword: role === "owner", mustChangePassword: false, setupComplete: true };
  };
  coach = await mk("Creator", "player");
  player = await mk("Viewer", "player");
  owner = await mk("Admin", "owner");
  const team = await getOrCreateTeam(handle.db);
  const specs = [
    ["Top", "TOP", ["Gwen", "Jax"]],
    ["Jg", "JUNGLE", ["Viego", "Sejuani"]],
    ["Mid", "MID", ["Orianna", "Azir"]],
    ["Adc", "ADC", ["Jinx", "Kaisa"]],
    ["Sup", "SUPPORT", ["Nautilus", "Lulu"]],
  ] as const;
  const slots: Record<string, string> = {};
  for (const [name, role, pool] of specs) {
    const p = await createPlayer(handle.db, team.id, { displayName: name, primaryRole: role, primaryPool: [...pool] }, team.poolLimits);
    slots[role] = p.id;
  }
  await setLineup(handle.db, team.id, slots);
  const { getActiveLineupProfiles } = await import("@/server/repositories/team");
  const lineup = (await getActiveLineupProfiles(handle.db, team.id))!;
  const draft = await createDraft(handle.db, team.id, { opponentName: "Live", side: "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "clash", createdByUserId: coach.userId });
  draftId = draft.id;
  legacyDraftId = (await createDraft(handle.db, team.id, { opponentName: "Old", side: "red", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "clash" })).id;
});
afterAll(async () => {
  await handle.close();
});

describe("realtime shared draft", () => {
  it("bumps the version on every action so other clients can detect change", async () => {
    const before = (await getDraftLiveState(handle.db, draftId))!;
    const r = await applyDraftActionCore(handle.db, draftId, { championId: "Darius" }, { session: coach, expectedVersion: before.version });
    expect(r.ok).toBe(true);
    const after = (await getDraftLiveState(handle.db, draftId))!;
    expect(after.version).toBe(before.version + 1);
    // A client that reloads sees the applied action (reconnect restores state).
    const reloaded = (await getDraft(handle.db, draftId))!;
    expect(reloaded.actions).toHaveLength(1);
    expect(reloaded.actions[0]?.championId).toBe("Darius");
  });

  it("rejects an action based on a stale version without corrupting the draft", async () => {
    const state = (await getDraftLiveState(handle.db, draftId))!;
    const first = await applyDraftActionCore(handle.db, draftId, { championId: "Jinx" }, { session: coach, expectedVersion: state.version });
    const second = await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: coach, expectedVersion: state.version });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.conflict).toBe(true);
    const draft = (await getDraft(handle.db, draftId))!;
    expect(draft.actions).toHaveLength(2);
    expect(draft.actions.map((a) => a.championId)).toEqual(["Darius", "Jinx"]);
  });

  it("tracks presence of viewers", async () => {
    await touchPresence(handle.db, draftId, "client-a", coach.userId, "Coach");
    await touchPresence(handle.db, draftId, "client-b", player.userId, "Player");
    const state = (await getDraftLiveState(handle.db, draftId))!;
    expect(state.viewers.map((v) => v.label).sort()).toEqual(["Coach", "Player"]);
    await removePresence(handle.db, draftId, "client-b");
    expect((await getDraftLiveState(handle.db, draftId))!.viewers).toHaveLength(1);
  });

  it("lets only the draft's creator and admins change it; everyone else watches", async () => {
    const state = (await getDraftLiveState(handle.db, draftId))!;
    expect(state.ownerUserId).toBe(coach.userId);
    expect(state.ownerLabel).toBe("Creator");
    // Another player cannot enter, undo or otherwise change official draft state.
    const viewerPick = await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: player });
    expect(viewerPick.ok).toBe(false);
    expect(viewerPick.ok === false && viewerPick.error).toMatch(/Only the player who created it/);
    expect((await undoDraftActionCore(handle.db, draftId, { session: player })).ok).toBe(false);
    expect((await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: null })).ok).toBe(false);
    // The creator can; an admin can override.
    expect((await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: coach })).ok).toBe(true);
    expect((await undoDraftActionCore(handle.db, draftId, { session: owner })).ok).toBe(true);
    expect((await getDraft(handle.db, draftId))!.actions).toHaveLength(2);
  });

  it("keeps drafts from before ownership admin-controlled", async () => {
    expect(assertCanEnterActions({ createdByUserId: null }, coach).ok).toBe(false);
    expect(assertCanEnterActions({ createdByUserId: null }, owner).ok).toBe(true);
    expect((await applyDraftActionCore(handle.db, legacyDraftId, { championId: "Ahri" }, { session: coach })).ok).toBe(false);
    expect((await applyDraftActionCore(handle.db, legacyDraftId, { championId: "Ahri" }, { session: owner })).ok).toBe(true);
  });
});
