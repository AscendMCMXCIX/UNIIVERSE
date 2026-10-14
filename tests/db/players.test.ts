import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, patchPlayerProfile, PlayerValidationError, updatePlayer } from "@/server/repositories/team";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

describe("champion pools (Phase 5: no caps, additional roles)", () => {
  const many = ["Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Annie", "Aphelios", "Ashe", "Azir", "Bard", "Brand", "Braum"];

  it("accepts pools of any size, in the player's order", async () => {
    const team = await getOrCreateTeam(handle.db);
    const p = await createPlayer(handle.db, team.id, { displayName: "Big pool", primaryRole: "MID", secondaryRole: "TOP", primaryPool: many, secondaryPool: many.slice(0, 10) });
    expect(p.primaryPool).toEqual(many);
    expect(p.secondaryPool).toEqual(many.slice(0, 10));
  });

  it("stores additional roles after the secondary, each with its own ordered pool", async () => {
    const team = await getOrCreateTeam(handle.db);
    const p = await createPlayer(handle.db, team.id, {
      displayName: "Fill",
      primaryRole: "TOP",
      secondaryRole: "MID",
      primaryPool: ["Aatrox", "Ambessa"],
      secondaryPool: ["Ahri"],
      additionalRoles: [
        { role: "SUPPORT", pool: ["Braum", "Bard", "Alistar"] },
        { role: "JUNGLE", pool: ["Amumu"] },
      ],
    });
    expect(p.additionalRoles).toEqual([
      { role: "SUPPORT", pool: ["Braum", "Bard", "Alistar"] },
      { role: "JUNGLE", pool: ["Amumu"] },
    ]);
    // Reordering roles and champions keeps each pool with its role.
    const r = await patchPlayerProfile(handle.db, p.id, { additionalRoles: [{ role: "JUNGLE", pool: ["Amumu"] }, { role: "SUPPORT", pool: ["Alistar", "Braum", "Bard"] }] });
    expect(r.ok).toBe(true);
    expect(r.player.additionalRoles).toEqual([
      { role: "JUNGLE", pool: ["Amumu"] },
      { role: "SUPPORT", pool: ["Alistar", "Braum", "Bard"] },
    ]);
  });

  it("refuses a role listed twice", async () => {
    const team = await getOrCreateTeam(handle.db);
    await expect(createPlayer(handle.db, team.id, { displayName: "Dup", primaryRole: "TOP", secondaryRole: "MID", additionalRoles: [{ role: "MID", pool: [] }] })).rejects.toBeInstanceOf(PlayerValidationError);
    await expect(createPlayer(handle.db, team.id, { displayName: "Dup2", primaryRole: "TOP", secondaryRole: "MID", additionalRoles: [{ role: "ADC", pool: [] }, { role: "ADC", pool: [] }] })).rejects.toBeInstanceOf(PlayerValidationError);
  });

  it("drops an additional role that becomes the primary or secondary role", async () => {
    const team = await getOrCreateTeam(handle.db);
    const p = await createPlayer(handle.db, team.id, { displayName: "Swap", primaryRole: "ADC", secondaryRole: "SUPPORT", primaryPool: ["Ashe"], secondaryPool: ["Braum"], additionalRoles: [{ role: "MID", pool: ["Ahri"] }] });
    const r = await patchPlayerProfile(handle.db, p.id, { secondaryRole: "MID" });
    expect(r.player.secondaryRole).toBe("MID");
    expect(r.player.additionalRoles).toEqual([]);
  });

  it("keeps additional roles when a form that only knows primary and secondary saves", async () => {
    const team = await getOrCreateTeam(handle.db);
    const p = await createPlayer(handle.db, team.id, { displayName: "Keep", primaryRole: "ADC", secondaryRole: "SUPPORT", primaryPool: ["Jinx"], secondaryPool: ["Lulu", "Nautilus"], additionalRoles: [{ role: "MID", pool: ["Ahri"] }] });
    const updated = await updatePlayer(handle.db, p.id, { displayName: "Keep", primaryRole: "ADC", secondaryRole: "SUPPORT", primaryPool: ["Jinx", "Kaisa"], secondaryPool: ["Lulu", "Nautilus"] });
    expect(updated.secondaryPool).toEqual(["Lulu", "Nautilus"]);
    expect(updated.additionalRoles).toEqual([{ role: "MID", pool: ["Ahri"] }]);
  });
});
