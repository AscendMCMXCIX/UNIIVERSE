import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, PlayerValidationError, updatePlayer } from "@/server/repositories/team";
import { DEFAULT_POOL_LIMITS } from "@/domain/roster";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

describe("champion pool limits", () => {
  it("allows six primary and three secondary champions by default", async () => {
    expect(DEFAULT_POOL_LIMITS).toEqual({ primary: 6, secondary: 3 });
    const team = await getOrCreateTeam(handle.db);
    expect(team.poolLimits).toEqual({ primary: 6, secondary: 3 });
    const p = await createPlayer(handle.db, team.id, { displayName: "Flex", primaryRole: "MID", secondaryRole: "TOP", primaryPool: ["Orianna", "Azir", "Galio", "Ahri", "Syndra", "Zed"], secondaryPool: ["Gwen", "Jax", "Ornn"] }, team.poolLimits);
    expect(p.primaryPool).toHaveLength(6);
    expect(p.secondaryPool).toEqual(["Gwen", "Jax", "Ornn"]);
  });

  it("rejects a seventh primary or a fourth secondary champion", async () => {
    const team = await getOrCreateTeam(handle.db);
    await expect(createPlayer(handle.db, team.id, { displayName: "Too many", primaryRole: "MID", primaryPool: ["Orianna", "Azir", "Galio", "Ahri", "Syndra", "Zed", "Lux"] }, team.poolLimits)).rejects.toBeInstanceOf(PlayerValidationError);
    await expect(createPlayer(handle.db, team.id, { displayName: "Too many off-role", primaryRole: "MID", secondaryRole: "TOP", primaryPool: [], secondaryPool: ["Gwen", "Jax", "Ornn", "Sion"] }, team.poolLimits)).rejects.toThrow(/Secondary pool is limited to 3/);
  });

  it("keeps older two-champion secondary pools valid", async () => {
    const team = await getOrCreateTeam(handle.db);
    const p = await createPlayer(handle.db, team.id, { displayName: "Old pool", primaryRole: "ADC", secondaryRole: "SUPPORT", primaryPool: ["Jinx"], secondaryPool: ["Lulu", "Nautilus"] }, team.poolLimits);
    const updated = await updatePlayer(handle.db, p.id, { displayName: "Old pool", primaryRole: "ADC", secondaryRole: "SUPPORT", primaryPool: ["Jinx", "Kaisa"], secondaryPool: ["Lulu", "Nautilus"] }, team.poolLimits);
    expect(updated.secondaryPool).toEqual(["Lulu", "Nautilus"]);
  });
});
