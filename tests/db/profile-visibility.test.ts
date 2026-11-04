import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Two owner decisions (4 Nov 2026), through the real pages, components and server actions, signed
  in with a real session cookie (Next.js plumbing replaced by small fakes, as in auth-actions):

  1. A teammate's rank is a statistic. Without "view teammates' statistics" a viewer receives no
     tier, division, LP, queue or ranked record of another player: not in the profile header's
     identity (every /players/[id] tab), not in the Riot Accounts tab's accounts. Left out, never
     sent as "Unranked". One's own always; Standard viewers as before.
  2. A personal-use profile (players.team_member false) opens only for its own player and
     administrators. A member, a Restricted Player and a Player Manager are answered "not found"
     by the layout and every tab page, and refused by the actions that read or change the player.
     The match scoreboard names and links current team members only (taken from draft PR #202).

  And what a viewer receives about the other players of a game (players/game-audience.ts): a
  teammate's rank only with the right to their statistics, nothing from a personal-use player's
  linked account (nor the newer Riot ID of the games stored only for it), and nobody on the team
  named in a personal-use player's own games but for an administrator; the id-keyed routes
  (freshness, card banner, picture) and the lineup follow.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[], pathname: "/", riot: null as unknown, sync: null as null | ((...args: unknown[]) => Promise<unknown>) }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
// Linking an account syncs it at once when Riot is configured: a stand-in client and sync, for the one test that needs a rank on the new account.
vi.mock("@/server/riot/api/client", async (orig) => {
  const real = await orig<typeof import("@/server/riot/api/client")>();
  return { ...real, createRiotClient: (...args: Parameters<typeof real.createRiotClient>) => (state.riot as ReturnType<typeof real.createRiotClient>) ?? real.createRiotClient(...args) };
});
vi.mock("@/server/accounts/sync", async (orig) => {
  const real = await orig<typeof import("@/server/accounts/sync")>();
  return { ...real, syncAccount: (...args: Parameters<typeof real.syncAccount>) => (state.sync ? (state.sync(...args) as ReturnType<typeof real.syncAccount>) : real.syncAccount(...args)) };
});
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirects.push(to);
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => state.pathname,
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { accountMatches, lastKnownRanks, matchDetails, patches, playerCardBanners, players, rankSnapshots, riotAccounts, userAvatars, users, type MatchParticipantDetail } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import type { Capability } from "@/server/auth/permissions";
import { loadProfileHeader } from "@/server/players/profile-header";
import { headerIdentity, IdentitySync } from "@/components/players/profile-sections";
import { ProfileAccountsTab } from "@/components/players/profile-accounts-tab";
import { ProfileMatchesTab } from "@/components/players/profile-matches-tab";
import { getMatchDetail, type DetailParticipant, type MatchDetailView, type MatchHistoryPage } from "@/server/players/match-history";
import { LOOKUP_SOURCE } from "@/server/players/participant-ranks";
import { knownRiotIds } from "@/server/players/riot-names";
import { opggLinkFor } from "@/domain/opgg";
import { GET as freshnessRoute } from "@/app/api/freshness/route";
import { GET as bannerRoute } from "@/app/api/card-banners/[playerId]/route";
import { GET as avatarRoute } from "@/app/api/avatars/[userId]/route";
import * as playerActions from "@/server/actions/players";
import * as accountActions from "@/server/actions/accounts";
import * as matchActions from "@/server/actions/match-history";
import PlayerLayout from "@/app/(app)/players/[id]/layout";
import OverviewPage from "@/app/(app)/players/[id]/page";
import AccountsPage from "@/app/(app)/players/[id]/accounts/page";
import ChampionsPage from "@/app/(app)/players/[id]/champions/page";
import MatchesPage from "@/app/(app)/players/[id]/matches/page";
import PlayersPage from "@/app/(app)/players/page";

const RESTRICTED: Capability[] = ["view-team", "view-players", "view-matches", "edit-own-profile", "manage-own-riot-accounts"];
const MATCH = "OC1_900000001";

let handle: DbHandle;
const player: Record<string, string> = {};
const user: Record<string, string> = {};
const accountId: Record<string, string> = {};
const env: Record<string, string | undefined> = {};
let gameStart = 0;

async function signInAs(name: string | null) {
  state.cookies.clear();
  state.redirects = [];
  if (!name) return;
  const { token } = await createSession(handle.db, user[name]!);
  state.cookies.set(SESSION_COOKIE, token);
}

type Node = { type: unknown; props: Record<string, unknown> };
const isNode = (n: unknown): n is Node => !!n && typeof n === "object" && "type" in n && "props" in n;
const SYNC_SERVER = new Set<unknown>([IdentitySync]);

/**
 * The server side of a React tree, as far as this test needs it: server components (async ones,
 * and the sync ones listed) are called; every other component's props, and every text, are what
 * React would send to the browser. Returned as JSON.
 */
async function browserPayload(node: unknown): Promise<string> {
  const out: unknown[] = [];
  const walk = async (n: unknown): Promise<void> => {
    if (Array.isArray(n)) {
      for (const x of n) await walk(x);
      return;
    }
    if (typeof n === "string" || typeof n === "number") {
      out.push(n);
      return;
    }
    if (!isNode(n)) return;
    const { type, props } = n;
    if (typeof type === "function" && (type.constructor.name === "AsyncFunction" || SYNC_SERVER.has(type))) {
      await walk(await (type as (p: unknown) => unknown)(props));
      return;
    }
    const { children, ...rest } = props;
    if (typeof type !== "string" && typeof type !== "symbol") out.push({ component: (type as { name?: string; displayName?: string }).displayName ?? (type as { name?: string }).name ?? "?", props: rest });
    for (const value of Object.values(rest)) if (isNode(value)) await walk(value);
    await walk(children);
  };
  await walk(node);
  return JSON.stringify(out);
}

/** The props one client component received, from a payload. */
function propsOf(payload: string, component: string): Array<Record<string, unknown>> {
  return (JSON.parse(payload) as Array<{ component?: string; props?: Record<string, unknown> }>).filter((x) => x.component === component).map((x) => x.props!);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const search = { searchParams: Promise.resolve({}) };

/** What the layout and each tab page answer for this profile: "not found", a redirect, or rendered. */
async function pagesFor(id: string): Promise<string[]> {
  const answers: string[] = [];
  for (const run of [() => PlayerLayout({ children: "tab", ...params(id) }), () => OverviewPage({ ...params(id), ...search }), () => AccountsPage(params(id)), () => ChampionsPage({ ...params(id), ...search }), () => MatchesPage({ ...params(id), ...search })]) {
    try {
      const r = (await run()) as unknown;
      answers.push(r === "tab" ? "children" : isNode(r) && (r.props.header as { player?: { id?: string } } | undefined)?.player?.id === id ? "rendered" : `rendered something else: ${JSON.stringify(r)?.slice(0, 80)}`);
    } catch (err) {
      const message = (err as Error).message;
      answers.push(message === "NEXT_NOT_FOUND" ? "not found" : message.startsWith("NEXT_REDIRECT ") ? `redirect ${message.slice(14).split("?")[0]}` : `error: ${message}`);
    }
  }
  return answers;
}

const part = (puuid: string, name: string, teamId: number, championId: string, championKey: number, position: string): MatchParticipantDetail => ({ puuid, name, teamId, championId, championKey, champLevel: 16, position, win: teamId === 100, kills: 4, deaths: 3, assists: 7, cs: 180, gold: 11_000, damage: 18_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });

/** A later stored game with these players, strangers (new to UNIIVERSE) in the other places. */
const laterGame = (matchId: string, at: number, named: MatchParticipantDetail[]) => ({
  matchId,
  platform: "oc1",
  queueId: 420,
  gameCreation: at,
  gameDuration: 1800,
  gameVersion: "16.20.1",
  teams: [],
  participants: [...named, ...Array.from({ length: 10 - named.length }, (_, i) => part(`puuid-later-${matchId}-${i}`, `Later ${i}#OCE`, (named.length + i) % 2 ? 200 : 100, "Ahri", 103, "MIDDLE"))],
});

beforeAll(async () => {
  for (const k of ["UNIIVERSE_REQUIRE_AUTH", "DATABASE_URL", "UNIIVERSE_AUTH_SECRET", "RIOT_API_KEY"]) env[k] = process.env[k];
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.RIOT_API_KEY;
  handle = await testDb();
  state.db = handle.db;
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
  const teamId = (await getOrCreateTeam(db)).id;
  // Profiles: Ace (a ranked team member), the viewers' own profiles, and Solo (personal use, ranked too).
  for (const [name, role, champion] of [["ace", "MID", "Ahri"], ["mate", "TOP", "Riven"], ["rex", "JUNGLE", "Viego"], ["pam", "SUPPORT", "Thresh"], ["solo", "ADC", "Jinx"]] as const) {
    player[name] = (await createPlayer(db, teamId, { displayName: name[0]!.toUpperCase() + name.slice(1), primaryRole: role, primaryPool: [champion] })).id;
  }
  await setTeamMember(db, teamId, player.solo!, false);
  const accounts = [
    { name: "ace", puuid: "puuid-ace", tier: "GOLD", division: "II", lp: 45 },
    { name: "mate", puuid: "puuid-mate", tier: "SILVER", division: "I", lp: 70 },
    { name: "solo", puuid: "puuid-solo", tier: "PLATINUM", division: "IV", lp: 12 },
  ];
  for (const a of accounts) {
    const [row] = await db
      .insert(riotAccounts)
      .values({ ownerType: "player", playerId: player[a.name]!, gameName: a.name, tagLine: "OCE", platform: "oc1", puuid: a.puuid, label: "main", syncStatus: "ok", tier: a.tier, division: a.division, leaguePoints: a.lp, rankedWins: a.tier ? 31 : null, rankedLosses: a.tier ? 27 : null, rankQueue: a.tier ? "solo" : null, rankUpdatedAt: a.tier ? new Date() : null })
      .returning({ id: riotAccounts.id });
    accountId[a.name] = row!.id;
  }
  // Accounts: the Owner (no profile), each viewer's own, and Solo's.
  const accountRows: Array<{ name: string; role: "owner" | "player"; playerId: string | null; capabilities: Capability[] | null; groups?: string[] }> = [
    { name: "owner", role: "owner", playerId: null, capabilities: null },
    { name: "ace", role: "player", playerId: player.ace!, capabilities: RESTRICTED },
    { name: "mate", role: "player", playerId: player.mate!, capabilities: null },
    { name: "rex", role: "player", playerId: player.rex!, capabilities: RESTRICTED },
    { name: "pam", role: "player", playerId: player.pam!, capabilities: null, groups: ["player-manager"] },
    { name: "solo", role: "player", playerId: player.solo!, capabilities: null },
    // A Player Manager on the Restricted level (no teammates' statistics), and a Team Lineup Manager.
    { name: "rpm", role: "player", playerId: null, capabilities: RESTRICTED, groups: ["player-manager"] },
    { name: "lem", role: "player", playerId: null, capabilities: null, groups: ["lineup-manager"] },
  ];
  for (const a of accountRows) {
    const [row] = await db.insert(users).values({ username: `${a.name}_login`, displayName: a.name, role: a.role, playerId: a.playerId, setupCompletedAt: new Date(), customCapabilities: a.capabilities, accessGroups: a.groups ?? [] }).returning({ id: users.id });
    user[a.name] = row!.id;
  }
  // One game: Ace (blue mid) with Mate, against Solo, all on stored records, with strangers in the other places.
  const created = Date.now() - 86_400_000;
  gameStart = created;
  // Mate's and Solo's rank histories (their account syncs) before the game.
  await db.insert(rankSnapshots).values([
    { accountId: accountId.mate!, queue: "solo", tier: "SILVER", division: "I", leaguePoints: 70, wins: 31, losses: 27, capturedAt: new Date(created - 2 * 3_600_000) },
    { accountId: accountId.solo!, queue: "solo", tier: "PLATINUM", division: "IV", leaguePoints: 12, wins: 31, losses: 27, capturedAt: new Date(created - 3_600_000) },
  ]);
  for (const [name, championId, teamId, role] of [["ace", "Ahri", 100, "MID"], ["solo", "Jinx", 200, "ADC"]] as const) {
    await db.insert(accountMatches).values({ accountId: accountId[name]!, matchId: MATCH, gameCreation: created, queueId: 420, championId, role, win: teamId === 100, teamId, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 3, assists: 7 });
  }
  await db.insert(matchDetails).values({
    matchId: MATCH,
    platform: "oc1",
    queueId: 420,
    gameCreation: created,
    gameDuration: 1800,
    gameVersion: "16.20.1",
    teams: [],
    participants: [
      part("puuid-ace", "ace#OCE", 100, "Ahri", 103, "MIDDLE"),
      part("puuid-mate", "mate#OCE", 100, "Riven", 92, "TOP"),
      part("puuid-blue-jungle", "Blue Jungle#OCE", 100, "Viego", 234, "JUNGLE"),
      part("puuid-blue-bottom", "Blue Bottom#OCE", 100, "Jinx", 222, "BOTTOM"),
      part("puuid-blue-support", "Blue Support#OCE", 100, "Thresh", 412, "UTILITY"),
      part("puuid-solo", "solo#OCE", 200, "Jinx", 222, "BOTTOM"),
      part("puuid-stranger", "Stranger#OCE", 200, "Thresh", 412, "UTILITY"),
      part("puuid-red-top", "Red Top#OCE", 200, "Riven", 92, "TOP"),
      part("puuid-red-jungle", "Red Jungle#OCE", 200, "Viego", 234, "JUNGLE"),
      part("puuid-red-middle", "Red Middle#OCE", 200, "Ahri", 103, "MIDDLE"),
    ],
  });
}, 120_000);

afterAll(async () => {
  await handle.close();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("decision 1: a teammate's rank is a statistic", () => {
  it("a Restricted viewer receives no rank of a teammate: the header's identity on every tab, and the Riot Accounts tab", async () => {
    await signInAs("rex");
    const frame = await browserPayload(await PlayerLayout({ children: null, ...params(player.ace!) }));
    const [header] = propsOf(frame, "ProfileHeader");
    expect(header!.identity).toMatchObject({ playerId: player.ace, showRank: false, rank: null });
    expect(propsOf(frame, "ProfileIdentityProvider")[0]!.initial).toMatchObject({ showRank: false, rank: null });
    const tab = await browserPayload(await AccountsPage(params(player.ace!)));
    expect(propsOf(tab, "ProfileIdentitySync")[0]!.identity).toMatchObject({ showRank: false, rank: null });
    const [panel] = propsOf(tab, "RiotAccountsPanel");
    expect(panel!.accounts).toEqual([expect.objectContaining({ riotId: "ace#OCE", tier: null, division: null, leaguePoints: null, rankedWins: null, rankedLosses: null, rankQueue: null, rankUpdatedAt: null })]);
    // Nothing of the rank anywhere in what reaches the browser, and no "Unranked" in its place.
    for (const payload of [frame, tab]) {
      expect(payload).not.toMatch(/GOLD|Gold/);
      expect(payload).not.toMatch(/Unranked/);
    }
    // The other tabs' identity too (each tab hands the header its own).
    for (const page of [() => OverviewPage({ ...params(player.ace!), ...search }), () => ChampionsPage({ ...params(player.ace!), ...search }), () => MatchesPage({ ...params(player.ace!), ...search })]) {
      const tabNode = (await page()) as Node;
      const fragment = (await (tabNode.type as (p: unknown) => Promise<Node>)(tabNode.props)) as Node;
      const [sync] = fragment.props.children as Node[];
      const identity = await browserPayload(sync);
      expect(propsOf(identity, "ProfileIdentitySync")[0]!.identity).toMatchObject({ playerId: player.ace, showRank: false, rank: null });
      expect(identity).not.toMatch(/GOLD/);
    }
  });

  it("the header leaves a hidden rank out on the Overview and the compact band, and says Unranked only for a player with no rank", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ProfileHeader } = await import("@/components/players/profile-header");
    const header = (await loadProfileHeader(handle.db, player.ace!))!;
    await signInAs("rex");
    const { getSession } = await import("@/server/auth/session");
    const hidden = headerIdentity(header, await getSession());
    await signInAs("mate");
    const shown = headerIdentity(header, await getSession());
    const unranked = { ...shown, rank: null };
    const basePath = `/players/${player.ace}`;
    for (const pathname of [basePath, `${basePath}/accounts`]) {
      state.pathname = pathname;
      const html = (identity: typeof shown) => renderToStaticMarkup(createElement(ProfileHeader, { identity, self: false, basePath }));
      expect(html(hidden), pathname).not.toContain('data-testid="profile-rank"');
      expect(html(hidden), pathname).not.toMatch(/Unranked|Gold/);
      expect(html(shown), pathname).toContain("Gold II");
      expect(html(unranked), pathname).toContain("Unranked");
    }
    state.pathname = "/";
  });

  it("a Standard viewer still receives it, without the ranked wins and losses the header never used", async () => {
    await signInAs("mate");
    const frame = await browserPayload(await PlayerLayout({ children: null, ...params(player.ace!) }));
    const identity = propsOf(frame, "ProfileHeader")[0]!.identity as { showRank: boolean; rank: Record<string, unknown> | null };
    expect(identity).toMatchObject({ showRank: true, rank: { tier: "GOLD", division: "II", leaguePoints: 45, queue: "solo" } });
    expect(Object.keys(identity.rank!).sort()).toEqual(["asOf", "division", "leaguePoints", "queue", "tier"]);
    const tab = await browserPayload(await AccountsPage(params(player.ace!)));
    expect(propsOf(tab, "RiotAccountsPanel")[0]!.accounts).toEqual([expect.objectContaining({ tier: "GOLD", division: "II", leaguePoints: 45, rankedWins: 31, rankedLosses: 27, rankQueue: "solo" })]);
  });

  it("the Players directory: a Restricted viewer gets no teammate's rank, on the card or the phone row, and never 'Unranked' in its place", async () => {
    type Entry = { player: { id: string }; showRank: boolean; rank: unknown };
    const directory = async () => {
      const payload = await browserPayload(await PlayersPage({ searchParams: Promise.resolve({}) }));
      const [props] = propsOf(payload, "PlayersDirectory");
      return { payload, props: props!, entries: props!.entries as Entry[] };
    };
    await signInAs("rex");
    const hidden = await directory();
    const ace = hidden.entries.find((e) => e.player.id === player.ace)!;
    expect(ace).toMatchObject({ showRank: false, rank: null });
    expect(hidden.payload).not.toMatch(/GOLD/);
    await signInAs("mate");
    const shown = await directory();
    expect(shown.entries.find((e) => e.player.id === player.ace)).toMatchObject({ showRank: true, rank: { tier: "GOLD", division: "II" } });
    // Rendered, desktop card and phone row alike: the hidden rank leaves no "Unranked" behind;
    // a player shown with no rank on record still says it.
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { PlayersDirectory } = await import("@/components/players/players-directory");
    const render = (entry: Entry) => renderToStaticMarkup(createElement(PlayersDirectory, { ...(hidden.props as object), entries: [entry] } as never));
    expect(render(ace)).not.toMatch(/Unranked|Gold/);
    expect(render({ ...ace, showRank: true, rank: null })).toMatch(/Unranked/);
  });

  it("one's own rank always, even on a level without teammates' statistics", async () => {
    await signInAs("ace");
    const header = (await loadProfileHeader(handle.db, player.ace!))!;
    const { getSession } = await import("@/server/auth/session");
    const session = await getSession();
    expect(session?.capabilities).not.toContain("view-teammate-stats");
    expect(headerIdentity(header, session)).toMatchObject({ showRank: true, rank: { tier: "GOLD" } });
    const tab = await browserPayload(await ProfileAccountsTab({ db: handle.db, header, session }));
    expect(propsOf(tab, "RiotAccountsPanel")[0]!.accounts).toEqual([expect.objectContaining({ tier: "GOLD", rankedWins: 31 })]);
    // A teammate's stays hidden for the same account.
    const other = (await loadProfileHeader(handle.db, player.mate!))!;
    expect(headerIdentity(other, session)).toMatchObject({ showRank: false, rank: null });
  });
});

describe("decision 2: a personal-use profile is its player's and the administrators' only", () => {
  it("the layout and every tab page answer 'not found' to a member, a Restricted Player and a Player Manager", async () => {
    for (const name of ["mate", "rex", "pam"]) {
      await signInAs(name);
      expect(await pagesFor(player.solo!), name).toEqual(["not found", "not found", "not found", "not found", "not found"]);
    }
  });

  it("its player opens it (as My Profile) and the Owner opens it", async () => {
    await signInAs("solo");
    expect(await pagesFor(player.solo!)).toEqual(["children", "redirect /overview", "redirect /overview/accounts", "redirect /overview/champions", "redirect /overview/matches"]);
    await signInAs("owner");
    expect(await pagesFor(player.solo!)).toEqual(["rendered", "rendered", "rendered", "rendered", "rendered"]);
    // A team member's profile is unchanged for members.
    await signInAs("rex");
    expect(await pagesFor(player.ace!)).toEqual(["rendered", "rendered", "rendered", "rendered", "rendered"]);
  });

  const reads = (id: string) => [
    () => matchActions.getMatchDetailAction(id, MATCH),
    () => matchActions.getMatchTimelineAction(id, MATCH),
    () => matchActions.getMatchGroupsAction(id, MATCH),
    () => matchActions.getMatchMeetingsAction(id, MATCH, { season: 16, mode: "all", accountId: null }),
    () => matchActions.getMatchRanksAction(id, MATCH),
  ];
  const NOT_IN_HISTORY = { status: "not-found", message: "This match is not in this player's history." };

  it("the match actions refuse a member, a Restricted Player and a Player Manager, and answer its player and the Owner", async () => {
    for (const name of ["mate", "rex", "pam"]) {
      await signInAs(name);
      for (const read of reads(player.solo!)) {
        const r = await read();
        // The Restricted Player was refused before too, for want of teammates' statistics.
        if (name === "rex") expect(r, name).toMatchObject({ status: "not-found" });
        else expect(r, name).toEqual(NOT_IN_HISTORY);
      }
      for (const refresh of [matchActions.refreshMatchesAction, matchActions.catchUpFiguresAction]) expect((await refresh(player.solo!)).status, name).toBe("unavailable");
    }
    // The Player Manager may refresh team members' profiles, not this one.
    await signInAs("pam");
    expect(await matchActions.refreshMatchesAction(player.solo!)).toEqual({ status: "unavailable", message: "This profile cannot be refreshed." });
    expect(await matchActions.catchUpFiguresAction(player.solo!)).toEqual({ status: "unavailable", message: "This profile cannot be refreshed." });
    for (const name of ["solo", "owner"]) {
      await signInAs(name);
      expect(await matchActions.getMatchDetailAction(player.solo!, MATCH), name).toMatchObject({ status: "ok" });
      expect(await matchActions.getMatchGroupsAction(player.solo!, MATCH), name).toMatchObject({ status: "ok" });
      expect(await matchActions.getMatchMeetingsAction(player.solo!, MATCH, { season: 16, mode: "all", accountId: null }), name).toMatchObject({ status: "ok" });
      expect(await matchActions.getMatchRanksAction(player.solo!, MATCH), name).toMatchObject({ status: "ok" });
      expect(await matchActions.refreshMatchesAction(player.solo!), name).not.toEqual({ status: "unavailable", message: "This profile cannot be refreshed." });
    }
  });

  it("the profile and Riot account actions refuse a Player Manager, and still serve its player and the Owner", async () => {
    await signInAs("pam");
    const refused = { ok: false, error: "Player not found." };
    expect(await playerActions.cardPreviewFiguresAction(player.solo!, null)).toEqual(refused);
    expect(await playerActions.setCardStyleAction(player.solo!, { featuredChampionId: null })).toEqual(refused);
    expect(await playerActions.saveProfilePatchAction(player.solo!, {}, null)).toEqual(refused);
    expect(await playerActions.archivePlayerAction(player.solo!, false)).toEqual(refused);
    expect(await accountActions.reorderAccountsAction(player.solo!, [accountId.solo!])).toEqual(refused);
    expect(await accountActions.addPlayerAccountAction(player.solo!, { riotId: "Sneaky#OCE" })).toEqual(refused);
    // Nothing was linked.
    expect((await handle.db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, player.solo!))).length).toBe(1);
    // The same Player Manager on a team member's profile: as before.
    expect(await playerActions.cardPreviewFiguresAction(player.ace!, null)).toMatchObject({ ok: true });
    expect(await accountActions.reorderAccountsAction(player.ace!, [accountId.ace!])).toMatchObject({ ok: true });
    // A member without the right is refused as before (by their capability).
    await signInAs("mate");
    expect(await playerActions.setCardStyleAction(player.solo!, { featuredChampionId: null })).toMatchObject({ ok: false });
    for (const name of ["solo", "owner"]) {
      await signInAs(name);
      expect(await playerActions.cardPreviewFiguresAction(player.solo!, null), name).toMatchObject({ ok: true });
      expect(await playerActions.setCardStyleAction(player.solo!, { featuredChampionId: null }), name).toEqual({ ok: true });
      expect(await accountActions.reorderAccountsAction(player.solo!, [accountId.solo!]), name).toMatchObject({ ok: true });
    }
    await signInAs("owner");
    expect(await playerActions.archivePlayerAction(player.solo!, false)).toEqual({ ok: true });
  });

  it("the scoreboard names and links current team members only: a personal-use player in the game stays a stranger (draft PR #202's rule)", async () => {
    const r = await getMatchDetail(handle.db, player.ace!, MATCH, { viewerIsOwner: true });
    expect(r.status).toBe("ok");
    const everyone = (r as { view: MatchDetailView }).view.teams.flatMap((t) => t.participants);
    expect(everyone.find((p) => p.name === "solo#OCE")).toMatchObject({ teamMember: null, memberId: null });
    expect(everyone.find((p) => p.name === "mate#OCE")).toMatchObject({ teamMember: "Mate", memberId: player.mate });
    expect(everyone.find((p) => p.name === "Stranger#OCE")).toMatchObject({ teamMember: null, memberId: null });
  });
});

describe("what a viewer receives about the other players of a game (players/game-audience.ts)", () => {
  const everyoneIn = (r: Awaited<ReturnType<typeof matchActions.getMatchDetailAction>>): DetailParticipant[] => {
    if (r.status !== "ok") throw new Error(`${r.status}: ${r.message}`);
    return r.view.teams.flatMap((t) => t.participants);
  };
  const named = (everyone: DetailParticipant[], name: string) => everyone.find((p) => p.name === name)!;
  const ranksOf = async (id: string) => {
    const r = await matchActions.getMatchRanksAction(id, MATCH);
    if (r.status !== "ok") throw new Error(r.message);
    return new Map(r.ranks.map((x) => [x.slot, x.rank]));
  };
  /** The Match History tab's cards as they reach the browser: the game's row. */
  const cardOf = async (id: string) => {
    const { getSession } = await import("@/server/auth/session");
    const session = await getSession();
    const header = (await loadProfileHeader(handle.db, id))!;
    const payload = await browserPayload(await ProfileMatchesTab({ db: handle.db, header, session, basePath: session?.playerId === id ? "/overview" : `/players/${id}`, search: {} }));
    const data = propsOf(payload, "MatchHistoryView")[0]!.data as MatchHistoryPage;
    return { data, row: data.rows.find((r) => r.matchId === MATCH)! };
  };
  const SLOT = { ace: 0, mate: 1, solo: 5, stranger: 6 };

  it("a viewer without teammates' statistics gets no teammate's rank in their own games: scoreboard, rank check and cards", async () => {
    await signInAs("ace");
    const everyone = everyoneIn(await matchActions.getMatchDetailAction(player.ace!, MATCH));
    // Mate is named and linked as a team member, and their rank is left out (null), not "unknown" or "Unranked".
    expect(named(everyone, "mate#OCE")).toMatchObject({ teamMember: "Mate", memberId: player.mate, rank: null });
    // One's own always.
    expect(named(everyone, "ace#OCE").rank).toMatchObject({ state: "ranked", tier: "GOLD" });
    const ranks = await ranksOf(player.ace!);
    expect(ranks.has(SLOT.mate)).toBe(false);
    expect(ranks.get(SLOT.ace)).toMatchObject({ state: "ranked", tier: "GOLD" });
    // The game's card: Mate's place carries no rank.
    const { row } = await cardOf(player.ace!);
    const mateSlot = row.teams!.blue.find((s) => s.member?.id === player.mate)!;
    expect(mateSlot).toBeDefined();
    expect(mateSlot.rank).toBeUndefined();
    expect(JSON.stringify(row)).not.toMatch(/SILVER/);
    // A Standard viewer (Mate, opening Ace's game) receives both, Mate's as recorded before the game.
    await signInAs("mate");
    const shown = everyoneIn(await matchActions.getMatchDetailAction(player.ace!, MATCH));
    expect(named(shown, "mate#OCE").rank).toMatchObject({ state: "ranked", tier: "SILVER", division: "I", leaguePoints: 70, timing: "before" });
    expect(named(shown, "ace#OCE").rank).toMatchObject({ state: "ranked", tier: "GOLD" });
    expect((await ranksOf(player.ace!)).get(SLOT.mate)).toMatchObject({ tier: "SILVER", timing: "before" });
    expect((await cardOf(player.ace!)).row.teams!.blue.find((s) => s.member?.id === player.mate)!.rank).toMatchObject({ tier: "SILVER" });
  });

  it("a personal-use player in a teammate's game: no rank or Riot ID from their linked account, nor from games stored only for them", async () => {
    // Solo renamed after the game; Riot confirmed the account's server. Solo's own sync then
    // stored a later game of theirs under the new name, with nobody from the team in it: a game
    // UNIIVERSE holds only because Solo's personal-use account syncs.
    const LATER = "OC1_900000002";
    await handle.db.update(riotAccounts).set({ gameName: "SoloRenamed", tagLine: "NEW", platformSource: "riot" }).where(eq(riotAccounts.id, accountId.solo!));
    await handle.db.insert(accountMatches).values({ accountId: accountId.solo!, matchId: LATER, gameCreation: gameStart + 3_600_000, queueId: 420, championId: "Jinx", role: "ADC", win: true, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 3, assists: 7 });
    await handle.db.insert(matchDetails).values(laterGame(LATER, gameStart + 3_600_000, [part("puuid-solo", "SoloRenamed#NEW", 100, "Jinx", 222, "BOTTOM")]));
    try {
      await signInAs("mate");
      const solo = named(everyoneIn(await matchActions.getMatchDetailAction(player.ace!, MATCH)), "solo#OCE");
      // As the stranger beside them: no profile, the Riot ID the match recorded, and no rank read yet.
      expect(solo).toMatchObject({ teamMember: null, memberId: null, opgg: "https://op.gg/lol/summoners/oce/solo-OCE", rank: { state: "unknown", timing: null } });
      expect(named(everyoneIn(await matchActions.getMatchDetailAction(player.ace!, MATCH)), "Stranger#OCE")).toMatchObject({ teamMember: null, opgg: "https://op.gg/lol/summoners/oce/Stranger-OCE", rank: { state: "unknown" } });
      expect((await ranksOf(player.ace!)).get(SLOT.solo)).toMatchObject({ state: "unknown" });
      const card = (await cardOf(player.ace!)).row.teams!.red.find((s) => s.slot === SLOT.solo)!;
      expect(card).toMatchObject({ member: null, opgg: "https://op.gg/lol/summoners/oce/solo-OCE", rank: { state: "unknown" } });
      // A check of the game's players (as for anyone) is what they show once it is made.
      await handle.db.insert(lastKnownRanks).values({ puuid: "puuid-solo", tier: "EMERALD", division: "IV", leaguePoints: 10, flexTier: "UNRANKED", observedAt: new Date(gameStart + 2 * 3_600_000), source: LOOKUP_SOURCE });
      expect(named(everyoneIn(await matchActions.getMatchDetailAction(player.ace!, MATCH)), "solo#OCE").rank).toMatchObject({ state: "ranked", tier: "EMERALD", kind: "check" });
      expect((await ranksOf(player.ace!)).get(SLOT.solo)).toMatchObject({ tier: "EMERALD" });
      const after = await cardOf(player.ace!);
      expect(after.row.teams!.red.find((s) => s.slot === SLOT.solo)!.rank).toMatchObject({ tier: "EMERALD" });
      // Nothing of their linked account anywhere in the window or the cards.
      for (const payload of [JSON.stringify(await matchActions.getMatchDetailAction(player.ace!, MATCH)), JSON.stringify(await matchActions.getMatchRanksAction(player.ace!, MATCH)), JSON.stringify(after.data)]) {
        expect(payload).not.toMatch(/PLATINUM|SoloRenamed/);
      }
    } finally {
      await handle.db.delete(lastKnownRanks).where(eq(lastKnownRanks.puuid, "puuid-solo"));
      await handle.db.delete(accountMatches).where(eq(accountMatches.matchId, LATER));
      await handle.db.delete(matchDetails).where(eq(matchDetails.matchId, LATER));
      await handle.db.update(riotAccounts).set({ gameName: "solo", tagLine: "OCE", platformSource: "user" }).where(eq(riotAccounts.id, accountId.solo!));
    }
  });

  it("Team → Matches (knownRiotIds without `linked`) reads current team members' accounts only: a personal-use or archived player keeps the Riot ID the match recorded", async () => {
    const db = handle.db;
    const LATER = "OC1_900000003";
    // After the game Ace (a member), Mate (archived here) and Solo (personal use) renamed, Riot
    // confirming each account's server; Mate's and Solo's own syncs stored a later game under the
    // new names, and a stranger in it renamed too.
    try {
      for (const name of ["ace", "mate", "solo"]) await db.update(riotAccounts).set({ gameName: `${name}Renamed`, tagLine: "NEW", platformSource: "riot" }).where(eq(riotAccounts.id, accountId[name]!));
      await db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, player.mate!));
      await db.insert(matchDetails).values(laterGame(LATER, gameStart + 2 * 3_600_000, [part("puuid-mate", "mateRenamed#NEW", 100, "Riven", 92, "TOP"), part("puuid-solo", "soloRenamed#NEW", 200, "Jinx", 222, "BOTTOM"), part("puuid-stranger", "Stranger Renamed#OCE", 100, "Thresh", 412, "UTILITY")]));
      const known = await knownRiotIds(db, ["puuid-ace", "puuid-mate", "puuid-solo", "puuid-stranger"], gameStart);
      // A current member: their account's newer Riot ID, on the server Riot confirmed.
      expect(known.get("puuid-ace")).toEqual({ riotId: "aceRenamed#NEW", platform: "oc1" });
      // The archived and the personal-use player: nothing, so the game's own Riot ID.
      expect(known.has("puuid-mate")).toBe(false);
      expect(known.has("puuid-solo")).toBe(false);
      expect(opggLinkFor("solo#OCE", "oc1", known.get("puuid-solo"))).toBe("https://op.gg/lol/summoners/oce/solo-OCE");
      expect(opggLinkFor("mate#OCE", "oc1", known.get("puuid-mate"))).toBe("https://op.gg/lol/summoners/oce/mate-OCE");
      // A stranger: the newer stored game's, as before.
      expect(known.get("puuid-stranger")).toEqual({ riotId: "Stranger Renamed#OCE", platform: "oc1" });
    } finally {
      await db.delete(matchDetails).where(eq(matchDetails.matchId, LATER));
      await db.update(players).set({ archivedAt: null }).where(eq(players.id, player.mate!));
      for (const name of ["ace", "mate", "solo"]) await db.update(riotAccounts).set({ gameName: name, tagLine: "OCE", platformSource: "user" }).where(eq(riotAccounts.id, accountId[name]!));
    }
  });

  it("a personal-use player's own games name nobody on the team, and read the team's players as any other players", async () => {
    await signInAs("solo");
    const everyone = everyoneIn(await matchActions.getMatchDetailAction(player.solo!, MATCH));
    for (const name of ["ace#OCE", "mate#OCE"]) expect(named(everyone, name), name).toMatchObject({ teamMember: null, memberId: null, rank: { state: "unknown" } });
    expect(named(everyone, "ace#OCE").opgg).toBe("https://op.gg/lol/summoners/oce/ace-OCE");
    // Their own rank, from their own account.
    expect(named(everyone, "solo#OCE")).toMatchObject({ isPlayer: true, rank: { state: "ranked", tier: "PLATINUM" } });
    const ranks = await ranksOf(player.solo!);
    expect(ranks.get(SLOT.ace)).toMatchObject({ state: "unknown" });
    expect(ranks.get(SLOT.mate)).toMatchObject({ state: "unknown" });
    // The cards: no member in any place, and no team member offered in Refine.
    const { data, row } = await cardOf(player.solo!);
    expect([...row.teams!.blue, ...row.teams!.red].filter((s) => s.member)).toEqual([]);
    expect(data.memberOptions).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/GOLD|SILVER|"Ace"|"Mate"/);
  });

  it("an administrator still sees the team members in a personal-use player's games named, linked and ranked", async () => {
    await signInAs("owner");
    const everyone = everyoneIn(await matchActions.getMatchDetailAction(player.solo!, MATCH));
    expect(named(everyone, "ace#OCE")).toMatchObject({ teamMember: "Ace", memberId: player.ace, rank: { state: "ranked", tier: "GOLD" } });
    expect(named(everyone, "mate#OCE")).toMatchObject({ teamMember: "Mate", memberId: player.mate, rank: { state: "ranked", tier: "SILVER", timing: "before" } });
    expect(named(everyone, "Stranger#OCE")).toMatchObject({ teamMember: null, memberId: null });
    const ranks = await ranksOf(player.solo!);
    expect(ranks.get(SLOT.ace)).toMatchObject({ state: "ranked", tier: "GOLD" });
    expect(ranks.get(SLOT.mate)).toMatchObject({ state: "ranked", tier: "SILVER" });
    // The cards: both members in their places with their ranks; Refine offers Ace, whose account
    // stored the game (Refine counts members' stored games).
    const { data, row } = await cardOf(player.solo!);
    expect(row.teams!.blue.find((s) => s.slot === SLOT.ace)).toMatchObject({ member: { id: player.ace }, rank: { tier: "GOLD" } });
    expect(row.teams!.blue.find((s) => s.slot === SLOT.mate)).toMatchObject({ member: { id: player.mate }, rank: { tier: "SILVER" } });
    expect(data.memberOptions).toEqual([expect.objectContaining({ id: player.ace, with: 0, against: 1 })]);
  });

  it("/api/freshness answers about a personal-use player only to that player and administrators", async () => {
    const ask = (id: string) => freshnessRoute(new Request(`http://localhost/api/freshness?scope=player:${id}`));
    for (const name of ["mate", "pam"]) {
      await signInAs(name);
      const refused = await ask(player.solo!);
      expect(refused.status, name).toBe(403);
      expect(await refused.json()).toEqual({ error: "Not allowed" });
      expect((await ask(player.ace!)).status, name).toBe(200);
    }
    for (const name of ["solo", "owner"]) {
      await signInAs(name);
      expect((await ask(player.solo!)).status, name).toBe(200);
    }
  });

  it("a personal-use player's card banner and picture reach only that player and administrators", async () => {
    const png = Buffer.from("not-really-a-png");
    await handle.db.insert(playerCardBanners).values([player.solo!, player.ace!].map((playerId) => ({ playerId, contentType: "image/png", data: png })));
    await handle.db.insert(userAvatars).values([user.solo!, user.ace!].map((userId) => ({ userId, contentType: "image/png", data: png })));
    try {
      const banner = (id: string) => bannerRoute(new Request(`http://localhost/api/card-banners/${id}?v=1`), { params: Promise.resolve({ playerId: id }) });
      const picture = (id: string) => avatarRoute(new Request(`http://localhost/api/avatars/${id}?v=1`), { params: Promise.resolve({ userId: id }) });
      for (const name of ["rex", "pam"]) {
        await signInAs(name);
        expect((await banner(player.solo!)).status, name).toBe(404);
        expect((await picture(user.solo!)).status, name).toBe(404);
        expect((await banner(player.ace!)).status, name).toBe(200);
        expect((await picture(user.ace!)).status, name).toBe(200);
      }
      for (const name of ["solo", "owner"]) {
        await signInAs(name);
        expect((await banner(player.solo!)).status, name).toBe(200);
        expect((await picture(user.solo!)).status, name).toBe(200);
      }
    } finally {
      await handle.db.delete(playerCardBanners);
      await handle.db.delete(userAvatars);
    }
  });

  it("the lineup refuses a personal-use player without naming them or saying why", async () => {
    await signInAs("lem");
    const refused = { ok: false, error: "That player is not on the team, so they cannot join the lineup." };
    expect(await playerActions.setLineupSlotAction("ADC", player.solo!)).toEqual(refused);
    expect(await playerActions.setLineupSubstituteAction("ADC", player.solo!)).toEqual(refused);
    // Brought in from the bench in place of a starter: the same, before any role is compared.
    expect(await playerActions.setLineupSlotAction("MID", player.ace!)).toEqual({ ok: true });
    expect(await playerActions.setLineupSlotAction("MID", player.solo!, { replacing: player.ace! })).toEqual(refused);
    // A player who no longer exists is answered the same way.
    expect(await playerActions.setLineupSlotAction("ADC", "00000000-0000-4000-8000-000000000000")).toEqual(refused);
    expect(await playerActions.setLineupSlotAction("MID", null)).toEqual({ ok: true });
  });

  it("linking an account answers without its rank to a Player Manager without teammates' statistics", async () => {
    // A stand-in sync that finds the new account ranked.
    state.riot = {};
    state.sync = async (...args: unknown[]) => {
      const account = args[2] as { id: string };
      await handle.db.update(riotAccounts).set({ puuid: `puuid-${account.id}`, syncStatus: "ok", tier: "DIAMOND", division: "III", leaguePoints: 5, rankedWins: 50, rankedLosses: 40, rankQueue: "solo", rankUpdatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
      return { status: "ok" };
    };
    try {
      await signInAs("rpm");
      const hidden = await accountActions.addPlayerAccountAction(player.ace!, { riotId: "AceAlt#OCE" });
      expect(hidden).toMatchObject({ ok: true, data: { riotId: "AceAlt#OCE", tier: null, division: null, leaguePoints: null, rankedWins: null, rankedLosses: null, rankQueue: null, rankUpdatedAt: null } });
      expect(JSON.stringify(hidden)).not.toMatch(/DIAMOND/);
      await signInAs("pam");
      expect(await accountActions.addPlayerAccountAction(player.ace!, { riotId: "AceAltTwo#OCE" })).toMatchObject({ ok: true, data: { tier: "DIAMOND", division: "III", leaguePoints: 5, rankedWins: 50 } });
    } finally {
      state.riot = null;
      state.sync = null;
      await handle.db.delete(riotAccounts).where(and(eq(riotAccounts.playerId, player.ace!), ne(riotAccounts.id, accountId.ace!)));
    }
  });
});
