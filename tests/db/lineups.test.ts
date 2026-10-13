import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { applyLineupPreset, createPlayer, deleteLineupPreset, getActiveLineupProfiles, getCurrentLineup, getOrCreateTeam, listLineupPresets, rememberLineupUse, saveCurrentLineupAs, setLineup, setLineupSlot } from "@/server/repositories/team";
import { cloneDraftAsTheorycraft, createDraft, getDraft } from "@/server/repositories/drafts";
import { applyDraftActionCore } from "@/server/live/apply";
import { getMatchByDraft } from "@/server/matches/repository";
import { archiveCompletedDraft } from "@/server/matches/archive";
import { getBranding, saveBranding } from "@/server/repositories/branding";
import type { Session } from "@/server/auth/permissions";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const owner: Session = { userId: "33333333-3333-4333-8333-333333333333", role: "owner", label: "Owner", playerId: null, username: "o", hasPassword: true, draftLead: false };

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  teamId = team.id;
  const specs = [
    ["Top", "TOP", ["Gwen", "Jax"]],
    ["Jg", "JUNGLE", ["Viego", "Sejuani"]],
    ["Mid", "MID", ["Orianna", "Azir"]],
    ["Adc", "ADC", ["Jinx", "Kaisa"]],
    ["Sup", "SUPPORT", ["Nautilus", "Lulu"]],
    ["SubTop", "TOP", ["Ornn", "Sion"]],
  ] as const;
  for (const [name, role, pool] of specs) ids[name] = (await createPlayer(handle.db, team.id, { displayName: name, primaryRole: role, primaryPool: [...pool] }, team.poolLimits)).id;
  await setLineup(handle.db, team.id, { TOP: ids.Top, JUNGLE: ids.Jg, MID: ids.Mid, ADC: ids.Adc, SUPPORT: ids.Sup });
});
afterAll(async () => {
  await handle.close();
});

describe("saved and recent lineups", () => {
  it("saves the current lineup under a name, applies it back and deletes it", async () => {
    const saved = await saveCurrentLineupAs(handle.db, teamId, "Clash main");
    expect(saved.isSaved).toBe(true);
    expect(saved.slots.TOP).toBe(ids.Top);
    // Change the active lineup, then restore the preset.
    await setLineupSlot(handle.db, teamId, "TOP", ids.SubTop!);
    expect((await getCurrentLineup(handle.db, teamId)).slots.TOP).toBe(ids.SubTop);
    await applyLineupPreset(handle.db, teamId, saved.id);
    expect((await getCurrentLineup(handle.db, teamId)).slots.TOP).toBe(ids.Top);
    // Saving under the same name replaces instead of duplicating.
    await setLineupSlot(handle.db, teamId, "TOP", ids.SubTop!);
    await saveCurrentLineupAs(handle.db, teamId, "clash MAIN");
    const { saved: list } = await listLineupPresets(handle.db, teamId);
    expect(list).toHaveLength(1);
    expect(list[0]!.slots.TOP).toBe(ids.SubTop);
    await deleteLineupPreset(handle.db, teamId, list[0]!.id);
    expect((await listLineupPresets(handle.db, teamId)).saved).toHaveLength(0);
    await expect(saveCurrentLineupAs(handle.db, teamId, "   ")).rejects.toThrow(/name/);
  });

  it("remembers recent lineups when drafts start, without duplicates", async () => {
    await setLineup(handle.db, teamId, { TOP: ids.Top, JUNGLE: ids.Jg, MID: ids.Mid, ADC: ids.Adc, SUPPORT: ids.Sup });
    await rememberLineupUse(handle.db, teamId);
    await rememberLineupUse(handle.db, teamId);
    let { recent } = await listLineupPresets(handle.db, teamId);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.name).toMatch(/Top · Jg · Mid · Adc · Sup/);
    await setLineupSlot(handle.db, teamId, "TOP", ids.SubTop!);
    await rememberLineupUse(handle.db, teamId);
    ({ recent } = await listLineupPresets(handle.db, teamId));
    expect(recent).toHaveLength(2);
    expect(recent[0]!.slots.TOP).toBe(ids.SubTop);
  });
});

describe("theorycraft clone", () => {
  it("copies lineup, format, side and actions so far into a theorycraft draft that never archives", async () => {
    const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
    const draft = await createDraft(handle.db, teamId, { opponentName: "Clone me", side: "red", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "tournament", eventName: "Finals" });
    for (const champion of ["Darius", "Fiora", "Camille"]) {
      const r = await applyDraftActionCore(handle.db, draft.id, { championId: champion }, { session: owner });
      expect(r.ok).toBe(true);
    }
    const clone = (await cloneDraftAsTheorycraft(handle.db, draft.id))!;
    expect(clone.id).not.toBe(draft.id);
    expect(clone.isTheorycraft).toBe(true);
    expect(clone.side).toBe("red");
    expect(clone.mode).toBe("tournament");
    expect(clone.eventName).toMatch(/theorycraft/);
    expect(clone.actions.map((a) => a.championId)).toEqual(["Darius", "Fiora", "Camille"]);
    expect(clone.lineup.map((p) => p.id)).toEqual(draft.lineup.map((p) => p.id));
    // Acting on the clone leaves the original untouched.
    const r = await applyDraftActionCore(handle.db, clone.id, { championId: "Jax" }, { session: owner, onComplete: archiveCompletedDraft });
    expect(r.ok).toBe(true);
    expect((await getDraft(handle.db, draft.id))!.actions).toHaveLength(3);
    expect(await getMatchByDraft(handle.db, clone.id)).toBeNull();
  });
});

describe("branding storage", () => {
  it("round-trips validated branding through app settings", async () => {
    expect((await getBranding(handle.db)).shortName).toBe("UNIIVERSE");
    await saveBranding(handle.db, { teamName: "Team Rocket", shortName: "rocket", accent: "#ff8800", logoDataUrl: "not-an-image" });
    const b = await getBranding(handle.db);
    expect(b).toMatchObject({ teamName: "Team Rocket", shortName: "ROCKET", accent: "#ff8800", logoDataUrl: null });
  });
});
