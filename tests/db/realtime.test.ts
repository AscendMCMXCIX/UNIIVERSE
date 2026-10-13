import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { createDraft, getDraft } from "@/server/repositories/drafts";
import { applyDraftActionCore, undoDraftActionCore } from "@/server/live/apply";
import { getDraftLiveState, removePresence, setController, touchPresence } from "@/server/live/draft-live";
import { assertCanEnterActions, canHoldControl, canTakeControl } from "@/server/live/control";
import type { Session } from "@/server/auth/permissions";

let handle: DbHandle;
let draftId: string;
const coach: Session = { userId: "11111111-1111-4111-8111-111111111111", role: "coach", label: "Coach", playerId: null, username: "c", hasPassword: true, draftLead: false, setupComplete: true };
const player: Session = { userId: "22222222-2222-4222-8222-222222222222", role: "player", label: "Player", playerId: null, username: "p", hasPassword: true, draftLead: false, setupComplete: true };
const owner: Session = { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, username: "o", hasPassword: true, draftLead: false, setupComplete: true };

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
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
  const draft = await createDraft(handle.db, team.id, { opponentName: "Live", side: "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "clash" });
  draftId = draft.id;
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

  it("enforces controller handoff", async () => {
    // Open control: coach may act, player may not.
    expect(assertCanEnterActions({ controllerUserId: null }, coach).ok).toBe(true);
    expect(assertCanEnterActions({ controllerUserId: null }, player).ok).toBe(false);
    // Coach takes control: nobody else can act, even the owner, until handoff.
    await setController(handle.db, draftId, coach.userId!);
    const blocked = await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: owner });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.error).toMatch(/Take control/);
    expect(canTakeControl({ controllerUserId: coach.userId }, owner)).toBe(true);
    expect(canTakeControl({ controllerUserId: coach.userId }, player)).toBe(false);
    // Control is worth nothing to a player: even handed control directly, they cannot enter actions,
    // and nobody else can while they hold it. An Admin or Draft Lead takes control back and acts.
    await setController(handle.db, draftId, player.userId!);
    const coachBlocked = await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: coach });
    expect(coachBlocked.ok).toBe(false);
    const playerBlocked = await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: player });
    expect(playerBlocked.ok).toBe(false);
    expect(playerBlocked.ok === false && playerBlocked.error).toMatch(/Only Admins and Draft Leads/);
    expect(canHoldControl({ role: "player", draftLead: false })).toBe(false);
    expect(canHoldControl({ role: "player", draftLead: true })).toBe(true);
    expect(canHoldControl({ role: "coach", draftLead: false })).toBe(true);
    expect(canHoldControl({ role: "owner", draftLead: false, isActive: false })).toBe(false);
    await setController(handle.db, draftId, owner.userId!);
    const ownerAllowed = await applyDraftActionCore(handle.db, draftId, { championId: "Ahri" }, { session: owner });
    expect(ownerAllowed.ok).toBe(true);
    // A player flagged as Draft Lead has the same rights as a coach when control is open.
    await setController(handle.db, draftId, null);
    expect(assertCanEnterActions({ controllerUserId: null }, { ...player, draftLead: true }).ok).toBe(true);
    const undone = await undoDraftActionCore(handle.db, draftId, { session: { ...player, draftLead: true } });
    expect(undone.ok).toBe(true);
    expect((await getDraft(handle.db, draftId))!.actions).toHaveLength(2);
  });
});
