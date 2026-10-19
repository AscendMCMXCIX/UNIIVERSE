import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { applyLineupPreset, createPlayer, deleteLineupPreset, getCurrentLineup, getOrCreateTeam, listLineupPresets, saveCurrentLineupAs, setLineup, setLineupSlot } from "@/server/repositories/team";
import { getBranding, saveBranding } from "@/server/repositories/branding";
import { DEFAULT_BRANDING } from "@/domain/branding";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};

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
  for (const [name, role, pool] of specs) ids[name] = (await createPlayer(handle.db, team.id, { displayName: name, primaryRole: role, primaryPool: [...pool] })).id;
  await setLineup(handle.db, team.id, { TOP: ids.Top, JUNGLE: ids.Jg, MID: ids.Mid, ADC: ids.Adc, SUPPORT: ids.Sup });
});
afterAll(async () => {
  await handle.close();
});

describe("saved lineups", () => {
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
});

describe("branding storage", () => {
  it("round-trips validated branding through app settings", async () => {
    expect((await getBranding(handle.db)).shortName).toBe(DEFAULT_BRANDING.shortName);
    await saveBranding(handle.db, { teamName: "Team Rocket", shortName: "rocket", accent: "#ff8800", logoDataUrl: "not-an-image" });
    const b = await getBranding(handle.db);
    expect(b).toMatchObject({ teamName: "Team Rocket", shortName: "ROCKET", accent: "#ff8800", assets: { logo: null, background: null, appBackground: null } });
    // Images are never stored inline in the settings any more.
    expect(b).not.toHaveProperty("logoDataUrl");
  });
});
