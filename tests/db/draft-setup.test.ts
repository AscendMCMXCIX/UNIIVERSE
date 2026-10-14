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
import { appendDraftAction, createDraft, getDraft, lastSeriesEnemyPlayers, toDraftState } from "@/server/repositories/drafts";
import { createSeries, getSeries, nextGameNumber } from "@/server/series/repository";
import { abandonDraft, deleteUnfinishedDraft, listUnfinishedDrafts } from "@/server/drafts/unfinished";
import { applyAction, deriveDraft } from "@/domain/draft";
import { canControlDraft } from "@/server/auth/permissions";
import { matches } from "@/server/db/schema";
import { eq } from "drizzle-orm";
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
    const p = await createPlayer(handle.db, team.id, { displayName: name, primaryRole: role, secondaryRole: secondary, primaryPool: [...pool], secondaryPool: secondary ? ["Ornn"] : [] });
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

  it("lists every unfinished draft for action, never completed or abandoned ones", async () => {
    const open = await newDraft();
    const abandoned = await newDraft();
    await abandonDraft(handle.db, abandoned.id);
    const list = await listUnfinishedDrafts(handle.db, teamId, 50);
    expect(list.map((d) => d.id)).toContain(open.id);
    expect(list.map((d) => d.id)).not.toContain(abandoned.id);
    expect(list.find((d) => d.id === open.id)).toMatchObject({ progress: 0, steps: 20 });
    expect((await getDraft(handle.db, abandoned.id))!.status).toBe("abandoned");
  });

  it("repairs a draft stuck with every action entered but never marked complete, and archives it as a match", async () => {
    const draft = await newDraft();
    // Enter all twenty actions directly (as if the completion step had failed afterwards).
    let state = toDraftState(draft);
    const pool = ["Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Annie", "Aphelios", "Ashe", "Azir", "Bard", "Brand", "Braum", "Briar"];
    const ours = { TOP: "Gwen", JUNGLE: "Viego", MID: "Ornn", ADC: "Jinx", SUPPORT: "Nautilus" } as const;
    const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
    let r = 0;
    while (deriveDraft(state).nextStep) {
      const step = deriveDraft(state).nextStep!;
      const input = step.type === "pick" && step.side === state.side ? { championId: ours[roles[r]!], role: roles[r++]! } : { championId: pool.shift()! };
      const res = applyAction(state, input);
      if (!res.ok) throw new Error(res.error);
      const action = res.state.actions[res.state.actions.length - 1]!;
      await appendDraftAction(handle.db, draft.id, action, state.side, null, deriveDraft(state).steps);
      state = res.state;
    }
    expect((await getDraft(handle.db, draft.id))!.status).toBe("in_progress");
    const list = await listUnfinishedDrafts(handle.db, teamId, 50);
    expect(list.map((d) => d.id)).not.toContain(draft.id);
    expect((await getDraft(handle.db, draft.id))!.status).toBe("completed");
    const [match] = await handle.db.select().from(matches).where(eq(matches.draftId, draft.id));
    expect(match).toBeDefined();
    // A finished draft with a match is history: it cannot be deleted from the Draft page.
    await expect(deleteUnfinishedDraft(handle.db, draft.id)).rejects.toThrow(/Matches/);
  });

  it("deletes unfinished drafts safely and keeps the series consistent", async () => {
    const series = await createSeries(handle.db, teamId, { mode: "scrim", bestOf: 3 });
    const g1 = await newDraft({ seriesId: series.id, gameNumber: 1 });
    const g2 = await newDraft({ seriesId: series.id, gameNumber: 2 });
    expect((await getSeries(handle.db, series.id))!.gamesStarted).toBe(2);
    // Abandoning game 2 frees its slot: the next game is number 2 again.
    await abandonDraft(handle.db, g2.id);
    expect((await getSeries(handle.db, series.id))!.gamesStarted).toBe(1);
    expect(await nextGameNumber(handle.db, series.id)).toBe(2);
    await deleteUnfinishedDraft(handle.db, g2.id);
    expect(await getDraft(handle.db, g2.id)).toBeNull();
    expect(await getDraft(handle.db, g1.id)).not.toBeNull();
    expect((await getSeries(handle.db, series.id))!.gamesStarted).toBe(1);
  });

  it("lets only the creator or an admin manage a draft", () => {
    const draft = { createdByUserId: "user-a" };
    expect(canControlDraft({ userId: "user-a", role: "player", permissions: [] } as never, draft)).toBe(true);
    expect(canControlDraft({ userId: "user-b", role: "player", permissions: [] } as never, draft)).toBe(false);
  });

  it("shows a pool edit everywhere at once: Team, Players and the draft", async () => {
    const before = (await getPlayer(handle.db, ids.Mid!))!;
    const saved = await patchPlayerProfile(handle.db, ids.Mid!, { primaryPool: ["Orianna", "Azir"] });
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
