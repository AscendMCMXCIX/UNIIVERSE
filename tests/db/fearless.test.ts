import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getActiveLineupProfiles, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { appendDraftAction, createDraft, getDraft, removeLastDraftAction, toDraftState, type DraftRecord } from "@/server/repositories/drafts";
import { createSeries } from "@/server/series/repository";
import { abandonDraft } from "@/server/drafts/unfinished";
import { recommendForDraft } from "@/server/engine/service";
import { applyAction, deriveDraft } from "@/domain/draft";

let handle: DbHandle;
let teamId: string;

async function newGame(seriesId: string | null, gameNumber: number): Promise<DraftRecord> {
  const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
  return createDraft(handle.db, teamId, { opponentName: "Rivals", side: "blue", patch: "0.0", players: lineup.players, assignment: lineup.assignment, mode: "tournament", seriesId, gameNumber });
}

/** Enters a whole game: our picks from the given champions per role, enemy picks and all bans from the lists. */
async function play(draft: DraftRecord, ours: Record<string, string>, enemyPicks: string[], bans: string[]) {
  let state = toDraftState(draft);
  const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
  let r = 0;
  const e = [...enemyPicks];
  const b = [...bans];
  while (deriveDraft(state).nextStep) {
    const step = deriveDraft(state).nextStep!;
    const input = step.type === "ban" ? { championId: b.shift()! } : step.side === state.side ? { championId: ours[roles[r]!]!, role: roles[r++]! } : { championId: e.shift()! };
    const res = applyAction(state, input);
    if (!res.ok) throw new Error(`${input.championId}: ${res.error}`);
    await appendDraftAction(handle.db, draft.id, res.state.actions[res.state.actions.length - 1]!, state.side, null, deriveDraft(state).steps);
    state = res.state;
  }
}

const GAME1_OURS = { TOP: "Gwen", JUNGLE: "Viego", MID: "Ahri", ADC: "Jinx", SUPPORT: "Nautilus" };
const GAME1_ENEMY = ["Ornn", "Sejuani", "Orianna", "Kaisa", "Leona"];
const GAME1_BANS = ["Aatrox", "Akali", "Ambessa", "Azir", "Bard", "Brand", "Braum", "Briar", "Camille", "Corki"];

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  const specs = [
    ["Top", "TOP", ["Gwen", "Jax", "Riven"]],
    ["Jg", "JUNGLE", ["Viego", "Vi", "LeeSin"]],
    ["Mid", "MID", ["Ahri", "Syndra", "Galio"]],
    ["Adc", "ADC", ["Jinx", "Ezreal", "Xayah"]],
    ["Sup", "SUPPORT", ["Nautilus", "Rakan", "Thresh"]],
  ] as const;
  const slots: Record<string, string> = {};
  for (const [name, role, pool] of specs) slots[role] = (await createPlayer(handle.db, teamId, { displayName: name, primaryRole: role, primaryPool: [...pool] })).id;
  await setLineup(handle.db, teamId, slots);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Fearless draft", () => {
  it("game 1 starts normally; game 2 locks both teams' game-1 picks but not game-1 bans", async () => {
    const s = await createSeries(handle.db, teamId, { mode: "tournament", bestOf: 3, draftRules: "fearless" });
    expect(s.draftRules).toBe("fearless");
    const g1 = await newGame(s.id, 1);
    expect(g1.fearless).toMatchObject({ enabled: true, locks: [] });
    await play(g1, GAME1_OURS, GAME1_ENEMY, GAME1_BANS);
    const g2 = await newGame(s.id, 2);
    const locked = g2.fearless.locks.map((l) => l.championId).sort();
    expect(locked).toEqual([...Object.values(GAME1_OURS), ...GAME1_ENEMY].sort());
    // Earlier bans do not carry over.
    for (const b of GAME1_BANS) expect(locked).not.toContain(b);
    // Locked champions cannot be picked (by us or them) or banned; this game's own bans still apply.
    const state = toDraftState(g2);
    expect(applyAction(state, { championId: "Gwen" }).ok).toBe(false);
    expect(applyAction(state, { championId: "Ornn" }).ok).toBe(false);
    expect(applyAction(state, { championId: "Aatrox" }).ok).toBe(true);
    // The engine never recommends a locked champion.
    const rec = await recommendForDraft(handle.db, g2);
    const ids = JSON.stringify(rec);
    for (const c of locked) expect(rec.candidates?.some((x) => x.championId === c) ?? false).toBe(false);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("keeps earlier picks locked through game 3 and follows corrections to earlier games", async () => {
    const s = await createSeries(handle.db, teamId, { mode: "tournament", bestOf: 5, draftRules: "fearless" });
    const g1 = await newGame(s.id, 1);
    await play(g1, GAME1_OURS, GAME1_ENEMY, GAME1_BANS);
    const g2 = await newGame(s.id, 2);
    await play(g2, { TOP: "Jax", JUNGLE: "Vi", MID: "Syndra", ADC: "Ezreal", SUPPORT: "Rakan" }, ["Sion", "Nidalee", "Lissandra", "Varus", "Lulu"], GAME1_BANS);
    const g3 = await newGame(s.id, 3);
    expect(g3.fearless.locks).toHaveLength(20);
    expect(g3.fearless.locks.find((l) => l.championId === "Gwen")?.gameNumber).toBe(1);
    expect(g3.fearless.locks.find((l) => l.championId === "Jax")?.gameNumber).toBe(2);
    // Correcting game 2 (its last pick undone) frees that champion for game 3 at once.
    await removeLastDraftAction(handle.db, g2.id);
    const again = (await getDraft(handle.db, g3.id))!;
    expect(again.fearless.locks).toHaveLength(19);
    // Abandoning game 1 removes its locks too: only game 2's nine remaining picks stay locked.
    await abandonDraft(handle.db, g1.id);
    expect((await getDraft(handle.db, g3.id))!.fearless.locks).toHaveLength(9);
  });

  it("puts Fearless locks in the unavailable set every recommendation path uses (picks, bans, emergency picks)", async () => {
    const s = await createSeries(handle.db, teamId, { mode: "tournament", bestOf: 3, draftRules: "fearless" });
    const g1 = await newGame(s.id, 1);
    await play(g1, GAME1_OURS, GAME1_ENEMY, GAME1_BANS);
    const g2 = (await newGame(s.id, 2))!;
    const unavailable = deriveDraft(toDraftState(g2)).unavailableChampionIds;
    for (const c of Object.values(GAME1_OURS)) expect(unavailable.has(c)).toBe(true);
  });

  it("never applies to standard series or other series", async () => {
    const standard = await createSeries(handle.db, teamId, { mode: "tournament", bestOf: 3, draftRules: "standard" });
    const s1 = await newGame(standard.id, 1);
    await play(s1, GAME1_OURS, GAME1_ENEMY, GAME1_BANS);
    expect((await newGame(standard.id, 2)).fearless).toMatchObject({ enabled: false, locks: [] });
    // A fresh Fearless series starts clean even though other series used these champions.
    const other = await createSeries(handle.db, teamId, { mode: "tournament", bestOf: 3, draftRules: "fearless" });
    expect((await newGame(other.id, 1)).fearless.locks).toEqual([]);
    // A single game cannot be Fearless.
    const bo1 = await createSeries(handle.db, teamId, { mode: "tournament", bestOf: 1, draftRules: "fearless" });
    expect(bo1.draftRules).toBe("standard");
  });
});
