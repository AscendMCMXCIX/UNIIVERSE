import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateAllCaches } from "@/server/observability/cache";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getBranding, saveBranding } from "@/server/repositories/branding";
import { getOrCreateTeam, updateTeam } from "@/server/repositories/team";
import { createPlayer, getActiveLineupProfiles, setLineup } from "@/server/repositories/team";
import { createDraft, getDraft, listDrafts } from "@/server/repositories/drafts";
import { recommendForDraft } from "@/server/engine/service";
import { applyDraftActionCore } from "@/server/live/apply";
import { createUser } from "@/server/repositories/users";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  invalidateAllCaches();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  invalidateAllCaches();
  await handle.close();
});

describe("process caches", () => {
  it("serves champions, patch, branding and team from memory and refreshes after writes", async () => {
    const db = handle.db;
    const a = await listChampions(db);
    const b = await listChampions(db);
    expect(b).toBe(a); // same array instance: no second query
    expect(await getCurrentPatch(db)).toBe(await getCurrentPatch(db));
    const team = await getOrCreateTeam(db);
    expect(await getOrCreateTeam(db)).toBe(team);
    await updateTeam(db, team.id, { secondaryPoolLimit: 4 });
    expect((await getOrCreateTeam(db)).poolLimits.secondary).toBe(4);
    const branding = await getBranding(db);
    expect(await getBranding(db)).toBe(branding);
    await saveBranding(db, { ...branding, shortName: "UNV" });
    expect((await getBranding(db)).shortName).toBe("UNV");
  });

  it("computes a draft recommendation once per draft version and lists drafts without a query per draft", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
    const pools: Record<string, string[]> = { TOP: ["Gwen", "Jax"], JUNGLE: ["Viego", "LeeSin"], MID: ["Ahri", "Orianna"], ADC: ["Jinx", "Kaisa"], SUPPORT: ["Lulu", "Nautilus"] };
    const players: Array<{ id: string }> = [];
    for (const r of roles) players.push(await createPlayer(db, team.id, { displayName: `P ${r}`, primaryRole: r, primaryPool: pools[r]! }, team.poolLimits));
    await setLineup(db, team.id, Object.fromEntries(roles.map((r, i) => [r, players[i]!.id])));
    const lineup = (await getActiveLineupProfiles(db, team.id))!;
    const owner = await createUser(db, { username: "CacheOwner", password: "Owner-pass-12", role: "owner" });
    const session = { userId: owner.id, role: "owner" as const, label: "o", playerId: null, username: owner.username, hasPassword: true, mustChangePassword: false, setupComplete: true };
    const draft = await createDraft(db, team.id, { opponentName: "x", side: "blue", patch: "16.20", players: lineup.players, assignment: lineup.assignment, formatId: "tournament" });
    const r1 = await recommendForDraft(db, draft);
    const r2 = await recommendForDraft(db, draft);
    expect(r2).toBe(r1); // memoised for the same draft version
    const applied = await applyDraftActionCore(db, draft.id, { championId: "Darius" }, { session });
    expect(applied.ok).toBe(true);
    const after = await getDraft(db, draft.id);
    expect(after!.version).toBeGreaterThan(draft.version);
    const r3 = await recommendForDraft(db, after!);
    expect(r3).not.toBe(r1); // a new version is a new computation
    await createDraft(db, team.id, { opponentName: "y", side: "red", patch: "16.20", players: lineup.players, assignment: lineup.assignment, formatId: "tournament" });
    const list = await listDrafts(db, team.id, 10);
    expect(list.length).toBe(2);
    expect(list.find((d) => d.id === draft.id)?.progress).toBe(1);
  });
});
