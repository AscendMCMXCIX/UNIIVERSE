import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateAllCaches } from "@/server/observability/cache";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getBranding, saveBranding } from "@/server/repositories/branding";
import { getOrCreateTeam, updateTeam } from "@/server/repositories/team";

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
    await updateTeam(db, team.id, { name: "Renamed" });
    expect((await getOrCreateTeam(db)).name).toBe("Renamed");
    const branding = await getBranding(db);
    expect(await getBranding(db)).toBe(branding);
    await saveBranding(db, { ...branding, shortName: "UNV" });
    expect((await getBranding(db)).shortName).toBe("UNV");
  });
});
