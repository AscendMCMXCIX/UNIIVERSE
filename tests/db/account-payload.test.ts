import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  What leaves the server about linked Riot accounts and matches (docs/RIOT_COMPLIANCE.md: PUUIDs
  stay on the server): the browser view of an account and the answer of the link action carry no
  PUUID, only whether one is known; and the match-history actions refuse a caller who has not
  finished the temporary password and first-time setup, as every page does.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session, requireRiotAccountEditor: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { PUUID_KEPT_ON_SERVER, accountForBrowser, listAccountsForPlayer } from "@/server/accounts/repository";
import { addPlayerAccountAction } from "@/server/actions/accounts";
import { catchUpFiguresAction, getMatchDetailAction, getMatchGroupsAction, getMatchMeetingsAction, getMatchRanksAction, getMatchTimelineAction, refreshMatchesAction } from "@/server/actions/match-history";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

let handle: DbHandle;
let ace: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const player = (over: Partial<Session> = {}): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, ...over }) as Session;
const owner = (): Session => ({ ...base, role: "owner", playerId: null, teamMember: true }) as Session;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  const teamId = (await getOrCreateTeam(handle.db)).id;
  ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
  const [a] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "secret-puuid-ace", label: "main", syncStatus: "ok" }).returning({ id: riotAccounts.id });
  await handle.db.insert(accountMatches).values({ accountId: a!.id, matchId: "OC1_1", gameCreation: Date.now(), queueId: 420, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.21", gameDuration: 1800 });
  await handle.db.insert(matchDetails).values({ matchId: "OC1_1", gameCreation: Date.now(), gameDuration: 1800, teams: [], participants: [] });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("linked accounts in the browser", () => {
  it("the browser view keeps whether a PUUID is known, never the PUUID", async () => {
    const [stored] = await listAccountsForPlayer(handle.db, ace);
    expect(stored!.puuid).toBe("secret-puuid-ace");
    const view = accountForBrowser(stored!);
    expect(view.puuid).toBe(PUUID_KEPT_ON_SERVER);
    expect(JSON.stringify(view)).not.toContain("secret-puuid-ace");
    // Everything else the panel shows is unchanged.
    expect({ ...view, puuid: stored!.puuid }).toEqual(stored);
    expect(accountForBrowser({ ...stored!, puuid: null }).puuid).toBeNull();
  });

  it("the link action's answer carries no PUUID", async () => {
    state.session = owner();
    // Riot (a stand-in for its HTTP API) knows the Riot ID, so the account is linked with its PUUID
    // at once; its first sync finds no rank, mastery or games.
    const prev = { key: process.env.RIOT_API_KEY, fetch: globalThis.fetch };
    process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-000000000000";
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/by-riot-id/Second/OCE") || url.includes("/accounts/by-puuid/secret-puuid-second")) return json({ puuid: "secret-puuid-second", gameName: "Second", tagLine: "OCE" });
      if (url.includes("/region/by-game/lol/by-puuid/")) return json({ puuid: "secret-puuid-second", game: "lol", region: "oc1" });
      if (url.includes("/ids?") || url.includes("/lol/league/v4/entries/by-puuid/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
      return json({ status: { status_code: 404 } }, 404);
    }) as typeof fetch;
    try {
      const r = await addPlayerAccountAction(ace, { riotId: "Second#OCE" });
      expect(r).toMatchObject({ ok: true, data: { riotId: "Second#OCE", puuid: PUUID_KEPT_ON_SERVER } });
      expect(JSON.stringify(r)).not.toMatch(/secret-puuid/);
      // The PUUID is known, on the server only.
      const all = await listAccountsForPlayer(handle.db, ace);
      expect(all.find((a) => a.gameName === "Second")?.puuid).toBe("secret-puuid-second");
    } finally {
      globalThis.fetch = prev.fetch;
      if (prev.key === undefined) delete process.env.RIOT_API_KEY;
      else process.env.RIOT_API_KEY = prev.key;
    }
  });

  it("Users & Permissions hands the person view each linked account without its PUUID (R6 review SR6-SEC-1)", async () => {
    state.session = owner();
    const { default: AdminPeoplePage } = await import("@/app/(admin)/admin/people/page");
    const page = (await AdminPeoplePage({ searchParams: Promise.resolve({}) })) as { props: { children: { props: { players: Array<{ riotAccounts: Array<{ puuid: string | null }> }> } } } };
    const accounts = page.props.children.props.players.flatMap((p) => p.riotAccounts);
    expect(accounts.length).toBeGreaterThanOrEqual(2);
    expect(accounts.map((a) => a.puuid)).toEqual(accounts.map(() => PUUID_KEPT_ON_SERVER));
    expect(JSON.stringify(page.props.children.props)).not.toMatch(/secret-puuid/);
  });
});

describe("match-history actions and the first-time setup", () => {
  const pending = [player({ playerId: null, mustChangePassword: true }), player({ playerId: "22222222-2222-4222-8222-222222222222", setupComplete: false })];

  it.each(pending.map((s, i) => [i === 0 ? "a temporary password" : "setup not finished", s] as const))("refuses a caller with %s", async (_label, session) => {
    state.session = { ...session, capabilities: [...STANDARD_PLAYER, "view-teammate-stats"] };
    const answers = await Promise.all([
      getMatchDetailAction(ace, "OC1_1"),
      getMatchTimelineAction(ace, "OC1_1"),
      getMatchGroupsAction(ace, "OC1_1"),
      getMatchMeetingsAction(ace, "OC1_1", { season: 16, mode: "all", accountId: null }),
      getMatchRanksAction(ace, "OC1_1"),
      refreshMatchesAction(ace),
      catchUpFiguresAction(ace),
    ]);
    for (const a of answers) {
      expect(a).toMatchObject({ message: "Finish your first-time setup first." });
    }
  });

  it("still answers a member who has finished setup", async () => {
    state.session = player({ capabilities: [...STANDARD_PLAYER, "view-teammate-stats"] });
    const r = await getMatchDetailAction(ace, "OC1_1");
    expect((r as { message?: string }).message).not.toBe("Finish your first-time setup first.");
  });
});
