import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Matchup Intel's curation priorities (Admin → Data & Integrations, curation.ts): the team's pool
  cells per role, ranked by the members' games on that champion in that role; team members only (no
  personal-use or archived profile, as the evidence rules count); champion names and counts only;
  and the page that shows them refuses an account without Admin's data access.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>() }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.14" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { accountMatches, champions, players, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { curationPriorities, CURATION_ROLE_ORDER } from "@/server/matchup-intel/curation";
import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import AdminDataPage from "@/app/(admin)/admin/data/page";

let handle: DbHandle;
let n = 0;

async function account(playerId: string) {
  const puuid = `curation-${n++}`;
  const [row] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: puuid, tagLine: "TEST", platform: "oc1", puuid, label: "main" }).returning({ id: riotAccounts.id });
  return row!.id;
}
async function games(accountId: string, role: string, championId: string, count: number, game: { win?: boolean | null; gameDuration?: number; tag?: string } = {}) {
  const { win = true, gameDuration = 1800, tag = "" } = game;
  await handle.db.insert(accountMatches).values(Array.from({ length: count }, (_, i) => ({ accountId, matchId: `OC1_${accountId.slice(0, 8)}_${role}_${championId}${tag}_${i}`, gameCreation: 1_700_000_000_000 + i, queueId: 420, championId, role, win, gameDuration })));
}

const saved = { auth: process.env.UNIIVERSE_REQUIRE_AUTH, url: process.env.DATABASE_URL, secret: process.env.UNIIVERSE_AUTH_SECRET };

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  handle = await testDb();
  state.db = handle.db;
  const ids: Array<[string, number]> = [["Viego", 234], ["Lillia", 876], ["Ahri", 103], ["Riven", 92], ["Thresh", 412], ["Jinx", 222]];
  await handle.db.insert(champions).values(ids.map(([id, key]) => ({ id, key, name: id, imageFull: `${id}.png`, firstSeenVersion: "16.20.1", lastSeenVersion: "16.22.1" }))).onConflictDoNothing();
  const teamId = (await getOrCreateTeam(handle.db)).id;
  // Two members: a jungler with Viego and Lillia, a mid with Ahri (secondary role JUNGLE, Lillia again: one cell).
  const jungler = (await createPlayer(handle.db, teamId, { displayName: "Jungler", primaryRole: "JUNGLE", primaryPool: ["Viego", "Lillia"] })).id;
  const mid = (await createPlayer(handle.db, teamId, { displayName: "Mid", primaryRole: "MID", primaryPool: ["Ahri"], secondaryRole: "JUNGLE", secondaryPool: ["Lillia"], additionalRoles: [{ role: "TOP", pool: ["Riven"] }] })).id;
  // A personal-use profile and an archived one: their pools and games count for nothing.
  const solo = (await createPlayer(handle.db, teamId, { displayName: "Solo", primaryRole: "SUPPORT", primaryPool: ["Thresh"] })).id;
  await handle.db.update(players).set({ teamMember: false }).where(eq(players.id, solo));
  const gone = (await createPlayer(handle.db, teamId, { displayName: "Gone", primaryRole: "ADC", primaryPool: ["Jinx"] })).id;
  await handle.db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, gone));
  const j = await account(jungler);
  const m = await account(mid);
  await games(j, "JUNGLE", "Viego", 3);
  await games(j, "JUNGLE", "Lillia", 1);
  // Remakes (under 5 minutes) and games with no known result count as the evidence counts them: not at all.
  await games(j, "JUNGLE", "Viego", 6, { gameDuration: 200, tag: "remake" });
  await games(j, "JUNGLE", "Viego", 6, { win: null, tag: "unknown" });
  await games(m, "JUNGLE", "Lillia", 4);
  // Ahri played in another role is not Ahri mid.
  await games(m, "MID", "Ahri", 2);
  await games(m, "TOP", "Ahri", 9);
  await games(await account(solo), "JUNGLE", "Viego", 50);
  await games(await account(gone), "ADC", "Jinx", 7);
}, 60_000);
afterAll(async () => {
  await handle.close();
  for (const [k, v] of [["UNIIVERSE_REQUIRE_AUTH", saved.auth], ["DATABASE_URL", saved.url], ["UNIIVERSE_AUTH_SECRET", saved.secret]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("Matchup Intel's curation priorities", () => {
  it("ranks each role's pool cells by the members' games in that role, Jungle, Mid, ADC and Support first", async () => {
    const roles = await curationPriorities(handle.db);
    expect(roles.map((r) => r.role)).toEqual([...CURATION_ROLE_ORDER]);
    expect(CURATION_ROLE_ORDER[CURATION_ROLE_ORDER.length - 1]).toBe("TOP");
    const by = Object.fromEntries(roles.map((r) => [r.role, r.cells.map((c) => [c.championId, c.games])]));
    // Lillia: one cell from two pools, 1 + 4 games; ahead of Viego's 3 (the personal-use profile's 50, and the remakes and unknown results, left out).
    expect(by.JUNGLE).toEqual([["Lillia", 5], ["Viego", 3]]);
    expect(by.MID).toEqual([["Ahri", 2]]);
    // The personal-use profile's Thresh and the archived profile's Jinx are no cells.
    expect(by.SUPPORT).toEqual([]);
    expect(by.ADC).toEqual([]);
    // Riven top: checked notes and curated pairs; no games yet.
    const riven = roles.find((r) => r.role === "TOP")!.cells[0]!;
    expect(riven).toMatchObject({ championId: "Riven", games: 0, checkedNotes: true });
    expect(riven.curatedPairs).toBeGreaterThan(0);
    expect(roles.find((r) => r.role === "JUNGLE")!.cells.every((c) => !c.checkedNotes)).toBe(true);
    // Champion names and counts only: nothing names whose pool a cell came from.
    expect(JSON.stringify(roles)).not.toMatch(/Jungler|"Mid"|Solo|Gone|curation-|puuid|playerId/);
  });

  it("is on a page that refuses an account without Admin's data access", async () => {
    await registerAccount(handle.db, { username: "Founder", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Founder#OCE", platform: "oc1" }, primaryRole: "MID" });
    const member = await registerAccount(handle.db, { username: "Member", password: "Member-pass-123", role: "player", primaryRiot: { riotId: "Member#OCE", platform: "oc1" }, primaryRole: "TOP" });
    const { token } = await createSession(handle.db, member.id);
    state.cookies.set(SESSION_COOKIE, token);
    await expect(AdminDataPage()).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\/no-access/) });
  });
});
