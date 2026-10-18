import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Patterns & Notes: notes are stored per player with the ranked profile and only ever written for
  the signed-in player (the owner comes from the session, never from the request); patterns come
  from the player's own stored Ranked games only (Normal games and other players' games never
  count). Synthetic accounts and games; no Riot request.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session }));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getRankedProfile, NOTES_MAX } from "@/server/ranked/repository";
import { saveRankedFocusAction } from "@/server/actions/ranked";
import { loadOwnPatterns } from "@/server/players/patterns";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let ace: string;
let bea: string;
const session = (playerId: string) => ({ userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId, capabilities: STANDARD_PLAYER, teamMember: true }) as Session;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
  bea = (await createPlayer(handle.db, teamId, { displayName: "Bea", primaryRole: "TOP", primaryPool: [] })).id;
  const [a] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace", label: "ace" }).returning({ id: riotAccounts.id });
  const [b] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: bea, gameName: "bea", tagLine: "T", platform: "oc1", puuid: "p-bea", label: "bea" }).returning({ id: riotAccounts.id });
  const now = Date.UTC(2026, 9, 18);
  const row = (accountId: string, i: number, queueId: number, cs: number) => ({ accountId, matchId: `OC1_${accountId.slice(0, 4)}_${queueId}_${i}`, gameCreation: now - i * 3_600_000, queueId, championId: "Ahri", role: "MID", win: i % 2 === 0, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 5, deaths: 4, assists: 6, cs, damage: 21000, visionScore: 20 });
  await handle.db.insert(accountMatches).values([
    // Ace: 20 recent Ranked games at 8 CS/min, 40 earlier at 7; Normal games at 12 CS/min in between never count.
    ...Array.from({ length: 20 }, (_, i) => row(a!.id, i, i % 2 ? 440 : 420, 240)),
    ...Array.from({ length: 10 }, (_, i) => row(a!.id, 20 + i, 400, 360)),
    ...Array.from({ length: 40 }, (_, i) => row(a!.id, 30 + i, 420, 210)),
    // Bea's games are hers alone.
    ...Array.from({ length: 30 }, (_, i) => row(b!.id, i, 420, 300)),
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Patterns & Notes", () => {
  it("saves notes for the signed-in player only, line breaks kept, length limited", async () => {
    state.session = session(ace);
    expect((await getRankedProfile(handle.db, ace)).notes).toBe("");
    const r = await saveRankedFocusAction({ notes: "Ward before the second back.\nTrade around cooldowns." });
    expect(r).toMatchObject({ ok: true, data: { notes: "Ward before the second back.\nTrade around cooldowns." } });
    // Bea's notes are untouched, and saving them never reaches Ace's.
    expect((await getRankedProfile(handle.db, bea)).notes).toBe("");
    state.session = session(bea);
    await saveRankedFocusAction({ notes: "Mine." });
    expect((await getRankedProfile(handle.db, ace)).notes).toBe("Ward before the second back.\nTrade around cooldowns.");
    expect((await getRankedProfile(handle.db, bea)).notes).toBe("Mine.");
    // Notes do not disturb the focus saved beside them.
    await saveRankedFocusAction({ focus: "Roam after first back." });
    expect(await getRankedProfile(handle.db, bea)).toMatchObject({ notes: "Mine.", focus: "Roam after first back." });
    await saveRankedFocusAction({ notes: "x".repeat(NOTES_MAX + 50) });
    expect((await getRankedProfile(handle.db, bea)).notes).toHaveLength(NOTES_MAX);
    // No session, or no player profile: nothing is saved.
    state.session = null;
    expect((await saveRankedFocusAction({ notes: "nobody" })).ok).toBe(false);
  });

  it("reads patterns from the player's own Ranked games only", async () => {
    const p = await loadOwnPatterns(handle.db, ace);
    expect(p.recent).toMatchObject({ games: 20 });
    expect(p.before).toMatchObject({ games: 40 });
    expect(p.figures.find((f) => f.key === "cs")).toMatchObject({ recent: { value: 8, games: 20 }, before: { value: 7, games: 40 }, direction: "higher" });
    // Bea has 30 games: 20 recent and only 10 before, enough for figures; her CS is her own.
    const q = await loadOwnPatterns(handle.db, bea);
    expect(q.figures.find((f) => f.key === "cs")).toMatchObject({ recent: { value: 10 }, before: { value: 10, games: 10 }, direction: "same" });
  });
});
