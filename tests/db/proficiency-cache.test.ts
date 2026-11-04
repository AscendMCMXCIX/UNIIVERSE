import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getProficiencyLookup, invalidateProficiencyCache } from "@/server/proficiency/service";

/*
  The proficiency bundle (every account's history and mastery) is built once for readers that
  arrive together after its cache expired or was cleared, not once per reader.
*/

let handle: DbHandle;
let ids: string[];
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(handle.db)).id;
  ids = [(await createPlayer(handle.db, teamId, { displayName: "One", primaryRole: "TOP", primaryPool: ["Gwen"] })).id, (await createPlayer(handle.db, teamId, { displayName: "Two", primaryRole: "MID", primaryPool: ["Ahri"] })).id];
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the proficiency cache", () => {
  it("builds the bundle once for readers that arrive together", async () => {
    const select = vi.spyOn(handle.db, "select");
    invalidateProficiencyCache();
    await getProficiencyLookup(handle.db, ids);
    const alone = select.mock.calls.length;
    expect(alone).toBeGreaterThan(0);
    invalidateProficiencyCache();
    select.mockClear();
    await Promise.all([getProficiencyLookup(handle.db, ids), getProficiencyLookup(handle.db, ids), getProficiencyLookup(handle.db, ids)]);
    expect(select.mock.calls.length).toBe(alone);
    // Cached: nothing is read again.
    select.mockClear();
    await getProficiencyLookup(handle.db, ids);
    expect(select.mock.calls.length).toBe(0);
    select.mockRestore();
  });
});
