import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  D1 and D2 (final UX review): a match record's Riot link, the result/duration/date fetched with
  it, and its date must survive any later save of unrelated fields, in every order a browser can
  produce: link then save, save from a form loaded before the link, two editors at once, and with
  and without a Riot API key. The server actions are the real ones; only the session and the Riot
  client are faked.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown, riotKey: false }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<object>()),
  getSession: async () => state.session,
  requireTeamMember: async () => state.session,
}));
vi.mock("@/server/riot/api/client", async (orig) => ({
  ...(await orig<object>()),
  // With a "key", linking fetches this game: our side (blue) won in 31 minutes, created 18:04 UTC.
  createRiotClient: () =>
    state.riotKey
      ? {
          match: async () => ({
            info: {
              gameCreation: Date.UTC(2026, 9, 10, 18, 4),
              gameDuration: 31 * 60,
              gameVersion: "16.20.1",
              queueId: 440,
              teams: [
                { teamId: 100, win: true },
                { teamId: 200, win: false },
              ],
              participants: [],
            },
          }),
        }
      : null,
}));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, matches, riotAccounts, users, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getMatch, updateMatch, updateMatchIfUnchanged } from "@/server/matches/repository";
import { loadLinkSuggestions } from "@/server/matches/links";
import { linkRiotMatchAction, updateMatchAction } from "@/server/actions/matches";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { buildMatchPatch, formFromMatch, withEdit, type EditableMatch } from "@/domain/match-edit";

const MANAGER_ID = "22222222-2222-4222-8222-222222222222";
const manager: Session = { userId: MANAGER_ID, label: "Mgr", username: "mgr", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId: null, capabilities: [...STANDARD_PLAYER, "manage-matches"], teamMember: true };
const T0 = Date.UTC(2026, 9, 10, 18, 0); // the draft: 18:00 UTC = 05:00 AEDT on 11 Oct
const ROSTER = [
  ["Top", "TOP", "Ornn"],
  ["Jg", "JUNGLE", "Vi"],
  ["Mid", "MID", "Ahri"],
  ["Bot", "ADC", "Jinx"],
  ["Sup", "SUPPORT", "Nautilus"],
] as const;

let handle: DbHandle;
let teamId: string;
let assignments: Record<string, string>;
let picks: Array<{ playerId: string; role: string; championId: string; index: number }>;

async function newRecord(): Promise<string> {
  const [m] = await handle.db.insert(matches).values({ teamId, patch: "16.20", side: "blue", mode: "ranked-flex", lineupSnapshot: [], finalAssignments: assignments as never, ourPicks: picks as never, playedAt: new Date(T0) }).returning({ id: matches.id });
  return m!.id;
}

/** The record as the match page hands it to the editor (what a browser has loaded). */
async function load(id: string) {
  const m = (await getMatch(handle.db, id))!;
  const editable: EditableMatch = { result: m.result, durationSeconds: m.durationSeconds, riotMatchId: m.riotMatchId, notes: m.notes, vodUrl: m.vodUrl, playedAt: m.playedAt.toISOString(), eventName: m.eventName, opponentName: m.opponentName, enemyPlayers: m.enemyPlayers ?? {}, mode: m.mode };
  return { editable, version: m.updatedAt.toISOString() };
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  state.db = db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.insert(users).values({ id: MANAGER_ID, username: "mgr", displayName: "Mgr" });
  teamId = (await getOrCreateTeam(db)).id;
  const ids: Record<string, string> = {};
  const rows: Array<typeof accountMatches.$inferInsert> = [];
  for (const [name, role, champ] of ROSTER) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [champ] })).id;
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[name]!, gameName: name, tagLine: "T", platform: "oc1", puuid: `p-${name}`, label: name }).returning({ id: riotAccounts.id });
    rows.push({ accountId: a!.id, matchId: "OC1_100", gameCreation: T0 + 4 * 60_000, queueId: 440, championId: champ, role, win: true, patch: "16.20", gameDuration: 1900 });
    // A second game no test links, for the suggestion check (a game linked elsewhere is never suggested).
    rows.push({ accountId: a!.id, matchId: "OC1_200", gameCreation: T0 + 6 * 60_000, queueId: 440, championId: champ, role, win: true, patch: "16.20", gameDuration: 1900 });
  }
  await db.insert(accountMatches).values(rows);
  const part = (puuid: string, championId: string): MatchParticipantDetail => ({ puuid, name: null, teamId: 100, championId, championKey: 0, champLevel: 15, position: null, win: true, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });
  for (const [key, at] of [["OC1_100", T0 + 4 * 60_000], ["OC1_200", T0 + 6 * 60_000]] as const) {
    await db.insert(matchDetails).values({ matchId: key, gameCreation: at, gameDuration: 1900, teams: [], participants: ROSTER.map(([name, , champ]) => part(`p-${name}`, champ)) });
  }
  assignments = Object.fromEntries(ROSTER.map(([name, role]) => [role, ids[name]!]));
  picks = ROSTER.map(([name, role, champ], index) => ({ playerId: ids[name]!, role, championId: champ, index }));
}, 60_000);
afterAll(async () => {
  await handle.close();
});
beforeEach(() => {
  state.session = manager;
  state.riotKey = false;
});

describe("D1: a Riot link is never undone by saving other fields", () => {
  it("link, then save notes from the refreshed editor: the link stays", async () => {
    const id = await newRecord();
    expect((await linkRiotMatchAction(id, "OC1_100")).ok).toBe(true);
    const { editable, version } = await load(id);
    const patch = buildMatchPatch(withEdit({}, formFromMatch(editable, "UTC"), "notes", "Lost lane early."), editable, "UTC");
    expect(patch).toEqual({ notes: "Lost lane early." });
    expect((await updateMatchAction(id, patch, { expectedUpdatedAt: version })).ok).toBe(true);
    expect(await getMatch(handle.db, id)).toMatchObject({ riotMatchId: "OC1_100", notes: "Lost lane early.", playedAt: new Date(T0) });
  });

  it("a form loaded before the link is refused, changes nothing, and succeeds after reloading", async () => {
    const id = await newRecord();
    const before = await load(id); // the editor is open…
    expect((await linkRiotMatchAction(id, "OC1_100")).ok).toBe(true); // …the suggestion is linked
    const r = await updateMatchAction(id, { result: "win" }, { expectedUpdatedAt: before.version });
    expect(r).toMatchObject({ ok: false, stale: true });
    expect(await getMatch(handle.db, id)).toMatchObject({ riotMatchId: "OC1_100", result: null });
    const after = await load(id);
    expect((await updateMatchAction(id, { result: "win" }, { expectedUpdatedAt: after.version })).ok).toBe(true);
    expect(await getMatch(handle.db, id)).toMatchObject({ riotMatchId: "OC1_100", result: "win" });
  });

  it("even the old full-form payload cannot clear the link once the form is stale", async () => {
    const id = await newRecord();
    const before = await load(id);
    await linkRiotMatchAction(id, "OC1_100");
    const r = await updateMatchAction(id, { result: "win", riotMatchId: null, notes: "", durationSeconds: null }, { expectedUpdatedAt: before.version });
    expect(r.ok).toBe(false);
    expect((await getMatch(handle.db, id))!.riotMatchId).toBe("OC1_100");
  });

  it("with a Riot key: the fetched result, duration and time survive a later save of other fields", async () => {
    state.riotKey = true;
    const id = await newRecord();
    const before = await load(id);
    const linked = await linkRiotMatchAction(id, "OC1_100");
    expect(linked).toMatchObject({ ok: true, data: { fetched: true } });
    const fetched = { riotMatchId: "OC1_100", result: "win", durationSeconds: 31 * 60, playedAt: new Date(Date.UTC(2026, 9, 10, 18, 4)) };
    expect(await getMatch(handle.db, id)).toMatchObject(fetched);
    // The editor opened before the link must not write its blank result and duration back.
    expect((await updateMatchAction(id, { result: null, durationSeconds: null, opponentName: "Team Example" }, { expectedUpdatedAt: before.version })).ok).toBe(false);
    // Reloaded, the person edits the opponent only.
    const { editable, version } = await load(id);
    const patch = buildMatchPatch(withEdit({}, formFromMatch(editable, "Australia/Sydney"), "opponentName", "Team Example"), editable, "Australia/Sydney");
    expect((await updateMatchAction(id, patch, { expectedUpdatedAt: version })).ok).toBe(true);
    expect(await getMatch(handle.db, id)).toMatchObject({ ...fetched, opponentName: "Team Example" });
  });

  it("two editors open at once: the second save is refused instead of overwriting the first", async () => {
    const id = await newRecord();
    const a = await load(id);
    const b = await load(id);
    expect((await updateMatchAction(id, { notes: "From A" }, { expectedUpdatedAt: a.version })).ok).toBe(true);
    expect((await updateMatchAction(id, { notes: "From B" }, { expectedUpdatedAt: b.version })).ok).toBe(false);
    expect((await getMatch(handle.db, id))!.notes).toBe("From A");
    // B reloads, sees A's note, and saves deliberately.
    const b2 = await load(id);
    expect(b2.editable.notes).toBe("From A");
    expect((await updateMatchAction(id, { notes: "From B" }, { expectedUpdatedAt: b2.version })).ok).toBe(true);
  });

  it("clearing the Riot ID on purpose still unlinks (an intentional change is honoured)", async () => {
    const id = await newRecord();
    await linkRiotMatchAction(id, "OC1_100");
    const { editable, version } = await load(id);
    const patch = buildMatchPatch(withEdit({}, formFromMatch(editable, "UTC"), "riotMatchId", ""), editable, "UTC");
    expect(patch).toEqual({ riotMatchId: null });
    expect((await updateMatchAction(id, patch, { expectedUpdatedAt: version })).ok).toBe(true);
    expect((await getMatch(handle.db, id))!.riotMatchId).toBeNull();
  });

  it("every write gives a new version, even two in the same millisecond", async () => {
    const id = await newRecord();
    const v0 = (await getMatch(handle.db, id))!.updatedAt;
    await Promise.all([updateMatch(handle.db, id, { notes: "1" }), updateMatch(handle.db, id, { vodUrl: "https://example.org" })]);
    const v1 = (await getMatch(handle.db, id))!.updatedAt;
    expect(v1.getTime()).toBeGreaterThanOrEqual(v0.getTime() + 2);
    expect(await updateMatchIfUnchanged(handle.db, id, { notes: "stale" }, v0)).toBe(false);
    expect(await updateMatchIfUnchanged(handle.db, id, { notes: "fresh" }, v1)).toBe(true);
  });

  it("the permission check still applies: a player who does not control the record cannot save", async () => {
    const id = await newRecord();
    state.session = { ...manager, capabilities: STANDARD_PLAYER };
    const { version } = await load(id);
    expect((await updateMatchAction(id, { notes: "x" }, { expectedUpdatedAt: version })).ok).toBe(false);
    expect((await linkRiotMatchAction(id, "OC1_100")).ok).toBe(false);
  });
});

describe("D2: saving does not move the match's time", () => {
  it("saving result and notes keeps played_at to the millisecond, so the Riot suggestion stays", async () => {
    const id = await newRecord();
    const { editable, version } = await load(id);
    let edits = withEdit({}, formFromMatch(editable, "Australia/Sydney"), "result", "win");
    edits = withEdit(edits, formFromMatch(editable, "Australia/Sydney"), "notes", "GG");
    expect((await updateMatchAction(id, buildMatchPatch(edits, editable, "Australia/Sydney"), { expectedUpdatedAt: version })).ok).toBe(true);
    const m = (await getMatch(handle.db, id))!;
    expect(m.playedAt.getTime()).toBe(T0);
    expect((await loadLinkSuggestions(handle.db, m)).map((s) => s.matchId)).toContain("OC1_200");
  });

  it("an intentional date change in Sydney keeps the local time of day", async () => {
    const id = await newRecord();
    const { editable, version } = await load(id);
    const server = formFromMatch(editable, "Australia/Sydney");
    expect(server.playedOn).toBe("2026-10-11"); // 05:00 AEDT on 11 Oct (UTC date is 10 Oct)
    const patch = buildMatchPatch(withEdit({}, server, "playedOn", "2026-10-12"), editable, "Australia/Sydney");
    expect((await updateMatchAction(id, patch, { expectedUpdatedAt: version })).ok).toBe(true);
    expect((await getMatch(handle.db, id))!.playedAt.toISOString()).toBe(new Date(T0 + 86_400_000).toISOString());
  });

  it("records that are never edited are never touched", async () => {
    const id = await newRecord();
    const before = (await getMatch(handle.db, id))!;
    await load(id);
    const after = (await getMatch(handle.db, id))!;
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.playedAt.getTime()).toBe(T0);
  });
});
