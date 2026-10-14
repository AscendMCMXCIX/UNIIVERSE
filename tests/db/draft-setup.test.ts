import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";

/* Draft setup: the lineup step, enemy Riot IDs kept from setup (and reused per series), drafts to continue. */

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getActiveLineupProfiles, getOrCreateTeam, getPlayer, patchPlayerProfile, setLineup, setLineupSlot } from "@/server/repositories/team";
import { getTeamRoster } from "@/server/team/roster";
import { createDraft, getDraft, lastSeriesEnemyPlayers, listResumableDrafts, updateDraftMeta } from "@/server/repositories/drafts";
import { createSeries } from "@/server/series/repository";
import { getSetupLineup } from "@/server/team/setup-lineup";
import { enemyNameList } from "@/domain/scouting/enemy-slots";
import * as draftActions from "@/server/actions/drafts";

let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};

async function newDraft(opts: { seriesId?: string | null; gameNumber?: number; enemyPlayers?: Record<string, string> } = {}) {
  const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
  return createDraft(handle.db, teamId, { opponentName: "", side: "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "scrim", seriesId: opts.seriesId ?? null, gameNumber: opts.gameNumber ?? 1, enemyPlayers: opts.enemyPlayers ?? {} });
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  teamId = team.id;
  const specs = [
    ["Top", "TOP", ["Gwen", "Jax"], null],
    ["Jg", "JUNGLE", ["Viego", "Vi"], null],
    ["Mid", "MID", [], "TOP"],
    ["Adc", "ADC", ["Jinx", "Kaisa"], null],
    ["Sup", "SUPPORT", ["Nautilus", "Lulu"], null],
  ] as const;
  const slots: Record<string, string> = {};
  for (const [name, role, pool, secondary] of specs) {
    const p = await createPlayer(handle.db, team.id, { displayName: name, primaryRole: role, secondaryRole: secondary, primaryPool: [...pool], secondaryPool: secondary ? ["Ornn"] : [] }, team.poolLimits);
    slots[role] = p.id;
    ids[name] = p.id;
  }
  await setLineup(handle.db, team.id, slots);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("draft setup", () => {
  it("shows the active five with role fit and pool size, and who may take each slot", async () => {
    const { slots, complete } = await getSetupLineup(handle.db, teamId);
    expect(complete).toBe(true);
    expect(slots.map((s) => s.role)).toEqual(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);
    const mid = slots.find((s) => s.role === "MID")!;
    // An empty pool is surfaced so setup can warn before the draft starts.
    expect(mid.player).toMatchObject({ name: "Mid", fit: "primary", poolSize: 0 });
    // Candidates are players whose roles include the slot: the Mid player also lists Top as secondary.
    const top = slots.find((s) => s.role === "TOP")!;
    expect(top.candidates.map((c) => c.name)).toEqual(["Top", "Mid"]);
    expect(top.candidates.find((c) => c.name === "Mid")!.fit).toBe("secondary");
  });

  it("reports an incomplete lineup", async () => {
    await setLineupSlot(handle.db, teamId, "SUPPORT", null);
    const { slots, complete } = await getSetupLineup(handle.db, teamId);
    expect(complete).toBe(false);
    expect(slots.find((s) => s.role === "SUPPORT")!.player).toBeNull();
    await setLineupSlot(handle.db, teamId, "SUPPORT", ids.Sup!);
  });

  it("keeps the enemy Riot IDs entered at setup on the draft, and offers them again for the next game of a series", async () => {
    const series = await createSeries(handle.db, teamId, { mode: "scrim", bestOf: 3, eventName: "", opponentName: "Rivals", createdByUserId: null });
    const game1 = await newDraft({ seriesId: series.id, enemyPlayers: { TOP: "Foe#EUW", MID: "Other#NA1" } });
    expect((await getDraft(handle.db, game1.id))!.enemyPlayers).toEqual({ TOP: "Foe#EUW", MID: "Other#NA1" });
    expect(enemyNameList(await lastSeriesEnemyPlayers(handle.db, series.id))).toEqual(["Foe#EUW", "Other#NA1"]);
    // A later game's names replace the earlier ones.
    await newDraft({ seriesId: series.id, gameNumber: 2, enemyPlayers: { ADC: "Third#KR" } });
    expect(enemyNameList(await lastSeriesEnemyPlayers(handle.db, series.id))).toEqual(["Third#KR"]);
  });

  it("has no way to edit enemy players once the draft has started", () => {
    expect("setEnemyPlayersAction" in draftActions).toBe(false);
  });

  it("offers unfinished recent drafts to continue, never completed or abandoned ones", async () => {
    const open = await newDraft();
    const abandoned = await newDraft();
    await updateDraftMeta(handle.db, abandoned.id, { status: "abandoned" });
    const resumable = await listResumableDrafts(handle.db, teamId, { limit: 10 });
    expect(resumable.map((d) => d.id)).toContain(open.id);
    expect(resumable.map((d) => d.id)).not.toContain(abandoned.id);
    expect(resumable.every((d) => d.status === "in_progress")).toBe(true);
    // Outside the window nothing is offered.
    expect(await listResumableDrafts(handle.db, teamId, { windowMs: -1 })).toEqual([]);
  });

  it("shows a pool edit everywhere at once: Team, Players and the draft", async () => {
    const team = await getOrCreateTeam(handle.db);
    const before = (await getPlayer(handle.db, ids.Mid!))!;
    const saved = await patchPlayerProfile(handle.db, ids.Mid!, { primaryPool: ["Orianna", "Azir"] }, team.poolLimits);
    expect(saved.ok).toBe(true);
    // Players / profile read the player record.
    expect((await getPlayer(handle.db, ids.Mid!))!.primaryPool).toEqual(["Orianna", "Azir"]);
    // Team roster card for Mid lists the new champions in order.
    const roster = await getTeamRoster(handle.db, teamId);
    expect(roster.slots.find((s) => s.role === "MID")!.champions.map((c) => c.championId)).toEqual(["Orianna", "Azir"]);
    // Draft setup no longer warns about an empty pool, and a new draft carries the pool.
    expect((await getSetupLineup(handle.db, teamId)).slots.find((s) => s.role === "MID")!.player!.poolSize).toBe(2);
    const draft = await newDraft();
    expect(draft.lineup.find((p) => p.id === ids.Mid)!.primaryPool).toEqual(["Orianna", "Azir"]);
    expect(before.primaryPool).toEqual([]);
  });
});
